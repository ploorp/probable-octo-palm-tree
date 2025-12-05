import { saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { whisperUser } from '../helix.js';
import config from '../../config.json' with { type: 'json' };

export type FirehoseMsg = {
  text: string;
  displayName: string;
  channel?: string;
  timestamp: string;
  id: string;
  tags: Record<string, string>;
};

type FirehoseClient = Promise<{ close: () => void; raw: any }>;

interface ListenerState {
  client: FirehoseClient;
  timer?: ReturnType<typeof setTimeout>;
}

const listeners = new Map<string, Map<string, ListenerState>>();

async function stopListening(channel: string, query?: string) {
  const channelMap = listeners.get(channel);
  if (!channelMap) return;

  if (query) {
    const qKey = query.toLowerCase();
    const state = channelMap.get(qKey);
    if (state) {
      try { (await state.client).close(); } catch {}
      if (state.timer) clearTimeout(state.timer);
      channelMap.delete(qKey);
    }
    if (channelMap.size === 0) listeners.delete(channel);
  } else {
    for (const state of channelMap.values()) {
      try { (await state.client).close(); } catch {}
      if (state.timer) clearTimeout(state.timer);
    }
    listeners.delete(channel);
  }
}


export async function connectFirehose(
  instance: string,
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


export default async function listen(msg: PrivmsgMessage, args: string[], action: boolean | null, hose: string) {
  const key = msg.channelName;

  if (action === null) {
    const query = args[1];
    if (!listeners.has(key)) {
      await saySafe(msg.channelName, `not currently listening to anything`, msg.messageID);
      return;
    }
    
    await stopListening(key, query);
    
    if (query) {
      await saySafe(msg.channelName, `stopped listening to that`, msg.messageID);
    } else {
      await saySafe(msg.channelName, `stopped listening to everything`, msg.messageID);
    }
    return;
  }

  if (!args[1]) {
    await saySafe(msg.channelName, "usage: %listen <channel> <timeout in seconds>", msg.messageID);
    return;
  }

  const query = args[1];
  const qKey = query.toLowerCase();

  let actualQuery: string | RegExp = query;
  const regexMatch = query.match(/^\/(.+)\/([a-z]*)$/);
  if (regexMatch) {
    try {
      actualQuery = new RegExp(regexMatch[1], regexMatch[2]);
    } catch (e) {
      return;
    }
  }

  let duration = 30000;
  if (args[2]) {
    if (isNaN(+args[2])) {
      await saySafe(msg.channelName, "usage: %listen <channel> <timeout in seconds>", msg.messageID);
      return;
    }
    if (args[2] === "0") {
      duration = 0;
    } else {
      duration = parseInt(args[2], 10) * 1000;
    }
  }

  await stopListening(key, query);

  let messageCount = 0;
  let windowStart = Date.now();
  const WINDOW_SIZE = 30000;
  const MAX_MESSAGES = 19;

  const state = {} as ListenerState;

  const firehoseClient = connectFirehose(hose, actualQuery, async (fhmsg) => {
    if (listeners.get(key)?.get(qKey) !== state) return;

    const now = Date.now();
    if (now - windowStart > WINDOW_SIZE) {
      messageCount = 0;
      windowStart = now;
    }

    if (messageCount >= MAX_MESSAGES) {
      return;
    }

    messageCount++;

    const payload = `#${fhmsg.channel} @${fhmsg.displayName}: ${fhmsg.text}`;
    
    if (fhmsg.displayName?.toLowerCase() === config.username) {
      return;
    }
    
    if (action) {
      await whisperUser(msg.senderUserID, payload);
    } else {
      await saySafe(msg.channelName, payload);
    }
  });

  state.client = firehoseClient;

  if (!listeners.has(key)) {
    listeners.set(key, new Map());
  }
  
  listeners.get(key)!.set(qKey, state);

  if (duration > 0) {
    const id = setTimeout(async () => {
      await stopListening(key, query);
      await saySafe(msg.channelName, `stopped listening to that`, msg.messageID);
    }, duration);
    state.timer = id;
    await saySafe(msg.channelName, `started listening 👂 for ${duration / 1000} seconds`, msg.messageID);
  } else {
    await saySafe(msg.channelName, `started listening 👂 indefinitely`, msg.messageID);
  }
}
