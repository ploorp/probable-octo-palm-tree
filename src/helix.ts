import config from '../config.json' with { type: 'json' };
import axios from 'axios';
import { timeLog } from './utils.js';

const BAN_API = 'https://api.twitch.tv/helix/moderation/bans';
const clientId = config.ttg.helix_id;
const accessToken = config.ttg.access_token;

export async function chatBan(userId: string, broadcasterId: string, reason: string) {
  if (!userId || !broadcasterId || !config.id) {
    timeLog('Missing required IDs for banning');
    return;
  }

  try {
    const response = await axios.post(
      BAN_API,
      {
        data: {
          user_id: userId,
          reason: reason,
        },
      },
      {
        params: {
          broadcaster_id: broadcasterId,
          moderator_id: config.id,
        },
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    timeLog(`Successfully banned user ${userId} in ${broadcasterId}`);
  } catch (error: any) {
    timeLog(`Error banning user ${userId} in ${broadcasterId}`);
  }
}

export async function chatUnban(userId: string, broadcasterId: string) {
  if (!userId || !broadcasterId || !config.id) {
    timeLog('Missing required IDs for unbanning');
    return;
  }

  try {
    const response = await axios.request({
      method: 'DELETE',
      url: BAN_API,
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
      },
      params: {
        user_id: userId,
        broadcaster_id: broadcasterId,
        moderator_id: config.id,
      },
      paramsSerializer: params => {
        return Object.entries(params)
          .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
          .join('&');
      }
    });

    timeLog(`Successfully unbanned user ${userId} in ${broadcasterId}`);
  } catch (error: any) {
    timeLog(`Error unbanning user ${userId} in ${broadcasterId}`);
  }
}

export async function chatTimeout(userId: string, broadcasterId: string, durationSeconds: number, reason: string) {
  if (!userId || !broadcasterId || !config.id) {
    timeLog('Missing required IDs for timing out');
    return;
  }

  try {
    const response = await axios.post(
      BAN_API,
      {
        data: {
          user_id: userId,
          duration: durationSeconds,
          reason: reason,
        },
      },
      {
        params: {
          broadcaster_id: broadcasterId,
          moderator_id: config.id,
        },
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    timeLog(`Timed out user ${userId} for ${durationSeconds} seconds`);
  } catch (error: any) {
    timeLog(`Error timing out user ${userId} in ${broadcasterId}`);
  }
}

export async function approveAutomodMessage(messageId: string, moderatorId: string) {
   try {
    await axios.post(
      'https://api.twitch.tv/helix/moderation/automod/message',
      {
        user_id: moderatorId,
        msg_id:  messageId,
        action:  'ALLOW',
      },
      {
        headers: {
          'Client-ID':     clientId,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const body   = err.response?.data;
    timeLog(`Error allowing AutoMod message ${messageId}: ${status} ${JSON.stringify(body)}`);
  }
}

export async function getUserId(username: string): Promise<string | null> {
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;
  return data.data[0].id;
}

export async function getUsername(userId: string): Promise<string | null> {
  const res = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, {
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;
  return data.data[0].login;
}