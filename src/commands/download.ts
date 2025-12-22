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

const SEGS_LIMIT = 190 * 1024 * 1024;
const GOFILE_LIMIT = 10 * 1024 * 1024 * 1024;
const cobaltUrl = "http://localhost:9001";

export const downloadLinkPattern =
  /\S*(tiktok\.com\/\S+|(instagram|facebook)\.com\/(reels?|p|share)\/\S+|(x|twitter)\.com\/(?:i\/)?(?:\w+\/)?status\/\d+|(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)\S+|youtu\.be\/\S+)/i;

function sanitizeUrl(rawUrl: string): string | null {
  const cleaned = trim(rawUrl).replace(/[<>\s]/g, "");
  if (!downloadLinkPattern.test(cleaned)) return null;
  if (!isURL(cleaned, { require_protocol: false })) return null;

  try {
    const url = new URL(cleaned.startsWith("http") ? cleaned : "https://" + cleaned);
    return url.href;
  } catch {
    timeLog("Invalid URL for downloader: " + cleaned);
    return null;
  }
}

type CobaltResult =
  | { status: 'success'; url: string; filename: string }
  | { status: 'error'; message: string };

async function resolveCobaltUrl(url: string, slideIndex?: number): Promise<CobaltResult> {
  try {
    const response = await axios.post(
      cobaltUrl,
      { url }, // <-- THIS IS THE CRITICAL PART
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    let downloadUrl: string | null = null;
    let filename = 'video.mp4';

    if (['redirect', 'tunnel', 'stream'].includes(data.status)) {
      downloadUrl = data.url;
      if (data.filename) filename = data.filename;
    } else if (data.status === 'picker' && data.picker?.length) {
      const item = slideIndex ? data.picker[slideIndex - 1] : data.picker[0];
      if (!item) return { status: 'error', message: 'Picker item not found' };

      downloadUrl = item.url;
      filename =
        item.type === 'photo' ? 'image.jpg' :
        item.type === 'gif'   ? 'image.gif'  :
        filename;
    }

    if (!downloadUrl) {
      timeLog("Cobalt failed: " + JSON.stringify(data));
      return { status: 'error', message: 'Cobalt processing failed' };
    }

    return { status: 'success', url: downloadUrl, filename };

  } catch (err: any) {
    const code = err.response?.data?.error?.code;
    timeLog("Cobalt error: " + (code || err.message));
    return { status: 'error', message: code || 'Cobalt error' };
  }
}

/* ---------------- Tunnel helpers ---------------- */

async function downloadTunnelToFile(sourceUrl: string, tempFile: string): Promise<number> {
  const response = await axios.get(sourceUrl, {
    responseType: 'stream',
    proxy: false, // ← CRITICAL FIX
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Range': 'bytes=0-',
    },
    timeout: 0,
  });

  let bytes = 0;
  const writer = fs.createWriteStream(tempFile);

  response.data.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
  });

  response.data.pipe(writer);

  await new Promise<void>((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    response.data.on('error', reject);
  });

  return bytes;
}

/* ---------------- GoFile upload ---------------- */

async function uploadGoFile(stream: any, length: number, filename: string): Promise<string | undefined> {
  timeLog(`Uploading to GoFile: ${filename} (${length} bytes)`);

  const form = new FormData();
  form.append("file", stream, { filename, knownLength: length });

  const uploadRes = await axios.post(
    "https://store1.gofile.io/uploadfile",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${config.gofile.token}`,
      },
      maxBodyLength: GOFILE_LIMIT,
      maxContentLength: GOFILE_LIMIT,
    }
  );

  if (uploadRes.data.status !== 'ok') {
    timeLog("GoFile upload failed: " + JSON.stringify(uploadRes.data));
    return undefined;
  }

  return uploadRes.data.data.downloadPage;
}

/* ---------------- YouTube-safe path ---------------- */

async function downloadAndUploadGoFile(sourceUrl: string, filename: string): Promise<string | undefined> {
  timeLog("Downloading tunnel to temp file (YouTube-safe)");
  const tempFile = path.join(os.tmpdir(), `dl-${crypto.randomUUID()}.tmp`);

  try {
    const bytes = await downloadTunnelToFile(sourceUrl, tempFile);
    timeLog(`Downloaded ${bytes} bytes`);

    if (bytes === 0) {
      timeLog("Zero-byte tunnel response");
      return undefined;
    }

    return await uploadGoFile(fs.createReadStream(tempFile), bytes, filename);
  } catch (err: any) {
    timeLog("Temp download failed: " + err.message);
    return undefined;
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
}

/* ---------------- Unified upload ---------------- */

async function uploadFromStream(
  sourceUrl: string,
  filename: string,
  forceGoFile: boolean
): Promise<string | "too-large" | undefined> {

  if (forceGoFile) {
    return await downloadAndUploadGoFile(sourceUrl, filename);
  }

  const source = await axios.get(sourceUrl, { responseType: 'stream' });
  let length = parseInt(source.headers['content-length'] || '0');

  if (length > SEGS_LIMIT) {
    source.data.destroy();
    return "too-large";
  }

  const form = new FormData();
  form.append("file", source.data, { filename, knownLength: length || undefined });

  try {
    const res = await axios.post("https://segs.lol/api/upload", form, {
      headers: form.getHeaders(),
      maxBodyLength: SEGS_LIMIT,
      maxContentLength: SEGS_LIMIT,
    });
    return res.data.link || res.data.url;
  } catch {
    return undefined;
  }
}

/* ---------------- Command entry ---------------- */

const downloadCache = new Map<string, string>();

export default async function download(
  msg: PrivmsgMessage,
  linkOrCommand: string | boolean,
  args?: string[]
) {
  let mediaLink: string | null = null;
  let slideIndex: number | undefined;

  if (typeof linkOrCommand === 'boolean') {
    if (args?.length) {
      if (/^\d+$/.test(args[0])) {
        slideIndex = parseInt(args[0]);
        mediaLink = args[1];
      } else {
        mediaLink = args[0];
      }
    }
  } else {
    mediaLink = linkOrCommand;
  }

  if (!mediaLink) return;

  const sanitized = sanitizeUrl(mediaLink);
  if (!sanitized) return;

  const isYouTube =
    sanitized.includes("youtube.com") || sanitized.includes("youtu.be");

  const cacheKey = slideIndex ? `${sanitized}|${slideIndex}` : sanitized;
  if (downloadCache.has(cacheKey)) {
    await saySafe(msg.channelName, `🪞 ${downloadCache.get(cacheKey)}`, msg.messageID);
    return;
  }

  const cobalt = await resolveCobaltUrl(sanitized, slideIndex);
  if (cobalt.status === 'error') return;

  // Safety check after tunnel resolution
  if (isYouTube && !cobalt.filename.endsWith('.mp4')) {
    timeLog("Unexpected YouTube filename: " + cobalt.filename);
  }

  const uploaded = await uploadFromStream(
    cobalt.url,
    cobalt.filename,
    isYouTube
  );

  if (!uploaded || uploaded === "too-large") return;

  downloadCache.set(cacheKey, uploaded);
  await saySafe(msg.channelName, `🪞 ${uploaded}`, msg.messageID);
}
