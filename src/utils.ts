import axios from "axios";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const timeLog = (message: string) => {
  const timestamp = new Date().toLocaleString('en-US', {hour12: false});
  const logMessage = `[${timestamp}] ${message}`;

  console.error(logMessage);
}

// trim, but it also removes the reserved character
export const ttrim = (str: string) => {
  const pattern = /^[\s\u{E0000}]+|[\s\u{E0000}]+$/gu;
  return str.replace(pattern, '');
}

export async function getUserInfo(username: string) {
  const endpoint = "https://api.potat.app/users/";
  let response;

  if (!username) {
    return null;
  }

  username = username.replace(/^@/, '');

  if (!/^[a-z0-9_]+$/.test(username)) {
    return null;
  }

  try {
    response = await axios.get(endpoint + username);
  } catch (error) {
    return null;
  }

  if (response.data.statusCode === 404) {
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
    return true;
  }
}

export async function isPfpDefault(userInfo: any) {
  if (!userInfo) {
    return true;
  }

  try {
    const pfp = userInfo.data[0].user.connections.find((connection: any) => connection.platform === "TWITCH").pfp;
    return pfp.includes("user-default");
  } catch (error: any) {
    return true;
  }
}