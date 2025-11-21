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

/**
 * Connect to a firehose instance and call `onMsg` for each message matching `query`.
 * - `query` can be a string (substring), RegExp, or a predicate function.
 * - `WebSocketCtor` is optional in browsers. In Node pass `require('ws')` or `import WebSocket from 'ws'`.
 */
export async function connectFirehose(
  instance = "logs.supa.codes",
  query: string | RegExp | ((m: FirehoseMsg) => boolean) | undefined,
  onMsg: (m: FirehoseMsg) => void,
  WebSocketCtor?: any
) {
  const WS = WebSocketCtor ?? (typeof WebSocket !== "undefined" ? (WebSocket as any) : undefined);
  if (!WS) throw new Error("No WebSocket available — in Node pass the 'ws' WebSocket class as the 4th argument.");

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
  if (!args[1]) {
    return await saySafe(msg.channelName, "usage: %listen <channel> <timeout in seconds|null>");
  }

  const firehoseClient = connectFirehose("bigears.supa.codes", args[1], async (fhmsg) => {
    if (action === null) {
      (await firehoseClient).close();
      await saySafe(msg.channelName, `stopped listening`);
      return;
    }
    if (action) {
      await whisperUser(msg.senderUserID, `#${fhmsg.channel} @${fhmsg.displayName}: ${fhmsg.text}`);
    } else {
      await saySafe(msg.channelName, `#${fhmsg.channel} @${fhmsg.displayName}: ${fhmsg.text}`);
    }
  }, WebSocket);

  if (args[2]) {
    if (args[2] === "null") {
      await saySafe(msg.channelName, `started listening 👂 indefinitely`);
      return;
    }
    setTimeout(async () => {
      (await firehoseClient).close();
      await saySafe(msg.channelName, `stopped listening`);
      return;
    }, parseInt(args[2], 10) * 1000);
    await saySafe(msg.channelName, `started listening 👂 for ${args[2]} seconds`);
  }

  // close after 30s:
  setTimeout(async () => {
    (await firehoseClient).close();
    await saySafe(msg.channelName, `stopped listening`);
    return;
  }, 30_000);
  await saySafe(msg.channelName, `started listening 👂 for 30 seconds`);
  return;
}
