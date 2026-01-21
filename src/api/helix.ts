import config from '../../config.json' with { type: 'json' };
import axios from 'axios';
import { timeLog } from '../utils.js';

const BAN_API = 'https://api.twitch.tv/helix/moderation/bans';
const clientId = config.helix.helix_id;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_WHISPER_LENGTH = 500;

type HelixResponse = { ok: boolean; status: number; body: any };

let tokenProvider: (() => Promise<string>) | null = null;

export const setHelixTokenProvider = (provider: () => Promise<string>) => {
  tokenProvider = provider;
};

export const getHelixToken = async () => getAccessToken();

export const createAppAccessTokenProvider = () => {
  const clientSecret = process.env.HELIX_CLIENT_SECRET;
  const clientIdOverride = process.env.HELIX_CLIENT_ID ?? clientId;

  let cachedToken = '';
  let expiresAt = 0;

  return async () => {
    const now = Date.now();
    if (cachedToken && now < expiresAt - 60_000) {
      return cachedToken;
    }

    if (!clientSecret) {
      return process.env.HELIX_ACCESS_TOKEN ?? config.helix.access_token ?? '';
    }

    const res = await axios.post(
      'https://id.twitch.tv/oauth2/token',
      null,
      {
        params: {
          client_id: clientIdOverride,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    );

    cachedToken = res.data?.access_token ?? '';
    const expiresIn = Number(res.data?.expires_in ?? 0) * 1000;
    expiresAt = expiresIn > 0 ? now + expiresIn : now + 3_600_000;
    return cachedToken;
  };
};

const getAccessToken = async (): Promise<string> => {
  const raw = tokenProvider ? await tokenProvider() : (process.env.HELIX_ACCESS_TOKEN ?? config.helix.access_token ?? '');
  return raw.replace(/^oauth:/i, '');
};

const authHeaders = async (extra?: Record<string, string>) => ({
  'Client-ID': clientId,
  'Authorization': `Bearer ${await getAccessToken()}`,
  ...(extra ?? {}),
});

const logAxiosError = (action: string, err: any) => {
  const status = err?.response?.status ?? 'no-status';
  const body = err?.response?.data ?? err?.message;
  timeLog(`${action} failed: status=${status} body=${JSON.stringify(body)}`);
};

export async function chatBan(userId: string, broadcasterId: string, reason: string): Promise<HelixResponse> {
  if (!userId || !broadcasterId || !config.id) {
    timeLog('Missing required IDs for banning');
    return { ok: false, status: 0, body: 'missing ids' };
  }

  try {
    const res = await axios.post(
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
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
      }
    );

    timeLog(`Successfully banned user ${userId} in ${broadcasterId}`);
    return { ok: true, status: res.status, body: res.data };
  } catch (error: any) {
    logAxiosError(`Error banning user ${userId} in ${broadcasterId}`, error);
    return { ok: false, status: error?.response?.status ?? 0, body: error?.response?.data ?? error?.message };
  }
}

export async function chatUnban(userId: string, broadcasterId: string): Promise<HelixResponse> {
  if (!userId || !broadcasterId || !config.id) {
    timeLog('Missing required IDs for unbanning');
    return { ok: false, status: 0, body: 'missing ids' };
  }

  try {
    const res = await axios.request({
      method: 'DELETE',
      url: BAN_API,
      headers: await authHeaders(),
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
    return { ok: true, status: res.status, body: res.data };
  } catch (error: any) {
    logAxiosError(`Error unbanning user ${userId} in ${broadcasterId}`, error);
    return { ok: false, status: error?.response?.status ?? 0, body: error?.response?.data ?? error?.message };
  }
}

export async function chatTimeout(userId: string, broadcasterId: string, durationSeconds: number, reason: string): Promise<HelixResponse> {
  if (!userId || !broadcasterId || !config.id) {
    timeLog('Missing required IDs for timing out');
    return { ok: false, status: 0, body: 'missing ids' };
  }

  try {
    const res = await axios.post(
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
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
      }
    );

    timeLog(`Timed out user ${userId} for ${durationSeconds} seconds`);
    return { ok: true, status: res.status, body: res.data };
  } catch (error: any) {
    logAxiosError(`Error timing out user ${userId} in ${broadcasterId}`, error);
    return { ok: false, status: error?.response?.status ?? 0, body: error?.response?.data ?? error?.message };
  }
}

export async function approveAutomodMessage(messageId: string, moderatorId: string): Promise<HelixResponse> {
   try {
    const res = await axios.post(
      'https://api.twitch.tv/helix/moderation/automod/message',
      {
        user_id: moderatorId,
        msg_id:  messageId,
        action:  'ALLOW',
      },
      {
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
      }
    );
    return { ok: true, status: res.status, body: res.data };
  } catch (err: any) {
    logAxiosError(`Error allowing AutoMod message ${messageId}`, err);
    return { ok: false, status: err?.response?.status ?? 0, body: err?.response?.data ?? err?.message };
  }
}

export async function getUserId(username: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
      headers: await authHeaders(),
      signal: controller.signal,
    });

    if (!res.ok) {
      timeLog(`getUserId failed: status ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      timeLog(`getUserId: no data for ${username}`);
      return null;
    }
    return data.data[0].id;
  } catch (err: any) {
    const status = err?.name === 'AbortError' ? 'timeout' : err?.message;
    timeLog(`getUserId fetch error for ${username}: ${status}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getUsername(userId: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, {
      headers: await authHeaders(),
      signal: controller.signal,
    });

    if (!res.ok) {
      timeLog(`getUsername failed: status ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      timeLog(`getUsername: no data for ${userId}`);
      return null;
    }
    return data.data[0].login;
  } catch (err: any) {
    const status = err?.name === 'AbortError' ? 'timeout' : err?.message;
    timeLog(`getUsername fetch error for ${userId}: ${status}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function whisperUser(userId: string, message: string): Promise<[boolean, number, any]> {
  try {
    const url = `https://api.twitch.tv/helix/whispers?from_user_id=${encodeURIComponent(config.id)}&to_user_id=${encodeURIComponent(userId)}`;
    const sanitized = String(message).replace(/\n|\r/g, ' ');
    const truncated = sanitized.slice(0, MAX_WHISPER_LENGTH);
    const payload = { message: truncated };

    const res = await axios.post(url, payload, {
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
    });

    timeLog(`Sent whisper to user ${userId} (status ${res.status})`);
    return [res.status === 204, res.status, res.data];
  } catch (err: any) {
    const status = err.response?.status ?? 0;
    const body = err.response?.data ?? err.message;
    timeLog(`Error sending whisper to ${userId}: status=${status} body=${JSON.stringify(body)}`);
    return [false, status, body];
  }
}