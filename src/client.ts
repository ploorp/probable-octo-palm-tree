import config from '../config.json' with { type: 'json' };
import {
  ChatClient,
  AlternateMessageModifier,
  SlowModeRateLimiter
} from '@mastondzn/dank-twitch-irc';
import { sleep, timeLog } from './utils.js';

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
  if (!config.channels?.length) {
    timeLog('No channels to join in config.json');
  }

  for (const channel of config.channels) {
    try {
      await sleep(500).then(() => client.join(channel.toLowerCase()));
    } catch (err) {
      timeLog(`Error joining ${channel}: ${err}`);
    }
  }
}

client.on('ready', () => {
  timeLog('Connected to Twitch');
  return joinChannels();
});

export { client };
