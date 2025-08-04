import axios from "axios";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const timeLog = (message: string) => {
  const timestamp = new Date().toLocaleString('en-US', {hour12: false});
  const logMessage = `[${timestamp}] ${message}`;

  console.error(logMessage);
}

// trim, but it also removes the reserved character and double spaces
export const ttrim = (str: string | undefined) => {
  if (str === undefined) return '';
  const pattern = /^[\s\u{E0000}]+|[\s\u{E0000}]+$/gu;
  return str.replace(pattern, '').replace(/\s{2,}/g, ' ');
}

export async function getUserInfo(username: string) {
  const endpoint = "https://api.potat.app/users/";
  let response;

  username = username.toLowerCase().replace(/^@/, '');

  if (!/^[a-z0-9_]+$/.test(username)) {
    timeLog(`Invalid username: ${username}`);
    return null;
  }

  try {
    response = await axios.get(endpoint + username);
  } catch (error : any) {
    timeLog(`Error fetching user info for ${username}: ${error.message}`);
    return null;
  }

  if (response.data.statusCode === 404) {
    timeLog(`Response 404 for: ${username}`);
    return null;
  }

  return response.data;
}

export async function usernameToID(userInfo: any) {
  if (!userInfo) {
    return null;
  }

  try {
    return userInfo.data[0].user.connections.find((connection: any) => connection.platform === "TWITCH").id;
  } catch (error: any) {
    timeLog(`Error getting user ID: ${error.message}`);
    return null;
  }
}

export async function getFirstSeen(userInfo: any) {
  if (!userInfo) {
    return null;
  }

  try {
    return userInfo.data[0].user.firstSeen;
  } catch (error: any) {
    timeLog(`Error getting first seen: ${error.message}`);
    return null;
  }
}

export async function isColorDefault(userInfo: any) {
  if (!userInfo) {
    return true;
  }

  try {
    const color = userInfo.data[0].user.connections.find((connection: any) => connection.platform === "TWITCH").meta.color;
    return color === null;
  } catch (error: any) {
    timeLog(`Error getting color: ${error.message}`);
    return true;
  }
}

export async function isPfpDefault(userInfo: any) {
  if (!userInfo) {
    return true;
  }

  const username = userInfo.data[0].user.username;

  try {
    const pfp = userInfo.data[0].user.connections.find((connection: any) => connection.platform === "TWITCH").pfp;
    
    if (!pfp) {
      timeLog("pfp is null");
      return true;
    }
    
    return pfp.includes("user-default");
  } catch (error: any) {
    timeLog(`Error getting profile picture: ${username} ${error.message}`);
    return true;
  }
}
