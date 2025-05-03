import config from '../config.json' with { type: 'json' };
import axios from 'axios';

const BAN_API = 'https://api.twitch.tv/helix/moderation/bans';
const clientId = config.helix.client_id;
const accessToken = config.helix.access_token;

export async function chatBan(userId: string, broadcasterId: string, reason: string) {
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

    console.log(`Successfully banned user ${userId} in ${broadcasterId}`);
  } catch (error: any) {
    console.error(`Error banning user ${userId} in ${broadcasterId}:`, error.response?.data || error.message);
  }
}

export async function chatUnban(userId: string, broadcasterId: string) {
  if (!userId || !broadcasterId || !config.id) {
    console.error('Missing required IDs');
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

    console.log(`Successfully unbanned user ${userId} in ${broadcasterId}`);
  } catch (error: any) {
    console.error(`Error unbanning user ${userId} in ${broadcasterId}:`, error.response?.data || error.message);
  }
}

export async function chatTimeout(userId: string, broadcasterId: string, durationSeconds: number, reason: string) {
  if (!userId || !broadcasterId || !config.id) {
    console.error('Missing required IDs');
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
        moderator_id: config.id,
        broadcaster_id: broadcasterId,
      },
      {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Timed out user ${userId} for ${durationSeconds} seconds`);
  } catch (error: any) {
    console.error(`Error timing out user ${userId}:`, error.response?.data || error.message);
  }
}
