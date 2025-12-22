import { client, saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import axios from "axios";
import FormData from "form-data";
import { timeLog } from '../utils.js';
import validator from "validator";
const { isURL, trim } = validator;

const sizeLimit = 100 * 1024 * 1024;
const cobaltUrl = "http://localhost:9001";

function sanitizeUrl(rawUrl: string): string | null {
  const cleaned = trim(rawUrl).replace(/[<>\s]/g, "");

  const allowedPattern = /\S*(tiktok\.com\/\S+|(instagram|facebook)\.com\/(reels?|p|share)\/\S+|(x|twitter)\.com\/(?:i\/)?(?:\w+\/)?status\/\d+|(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)\S+|youtu\.be\/\S+)/i;
  if (!allowedPattern.test(cleaned)) return null;

  if (!isURL(cleaned, { require_protocol: false })) return null;

  try {
    const url = new URL(cleaned.startsWith("http") ? cleaned : "https://" + cleaned);
    return url.href;
  } catch {
    timeLog("Invalid URL for downloader:" + cleaned);
    return null;
  }
}

async function resolveCobaltUrl(url: string): Promise<string | null> {
  try {
    const response = await axios.post(cobaltUrl, {
      url: url,
      videoQuality: "1080",
      filenameStyle: "basic",
      downloadMode: "auto",
      youtubeVideoCodec: "h264",
      alwaysProxy: true,
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const data = response.data;
    let downloadUrl: string | null = null;

    if (data.status === 'redirect' || data.status === 'tunnel') {
      downloadUrl = data.url;
    } else if (data.status === 'picker' && data.picker && data.picker.length > 0) {
      const video = data.picker.find((p: any) => p.type === 'video');
      downloadUrl = video ? video.url : data.picker[0].url;
    }

    if (!downloadUrl) {
      timeLog(`Cobalt processing failed: ${JSON.stringify(data)}`);
      return null;
    }

    return downloadUrl;

  } catch (error: any) {
    timeLog("Cobalt error: " + (error.response?.data ? JSON.stringify(error.response.data) : error.message));
    return null;
  }
}

async function uploadFromStream(sourceUrl: string): Promise<string | "too-large" | undefined> {
  const attemptUpload = async (targetUrl: string) => {
    const source = await axios.get(sourceUrl, { responseType: 'stream' });
    const length = parseInt(source.headers['content-length'] || '0');

    if (length > sizeLimit) {
      source.data.destroy();
      throw new Error("TOO_LARGE");
    }

    const form = new FormData();
    form.append("file", source.data, { filename: 'video.mp4', knownLength: length || undefined });

    const res = await axios.post(targetUrl, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: sizeLimit,
      maxBodyLength: sizeLimit
    });
    return res.data.link || res.data.url;
  };

  try {
    return await attemptUpload("https://segs.lol/api/upload");
  } catch (e: any) {
    if (e.message === "TOO_LARGE") return "too-large";
    timeLog("segs.lol failed: " + e.message);
    try {
      return await attemptUpload("https://olrite.lol/api/upload");
    } catch (e: any) {
      if (e.message === "TOO_LARGE") return "too-large";
      timeLog("olrite.lol failed: " + e.message);
      return undefined;
    }
  }
}

const downloadCache = new Map<string, string>();

export default async function download(msg: PrivmsgMessage, linkOrCommand: string | boolean, args?: string[]) {
  let mediaLink: string | null = null;
  let isCommand = false;

  if (typeof linkOrCommand === 'boolean') {
    isCommand = linkOrCommand;
    if (args && args.length > 0) {
      mediaLink = args[0];
    }
  } else {
    mediaLink = linkOrCommand;
  }

  if (!mediaLink) {
    if (isCommand) await saySafe(msg.channelName, "Please provide a link.", msg.messageID);
    return;
  }

  const sanitized = sanitizeUrl(mediaLink);
  if (!sanitized) {
    if (isCommand) await saySafe(msg.channelName, "Invalid URL.", msg.messageID);
    else timeLog("Invalid URL for downloader: " + mediaLink);
    return;
  }

  // Automatic mode restrictions
  if (!isCommand) {
    const isYouTube = sanitized.includes("youtube.com") || sanitized.includes("youtu.be");
    const isShorts = sanitized.includes("/shorts/");
    
    if (isYouTube && !isShorts) {
      // Skip long youtube videos in auto mode
      return;
    }
  }

  if (downloadCache.has(sanitized)) {
    const cachedLink = downloadCache.get(sanitized)!;
    await saySafe(msg.channelName, `🪞 ${cachedLink}`, msg.messageID);
    return;
  }

  const cobaltUrl = await resolveCobaltUrl(sanitized);
  
  if (!cobaltUrl) {
    if (isCommand) await saySafe(msg.channelName, "Download failed.", msg.messageID);
    else timeLog("Download failed for: " + sanitized);
    return;
  }
  
  const uploadedUrl = await uploadFromStream(cobaltUrl);

  if (uploadedUrl === "too-large") {
    await saySafe(msg.channelName, "Video too large to download.", msg.messageID);
    return;
  }

  if (!uploadedUrl) {
    await saySafe(msg.channelName, `uh upload failed`, msg.messageID);
  } else {
    downloadCache.set(sanitized, uploadedUrl);
    await saySafe(msg.channelName, `🪞 ${uploadedUrl}`, msg.messageID);
  }
}
