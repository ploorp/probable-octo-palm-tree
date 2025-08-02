import WebSocket from 'ws';
import axios from 'axios';
import { approveAutomodMessage } from './helix.js';
import { timeLog } from './utils.js';
import config from '../config.json' with { type: 'json' };

export function allowAutomod() {
  const accessToken   = config.ttg.access_token;
  const clientId      = config.ttg.helix_id;
  const moderatorId   = '918666764';
  const broadcasterId = '410551170';

  const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

  ws.on('open', () => {
    timeLog('connected to eventsub websocket');
  });

  ws.on('message', async raw => {
    const msg = JSON.parse(raw.toString());

    if (msg.metadata?.message_type === 'session_welcome') {
      const sessionId = msg.payload.session.id;
      timeLog(`session opened (id=${sessionId}), creating subscription…`);

      try {
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
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type':  'application/json',
            },
          }
        );
        timeLog('Subscribed to automod.message.hold');
      } catch (err: any) {
        timeLog(`Failed to create subscription: ${err.message}`);
      }

    } else if (msg.metadata?.message_type === 'notification') {
      const sub = msg.payload.subscription;
      if (sub.type === 'automod.message.hold') {
        const evt = msg.payload.event;
        timeLog(`automod caught message: ${evt.message.text}`);

        if (evt.user_id === '502913017') {
          await approveAutomodMessage(evt.message_id, moderatorId);
          timeLog(`allowed automod message ${evt.message_id} from ${evt.user_login}`);
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
