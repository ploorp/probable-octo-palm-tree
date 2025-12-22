import { client, saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
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

async function uploadMedia(filePath: string): Promise<string | undefined> {
  let response;
  let link;

  const createForm = () => {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));
    return form;
  };

  try {
    const form = createForm();
    response = await axios.post("https://segs.lol/api/upload", form, {
      headers: form.getHeaders(),
      maxContentLength: sizeLimit,
      maxBodyLength: sizeLimit,
    });
    link = response.data.link;
  } catch (error) {
    timeLog("segs.lol failed, using fallback: " + error);
    try {
      const form = createForm();
      response = await axios.post("https://olrite.lol/api/upload", form, {
        headers: form.getHeaders(),
        maxContentLength: sizeLimit,
        maxBodyLength: sizeLimit,
      });
      link = response.data.url;
    }
    catch (error) {
      timeLog("Upload failed: " +  error);
      return;
    }
  }
  return link;
}

async function cobaltDownload(url: string): Promise<string | null> {
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

    const tempFile = path.join(os.tmpdir(), `dl-${crypto.randomUUID()}.mp4`);
    const writer = fs.createWriteStream(tempFile);
    
    const fileResponse = await axios.get(downloadUrl, { responseType: 'stream' });
    
    const contentLength = fileResponse.headers['content-length'];
    if (contentLength && parseInt(contentLength) > sizeLimit) {
      timeLog("File too large (Cobalt): " + url);
      writer.close();
      fs.unlinkSync(tempFile);
      return "too-large";
    }

    fileResponse.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(tempFile));
      writer.on('error', (err) => {
        timeLog("File write error: " + err);
        reject(null);
      });
    });

  } catch (error: any) {
    timeLog("Cobalt error: " + (error.response?.data ? JSON.stringify(error.response.data) : error.message));
    return null;
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

  const filePath = await cobaltDownload(sanitized);
  
  if (!filePath) {
    if (isCommand) await saySafe(msg.channelName, "Download failed.", msg.messageID);
    else timeLog("Download failed for: " + sanitized);
    return;
  }
  
  if (filePath === "too-large") {
    await saySafe(msg.channelName, "Video too large to download.", msg.messageID);
    return;
  }

  try {
    const uploadedUrl = await uploadMedia(filePath);
    if (!uploadedUrl) {
      await saySafe(msg.channelName, `uh upload failed`, msg.messageID);
    } else {
      downloadCache.set(sanitized, uploadedUrl);
      await saySafe(msg.channelName, `🪞 ${uploadedUrl}`, msg.messageID);
    }
  } finally {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      timeLog("Error cleaning up file: " + error);
    }
  }
}
