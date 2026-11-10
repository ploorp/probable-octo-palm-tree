import config from '../config/index.js';
import { timeLog } from '../utils.js';

const TWITCH_GQL_API = 'https://gql.twitch.tv/gql';

export type TwitchAccountStatus = {
  id?: string;
  login: string;
  banType?: string;
  updatedAt?: string;
};

export async function getTwitchAccountStatus(username: string): Promise<TwitchAccountStatus | null> {
  const response = await fetch(TWITCH_GQL_API, {
    method: 'POST',
    headers: {
      'Client-ID': config.twitch.web_client_id,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      query: `query UserStatus($login: String!) {
        userResultByLogin(login: $login) {
          ... on UserDoesNotExist { key reason }
          ... on UserError { key }
          ... on User { id login }
        }
        user(lookupType: ALL, login: $login) { id login updatedAt }
      }`,
      variables: { login: username }
    }])
  });

  if (!response.ok) {
    timeLog(`getTwitchAccountStatus failed: status ${response.status}`);
    throw new Error(`Twitch account lookup failed with status ${response.status}`);
  }

  const payload = await response.json() as Array<{
    data?: {
      userResultByLogin?: { id?: string; login?: string; key?: string; reason?: string };
      user?: { id?: string; login?: string; updatedAt?: string };
    };
  }>;
  const user = payload[0]?.data?.userResultByLogin;
  const allUser = payload[0]?.data?.user;
  if (!user) return null;

  if (user.reason) {
    return { login: user.key ?? username, banType: user.reason, updatedAt: allUser?.updatedAt };
  }

  if (!user.id || !user.login) return null;
  return { id: user.id, login: user.login };
}
