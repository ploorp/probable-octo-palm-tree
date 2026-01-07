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
const cobaltUrl = "http://localhost:9001";

export const downloadLinkPattern =
  /\S*(tiktok\.com\/\S+|(instagram|facebook)\.com\/(reels?|p|share)\/\S+|(x|twitter)\.com\/(?:i\/)?(?:\w+\/)?status\/\d+)/i;

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
  | { status: 'success'; url: string; filename: string; isImage: boolean }
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
    let isImage = false;

    if (['redirect', 'tunnel', 'stream'].includes(data.status)) {
      downloadUrl = data.url;
      if (data.filename) filename = data.filename;
    } else if (data.status === 'picker' && data.picker?.length) {
      const item = slideIndex ? data.picker[slideIndex - 1] : data.picker[0];
      if (!item) return { status: 'error', message: 'Picker item not found' };

      downloadUrl = item.url;
      if (item.type === 'photo') {
        filename = 'image.jpg';
        isImage = true;
      } else if (item.type === 'gif') {
        filename = 'image.gif';
      }
    }

    if (!downloadUrl) {
      timeLog("Cobalt failed: " + JSON.stringify(data));
      return { status: 'error', message: 'Cobalt processing failed' };
    }

    if (!isImage && /\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      isImage = true;
    }

    return { status: 'success', url: downloadUrl, filename, isImage };

  } catch (err: any) {
    const code = err.response?.data?.error?.code;
    timeLog("Cobalt error: " + (code || err.message));
    return { status: 'error', message: code || 'Cobalt error' };
  }
}

/* ---------------- Unified upload ---------------- */

async function uploadFromStream(
  sourceUrl: string,
  filename: string
): Promise<string | "too-large" | undefined> {

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

  const cacheKey = slideIndex ? `${sanitized}|${slideIndex}` : sanitized;
  if (downloadCache.has(cacheKey)) {
    await saySafe(msg.channelName, `🪞 ${downloadCache.get(cacheKey)}`, msg.messageID);
    return;
  }

  const cobalt = await resolveCobaltUrl(sanitized, slideIndex);
  if (cobalt.status === 'error') return;

  const isExplicit = typeof linkOrCommand === 'boolean';
  const hostname = new URL(sanitized).hostname;
  const isTwitter = hostname.includes('twitter.com') || hostname.includes('x.com');

  if (!isExplicit && isTwitter && cobalt.isImage) {
    return;
  }

  const uploaded = await uploadFromStream(
    cobalt.url,
    cobalt.filename
  );

  if (!uploaded || uploaded === "too-large") return;

  downloadCache.set(cacheKey, uploaded);
  await saySafe(msg.channelName, `🪞 ${uploaded}`, msg.messageID);
}
