import config from '../config.json' with { type: 'json' };
import {
  ChatClient,
  AlternateMessageModifier,
  SlowModeRateLimiter
} from '@mastondzn/dank-twitch-irc';
import { sleep, timeLog } from './utils.js';
import { getJoinedChannels, refreshUsername } from './db/dbManager.js';

if (!config.username || !config.ttg.access_token) {
  throw new Error('Missing username or access_token in config.json');
}

/**
 * @typedef {import('@mastondzn/dank-twitch-irc').ChatClient} ChatClient
 */
const client = new ChatClient({
  username: config.username.toLowerCase(),
  password: config.ttg.access_token,
  ignoreUnhandledPromiseRejections: true,
  rateLimits: 'default', // 'default or 'verifiedBot'
  requestMembershipCapability: true
});

client.use(new AlternateMessageModifier(client));
client.use(new SlowModeRateLimiter(client, 10));
client.connect();

client.on('error', (err) => {
  timeLog(`Dank error: ${err.message}`);
  if (
    err.message.toLowerCase().includes('login') ||
    err.message.toLowerCase().includes('auth')
  ) {
    timeLog('Fatal: Twitch authentication failed. Exiting.');
    process.exit(1);
  }
});

/**
 * Notifications of JOINs sent to any connected client, upon successful
 * joining of a channel.
 *
 * @typedef {import('@mastondzn/dank-twitch-irc').JoinMessage} JoinMessage
 */
client.on('JOIN', (msg) => {
  if (msg.joinedUsername === config.username) {
    timeLog(`Joined #${msg.channelName}`);
  }
});

/**
 * Notifications of PARTs sent to any connected client, upon parting
 * of a channel.
 *
 * @typedef {import('@mastondzn/dank-twitch-irc').PartMessage} PartMessage
 */
client.on('PART', (msg) => {
  if (msg.partedUsername === config.username) {
    timeLog(`Parted #${msg.channelName}`);
  }
});

async function joinChannels() {
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
        await sleep(500);
        await client.join(username);
      } catch (joinErr) {
        timeLog(`Join failed for ${username}, attempting refresh for id ${ch.id}: ${joinErr}`);
        const fresh = await refreshUsername(ch.id);
        if (!fresh) {
          timeLog(`Refresh failed for id ${ch.id}, skipping join`);
          continue;
        }
        try {
          await sleep(500);
          await client.join(fresh);
        } catch (secondErr) {
          timeLog(`Second join attempt failed for ${fresh}: ${secondErr}`);
        }
      }
    } catch (err) {
      timeLog(`Error joining ${ch.username ?? ch.id}: ${err}`);
    }
  }
}

client.on('ready', () => {
  timeLog('Connected to Twitch');
  return joinChannels();
});

// appending U+034F for duplicate messages
const duplicateState = new Map<string, { last: string; nextAppend: boolean }>();

export async function saySafe(channel: string, text: string) {
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

    // Call client.say directly to avoid recursion
    await client.say(channel, sendText);
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
