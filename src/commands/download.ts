import { client, saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { timeLog } from '../utils.js';
import validator from "validator";
import config from '../../config.json' with { type: 'json' };

const { isURL, trim } = validator;

const SEGS_LIMIT = 190 * 1024 * 1024; // 190MB
const GOFILE_LIMIT = 10 * 1024 * 1024 * 1024; // 10GB
const cobaltUrl = "http://localhost:9001";

export const downloadLinkPattern = /\S*(tiktok\.com\/\S+|(instagram|facebook)\.com\/(reels?|p|share)\/\S+|(x|twitter)\.com\/(?:i\/)?(?:\w+\/)?status\/\d+|(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)\S+|youtu\.be\/\S+)/i;

function sanitizeUrl(rawUrl: string): string | null {
  const cleaned = trim(rawUrl).replace(/[<>\s]/g, "");

  if (!downloadLinkPattern.test(cleaned)) return null;

  if (!isURL(cleaned, { require_protocol: false })) return null;

  try {
    const url = new URL(cleaned.startsWith("http") ? cleaned : "https://" + cleaned);
    return url.href;
  } catch {
    timeLog("Invalid URL for downloader:" + cleaned);
    return null;
  }
}

type CobaltResult = 
  | { status: 'success'; url: string; filename: string }
  | { status: 'error'; message: string };

async function resolveCobaltUrl(url: string, slideIndex?: number): Promise<CobaltResult> {
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
    let filename = 'video.mp4';

    if (data.status === 'redirect' || data.status === 'tunnel') {
      downloadUrl = data.url;
      if (data.filename) filename = data.filename;
    } else if (data.status === 'picker' && data.picker && data.picker.length > 0) {
      let item;
      if (slideIndex) {
        item = data.picker[slideIndex - 1];
        if (!item) {
          return { status: 'error', message: `Slide ${slideIndex} not found` };
        }
      } else {
        item = data.picker[0];
      }
      downloadUrl = item.url;
      if (item.type === 'photo') filename = 'image.jpg';
      if (item.type === 'gif') filename = 'image.gif';
    }

    if (!downloadUrl) {
      timeLog(`Cobalt processing failed: ${JSON.stringify(data)}`);
      return { status: 'error', message: 'Processing failed' };
    }

    return { status: 'success', url: downloadUrl, filename };

  } catch (error: any) {
    const code = error.response?.data?.error?.code;
    let message = code || error.message;

    if (code === 'error.api.content.video.unavailable') {
      message = 'Video unavailable';
    }
    
    timeLog("Cobalt error: " + (error.response?.data ? JSON.stringify(error.response.data) : error.message));
    return { status: 'error', message };
  }
}

async function uploadGoFile(stream: any, length: number, filename: string): Promise<string | undefined> {
  try {
    const form = new FormData();
    form.append("file", stream, { filename: filename, knownLength: length });

    const uploadRes = await axios.post("https://upload.gofile.io/uploadfile", form, {
      headers: { 
        ...form.getHeaders(),
        'Authorization': `Bearer ${config.gofile.token}`
      },
      maxContentLength: GOFILE_LIMIT,
      maxBodyLength: GOFILE_LIMIT
    });

    if (uploadRes.data.status !== 'ok') {
      timeLog("GoFile upload failed status: " + JSON.stringify(uploadRes.data));
      return undefined;
    }

    const contentId = uploadRes.data.data.fileId; 
    const downloadPage = uploadRes.data.data.downloadPage;
    
    try {
      // Create direct link
      const linkRes = await axios.post(`https://api.gofile.io/contents/${contentId}/directlinks`, {}, {
        headers: {
          'Authorization': `Bearer ${config.gofile.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (linkRes.data.status === 'ok') {
        return linkRes.data.data.directLink;
      }
    } catch (error) {
      // Direct link creation failed (likely not premium), fallback to downloadPage
    }

    return downloadPage;

  } catch (error: any) {
    timeLog("GoFile error: " + (error.response?.data ? JSON.stringify(error.response.data) : error.message));
    return undefined;
  }
}

async function uploadFromStream(sourceUrl: string, filename: string, forceGoFile: boolean = false): Promise<string | "too-large" | undefined> {
  const source = await axios.get(sourceUrl, { responseType: 'stream' });
  let length = parseInt(source.headers['content-length'] || '0');
  const contentType = source.headers['content-type'];

  if (contentType && contentType.includes('application/json')) {
    const chunks = [];
    for await (const chunk of source.data) {
      chunks.push(chunk);
    }
    const errorBody = Buffer.concat(chunks).toString();
    timeLog(`Cobalt tunnel returned JSON error: ${errorBody}`);
    return undefined;
  }

  if (length === 0 && source.headers['estimated-content-length']) {
    length = parseInt(source.headers['estimated-content-length']);
  }

  if (length > 0 && length < 1000 && filename.endsWith('.mp4')) {
    timeLog(`Stream too small for video (${length} bytes), likely error.`);
    return undefined;
  }

  if (length > GOFILE_LIMIT) {
    source.data.destroy();
    return "too-large";
  }

  // If length is unknown (0) or larger than SEGS_LIMIT, or forced, use GoFile
  if (length === 0 || length > SEGS_LIMIT || forceGoFile) {
    timeLog("Downloading to temp file for GoFile upload...");
    const tempFile = path.join(os.tmpdir(), `dl-${crypto.randomUUID()}.tmp`);
    const writer = fs.createWriteStream(tempFile);
    
    source.data.pipe(writer);
    
    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });
    
    const stat = fs.statSync(tempFile);
    const fileStream = fs.createReadStream(tempFile);
    
    try {
      const result = await uploadGoFile(fileStream, stat.size, filename);
      return result;
    } finally {
      fs.unlinkSync(tempFile);
    }
  }

  // Use Segs/Olrite
  const attemptUpload = async (targetUrl: string) => {
    const form = new FormData();
    form.append("file", source.data, { filename: filename, knownLength: length || undefined });

    const res = await axios.post(targetUrl, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: SEGS_LIMIT,
      maxBodyLength: SEGS_LIMIT
    });
    return res.data.link || res.data.url;
  };

  try {
    return await attemptUpload("https://segs.lol/api/upload");
  } catch (e: any) {
    timeLog("segs.lol failed: " + e.message);
    
    // Re-fetch stream for fallback
    try {
      const source2 = await axios.get(sourceUrl, { responseType: 'stream' });
      const form2 = new FormData();
      form2.append("file", source2.data, { filename: filename, knownLength: length || undefined });
      
      const res = await axios.post("https://olrite.lol/api/upload", form2, {
        headers: { ...form2.getHeaders() },
        maxContentLength: SEGS_LIMIT,
        maxBodyLength: SEGS_LIMIT
      });
      return res.data.url;
    } catch (e: any) {
      timeLog("olrite.lol failed: " + e.message);
      return undefined;
    }
  }
}

const downloadCache = new Map<string, string>();

export default async function download(msg: PrivmsgMessage, linkOrCommand: string | boolean, args?: string[]) {
  let mediaLink: string | null = null;
  let isCommand = false;
  let slideIndex: number | undefined;

  if (typeof linkOrCommand === 'boolean') {
    isCommand = linkOrCommand;
    if (args && args.length > 0) {
      if (args.length > 1 && /^\d+$/.test(args[0])) {
        slideIndex = parseInt(args[0]);
        mediaLink = args[1];
      } else {
        mediaLink = args[0];
      }
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

  const cacheKey = slideIndex ? `${sanitized}|${slideIndex}` : sanitized;

  if (downloadCache.has(cacheKey)) {
    const cachedLink = downloadCache.get(cacheKey)!;
    await saySafe(msg.channelName, `🪞 ${cachedLink}`, msg.messageID);
    return;
  }

  const cobaltResult = await resolveCobaltUrl(sanitized, slideIndex);
  
  if (cobaltResult.status === 'error') {
    if (isCommand) await saySafe(msg.channelName, `Download failed: ${cobaltResult.message}`, msg.messageID);
    else timeLog("Download failed for: " + sanitized + " : " + cobaltResult.message);
    return;
  }

  const isYouTube = sanitized.includes("youtube.com") || sanitized.includes("youtu.be");
  
  const uploadedUrl = await uploadFromStream(cobaltResult.url, cobaltResult.filename, isYouTube);

  if (uploadedUrl === "too-large") {
    await saySafe(msg.channelName, "Video too large to download.", msg.messageID);
    return;
  }

  if (!uploadedUrl) {
    await saySafe(msg.channelName, `uh upload failed`, msg.messageID);
  } else {
    downloadCache.set(cacheKey, uploadedUrl);
    await saySafe(msg.channelName, `🪞 ${uploadedUrl}`, msg.messageID);
  }
}
