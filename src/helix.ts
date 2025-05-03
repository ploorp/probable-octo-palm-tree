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
          reason,
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

    console.log(`Successfully banned user ${userId}`);
  } catch (error: any) {
    console.error(`Error banning user ${userId}:`, error.response?.data || error.message);
  }
}

export async function chatUnban(userId: string, broadcasterId: string) {
  try {
    const response = await axios.delete(BAN_API, {
      params: {
        user_id: userId,
        moderator_id: config.id,
        broadcaster_id: broadcasterId,
      },
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    console.log(`Successfully unbanned user ${userId}`);
  } catch (error: any) {
    console.error(`Error unbanning user ${userId}:`, error.response?.data || error.message);
  }
}
