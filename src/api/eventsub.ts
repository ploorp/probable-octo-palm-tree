import WebSocket from 'ws';
import axios from 'axios';
import { approveAutomodMessage, getHelixToken } from './helix.js';
import { timeLog } from '../utils.js';
import config from '../../config.json' with { type: 'json' };

export function allowAutomod() {
  const clientId      = config.helix.helix_id;
  const moderatorId   = '918666764';
  const broadcasterId = '410551170';
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

  ws.on('open', () => {
    timeLog('connected to eventsub websocket');
  });

  ws.on('message', async raw => {
    const msg = JSON.parse(raw.toString());

    if (msg.metadata?.message_type === 'session_welcome') {
      const sessionId = msg.payload.session.id;
      timeLog(`session opened (id=${sessionId}), creating subscription…`);
      let subscribed = false;
      for (let attempt = 1; attempt <= 3 && !subscribed; attempt++) {
        try {
          const bearer = await getHelixToken();
          await axios.post(
            'https://api.twitch.tv/helix/eventsub/subscriptions',
            {
              type:    'automod.message.hold',
              version: '2',
              condition: {
                broadcaster_user_id: broadcasterId,
                moderator_user_id:   moderatorId,
              },
              transport: {
                method:     'websocket',
                session_id: sessionId,
              },
            },
            {
              headers: {
                'Client-ID':     clientId,
                'Authorization': `Bearer ${bearer}`,
                'Content-Type':  'application/json',
              },
            }
          );
          timeLog('Subscribed to automod.message.hold');
          subscribed = true;
        } catch (err: any) {
          const status = err?.response?.status ?? 'no-status';
          const body = err?.response?.data ?? err?.message;
          timeLog(`Subscription attempt ${attempt}/3 failed: status=${status} body=${JSON.stringify(body)}`);
          if (status === 401 || status === 403) {
            break;
          }
          const waitMs = attempt * 2000;
          await delay(waitMs);
        }
      }

    } else if (msg.metadata?.message_type === 'notification') {
      const sub = msg.payload.subscription;
      if (sub.type === 'automod.message.hold') {
        const evt = msg.payload.event;
        timeLog(`automod caught message: ${evt.message.text}`);

        if (evt.user_id === '502913017') {
          const result = await approveAutomodMessage(evt.message_id, moderatorId);
          if (result.ok) {
            timeLog(`allowed automod message ${evt.message_id} from ${evt.user_login}`);
          } else {
            timeLog(`failed to allow automod message ${evt.message_id}: status=${result.status} body=${JSON.stringify(result.body)}`);
          }
        }
      }

    } else if (msg.metadata?.message_type === 'session_keepalive') {
      timeLog('received keepalive');

    } else if (msg.metadata?.message_type === 'session_reconnect') {
      timeLog('server asks us to reconnect');
      ws.close();
    }
  });

  ws.on('error', err => {
    timeLog(`websocket error: ${err.message}`);
  });

  ws.on('close', () => {
    timeLog('websocket closed, reconnecting in 5s…');
    setTimeout(allowAutomod, 5000);
  });
}
