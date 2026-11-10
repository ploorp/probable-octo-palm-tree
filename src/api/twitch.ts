import config from '../config/index.js';
import { timeLog } from '../utils.js';

const TWITCH_GQL_API = 'https://gql.twitch.tv/gql';

export type TwitchAccountStatus = {
  id?: string;
  login: string;
  banType?: string;
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
    };
  }>;
  const user = payload[0]?.data?.userResultByLogin;
  if (!user) return null;

  if (user.reason) {
    return { login: user.key ?? username, banType: user.reason };
  }

  if (!user.id || !user.login) return null;
  return { id: user.id, login: user.login };
}
