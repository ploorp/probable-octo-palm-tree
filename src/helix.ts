import config from '../config.json' with { type: 'json' };
import axios from 'axios';

const BAN_API = 'https://api.twitch.tv/helix/moderation/bans';
const clientId = config.client_id;
const accessToken = config.access_token2;

export default async function chatBan(userId: string, broadcasterId: string, reason: string) {
  try {
    const response = await axios.post(BAN_API, {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          user_id: userId,
          reason,
        },
        moderator_id: config.id,
        broadcaster_id: broadcasterId,
      }),
    });
    console.log(`Successfully banned user ${userId}`);
  } catch (error: any) {
    console.error(`Error banning user ${userId}:`, error);
  }

}