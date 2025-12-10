import config from '../config.json' with { type: 'json' };
import {
  ChatClient,
  AlternateMessageModifier,
  SlowModeRateLimiter,
  PrivmsgMessageRateLimiter,
  UserStateTracker,
  JoinRateLimiter,
  ConnectionRateLimiter
} from '@mastondzn/dank-twitch-irc';
import { sleep, timeLog } from './utils.js';
import { getJoinedChannels, refreshUsername, addChannel } from './db/dbManager.js';

// Backoff + readiness state
let isReady = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let authAttempts = 0;

function scheduleReconnect(reason: string) {
  if (reconnectTimer) return; // already scheduled
  const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts)) + Math.floor(Math.random() * 500);
  reconnectAttempts++;
  timeLog(`Reconnecting in ${delay}ms (${reason})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    try {
      client.connect();
    } catch (e) {
      // If connect throws synchronously, schedule again
      scheduleReconnect('connect() threw');
    }
  }, delay);
}

function clearReconnectBackoff() {
  reconnectAttempts = 0;
  authAttempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * @typedef {import('@mastondzn/dank-twitch-irc').ChatClient} ChatClient
 */
const client = new ChatClient({
  username: config.username.toLowerCase(),
  password: config.helix.access_token, // ensure this is "oauth:XXXXXXXX"
  ignoreUnhandledPromiseRejections: true,
  rateLimits: 'default', 
  requestMembershipCapability: true,
  installDefaultMixins: false
});

const privmsgRL = new PrivmsgMessageRateLimiter(client);
privmsgRL.applyToClient(client);
//client.use(new AlternateMessageModifier(client)); // BROKEN I GUESS
client.use(new SlowModeRateLimiter(client, 3));
client.use(new UserStateTracker(client));
client.use(new ConnectionRateLimiter(client));
client.use(new JoinRateLimiter(client));
client.connect();

client.on('error', (err) => {
  const msg = String(err?.message ?? '').trim();
  timeLog(`Dank error: ${msg}`);

  const lower = msg.toLowerCase();

  // Handle auth/login errors with limited retries
  if (lower.includes('login') || lower.includes('auth')) {
    authAttempts++;
    if (authAttempts >= 6) {
      timeLog('Fatal: Twitch authentication failed repeatedly. Exiting.');
      process.exit(1);
    }
    isReady = false;
    scheduleReconnect('auth/login error');
    return;
  }

  // Transient network/keepalive/cap errors -> reconnect with backoff
  if (
    lower.includes('pong') ||
    lower.includes('capabilities') ||
    lower.includes('econnreset') ||
    lower.includes('timed out') ||
    lower.includes('socket hang up')
  ) {
    isReady = false;
    scheduleReconnect(msg);
  }
});

// If the library emits a close/disconnect event, also backoff-reconnect
// Many versions emit 'close' on connection loss.
client.on('close', () => {
  isReady = false;
  scheduleReconnect('connection closed');
});

client.on('ready', async () => {
  isReady = true;
  clearReconnectBackoff();
  timeLog('Connected to Twitch');

  try {
    // Ensure the bot's own account is marked as joined in the DB so it will
    // always be included in getJoinedChannels() on reconnects.
    if (config.id) {
      await addChannel(config.id);
    }
  } catch (err: any) {
    timeLog(`Error ensuring bot join in DB: ${err}`);
  }

  return joinChannels();
});

async function ensureReady(timeoutMs = 15000) {
  if (isReady) return;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('wait for ready timed out'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      client.off('ready', onReady as any);
    };
    client.once('ready', onReady as any);
  }).catch(() => {});
}

async function joinChannels() {
  // Wait a bit if we’re not ready yet (e.g., reconnect in progress)
  if (!isReady) {
    await ensureReady().catch(() => {});
  }

  const channels = getJoinedChannels();
  if (!channels.length) {
    timeLog('No channels to join in database');
    return;
  }

  for (const ch of channels) {
    try {
      let username = ch.username;
      if (!username) {
        username = (await refreshUsername(ch.id)) ?? undefined;
      }

      if (!username) {
        timeLog(`Skipping join for id ${ch.id}: username missing`);
        continue;
      }

      try {
        // Small pacing between JOINs
        await sleep(600);
        await client.join(username);
        timeLog(`JOINED #${username}`);
      } catch (joinErr: any) {
        const jMsg = String(joinErr?.message ?? joinErr);
        // If we weren’t connected, wait for ready and retry once
        if (!isReady || /not connected|socket|closed|pong|timed out/i.test(jMsg)) {
          timeLog(`Join failed for #${username} due to connection; waiting for ready and retrying...`);
          await ensureReady().catch(() => {});
          try {
            await sleep(800);
            await client.join(username);
            timeLog(`JOIN retry OK #${username}`);
            continue;
          } catch (e2) {
            timeLog(`Retry join failed for #${username}: ${e2}`);
          }
        }

        timeLog(`Join failed for #${username}, attempting refresh for id ${ch.id}: ${joinErr}`);
        const fresh = await refreshUsername(ch.id);
        if (!fresh) {
          timeLog(`Refresh failed for id ${ch.id}, skipping join`);
          continue;
        }
        try {
          await sleep(800);
          await client.join(fresh);
          timeLog(`JOIN after refresh OK #${fresh}`);
        } catch (secondErr) {
          timeLog(`Second join attempt failed for #${fresh}: ${secondErr}`);
        }
      }
    } catch (err) {
      timeLog(`Error joining ${ch.username ?? ch.id}: ${err}`);
    }
  }
}

// appending U+034F for duplicate messages
const duplicateState = new Map<string, { last: string; nextAppend: boolean }>();

export async function saySafe(channel: string, text: string, replyMsgId?: string) {
  try {
    const chKey = channel.toLowerCase();

    const baseText = text;
    const state = duplicateState.get(chKey);

    let sendText = baseText;

    if (!state || state.last !== baseText) {
      // New message for this channel -> store and set next to append
      duplicateState.set(chKey, { last: baseText, nextAppend: true });
      sendText = baseText;
    } else {
      // Same as last message -> alternate appending
      if (state.nextAppend) {
        sendText = `${baseText} \u034F`;
        state.nextAppend = false;
      } else {
        sendText = baseText;
        state.nextAppend = true;
      }
      // Keep last as baseText
      duplicateState.set(chKey, state);
    }

    // sanitize control chars that would break IRC commands
    sendText = sendText.replace(/\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (replyMsgId) {
      await client.reply(channel, replyMsgId, sendText); 
    } else {
      await client.say(channel, sendText);
    }
    return;
  } catch (err: any) {
    if (
      err?.cause?.message?.includes('Timed out after waiting for response') ||
      String(err?.message || '').toLowerCase().includes('timed out after waiting for response')
    ) {
      timeLog(`say timeout (likely duplicate blocked or shadowban) [#${channel}]: ${text}`);
      return;
    }
    timeLog(`Failed to say [#${channel}]: ${text} -> ${err}`);
  }
}

export { client };
