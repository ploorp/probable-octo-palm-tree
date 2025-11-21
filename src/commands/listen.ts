import { saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { whisperUser } from '../helix.js';


export type FirehoseMsg = {
  text: string;
  displayName: string;
  channel?: string;
  timestamp: string;
  id: string;
  tags: Record<string, string>;
};

type FirehoseClient = Promise<{ close: () => void; raw: any }>;

// active listeners keyed by the chat channel where the command was invoked
const listeners = new Map<string, FirehoseClient>();
// map of timeout ids for scheduled stops so we can cancel them when replacing listeners
const listenerTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function stopListening(channel: string) {
  const active = listeners.get(channel);
  if (active) {
    try { (await active).close(); } catch {}
    listeners.delete(channel);
  }
  const t = listenerTimers.get(channel);
  if (t) {
    clearTimeout(t);
    listenerTimers.delete(channel);
  }
}


export async function connectFirehose(
  instance = "logs.supa.codes",
  query: string | RegExp | ((m: FirehoseMsg) => boolean) | undefined,
  onMsg: (m: FirehoseMsg) => void,
  WebSocketCtor?: any
) {
  const WS = WebSocketCtor ?? (typeof WebSocket !== "undefined" ? (WebSocket as any) : undefined);

  const url = `wss://${instance}/firehose?jsonBasic=true`;
  const ws: any = new WS(url);

  const matches = (m: FirehoseMsg) => {
    if (!query) return true;
    if (typeof query === "string") return !!m.text && m.text.toLowerCase().includes(query.toLowerCase());
    if (query instanceof RegExp) return query.test(m.text);
    return query(m);
  };

  const handle = (data: any) => {
    const raw = typeof data === "string" ? data : data.toString();
    try {
      const msg = JSON.parse(raw) as FirehoseMsg;
      if (matches(msg)) onMsg(msg);
    } catch {
      // ignore parse errors
    }
  };

  // wire events for browser and node 'ws'
  if (typeof ws.addEventListener === "function") {
    ws.addEventListener("message", (ev: any) => handle(ev.data ?? ev));
  } else {
    ws.on("message", handle);
  }

  return {
    close: () => ws && typeof ws.close === "function" && ws.close(),
    raw: ws,
  };
}


export default async function listen(msg: PrivmsgMessage, args: string[], action: boolean | null) {
  const key = msg.channelName;

  if (action === null) {
    if (!listeners.has(key)) {
      await saySafe(msg.channelName, `not currently listening`);
      return;
    }
    await stopListening(key);
    await saySafe(msg.channelName, `stopped listening`);
    return;
  }

  if (!args[1]) {
    await saySafe(msg.channelName, "usage: %listen <channel> <timeout in seconds>");
    return;
  }

  let duration = 30000;
  if (args[2]) {
    if (isNaN(+args[2])) {
      await saySafe(msg.channelName, "usage: %listen <channel> <timeout in seconds>");
      return;
    }
    if (args[2] === "0") {
      duration = 0;
    } else {
      duration = parseInt(args[2], 10) * 1000;
    }
  }

  await stopListening(key);

  const firehoseClient = connectFirehose("bigears.supa.codes", args[1], async (fhmsg) => {
    const payload = `#${fhmsg.channel} @${fhmsg.displayName}: ${fhmsg.text}`;
    if (action) {
      await whisperUser(msg.senderUserID, payload);
    } else {
      await saySafe(msg.channelName, payload);
    }
  });

  listeners.set(key, firehoseClient);

  if (duration > 0) {
    const id = setTimeout(async () => {
      await stopListening(key);
      await saySafe(msg.channelName, `stopped listening`);
    }, duration);
    listenerTimers.set(key, id);
    await saySafe(msg.channelName, `started listening 👂 for ${duration / 1000} seconds`);
  } else {
    await saySafe(msg.channelName, `started listening 👂 indefinitely`);
  }
}
