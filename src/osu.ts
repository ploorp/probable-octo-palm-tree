import axios from 'axios';
import config from '../config.json' with { type: 'json' };
import { timeLog } from './utils.js';

let accessToken: string | null = null;
let tokenExpiration: number = 0;

async function getToken() {
    if (accessToken && Date.now() < tokenExpiration) {
        return accessToken;
    }

    try {
        const response = await axios.post('https://osu.ppy.sh/oauth/token', {
            client_id: config.osu.client_id,
            client_secret: config.osu.client_secret,
            grant_type: 'client_credentials',
            scope: 'public'
        });

        accessToken = response.data.access_token;
        tokenExpiration = Date.now() + (response.data.expires_in * 1000);
        return accessToken;
    } catch (error: any) {
        timeLog(`Error getting osu! token: ${error.message}`);
        return null;
    }
}

export async function getUser(username: string) {
    const token = await getToken();
    if (!token) return null;

    try {
        const response = await axios.get(`https://osu.ppy.sh/api/v2/users/${username}/osu`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        // timeLog(`Error getting osu! user ${username}: ${error.message}`);
        return null;
    }
}

export async function getRecentPlays(userId: number) {
    const token = await getToken();
    if (!token) return null;

    try {
        const response = await axios.get(`https://osu.ppy.sh/api/v2/users/${userId}/scores/recent?include_fails=1&limit=1`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        timeLog(`Error getting recent plays for ${userId}: ${error.message}`);
        return null;
    }
}

export async function getBestPlays(userId: number) {
    const token = await getToken();
    if (!token) return null;

    try {
        const response = await axios.get(`https://osu.ppy.sh/api/v2/users/${userId}/scores/best?limit=1`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        timeLog(`Error getting best plays for ${userId}: ${error.message}`);
        return null;
    }
}

export async function getBeatmap(beatmapId: number) {
    const token = await getToken();
    if (!token) return null;

    try {
        const response = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        timeLog(`Error getting beatmap ${beatmapId}: ${error.message}`);
        return null;
    }
}
