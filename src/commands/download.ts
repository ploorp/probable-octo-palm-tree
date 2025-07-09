import { client } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
import { timeLog } from '../utils.js';
import validator from "validator";
const { isURL, trim } = validator;

const sizeLimit = 200 * 1024 * 1024;

function sanitizeUrl(rawUrl: string): string | null {
  const cleaned = trim(rawUrl).replace(/[<>\s]/g, "");

  if (!isURL(cleaned, { require_protocol: false })) return null;

  const allowedDomains = /(instagram\.com|tiktok\.com)/i;
  try {
    const url = new URL(cleaned.startsWith("http") ? cleaned : "https://" + cleaned);
    if (!allowedDomains.test(url.hostname)) return null;
    return url.href;
  } catch {
    timeLog("Invalid URL for downloader:" + cleaned);
    return null;
  }
}

async function uploadMedia(filePath: string): Promise<string | undefined> {
  let response;

  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  try {
    response = await axios.post("https://segs.lol/api/upload", form, {
      headers: form.getHeaders(),
      maxContentLength: sizeLimit,
      maxBodyLength: sizeLimit,
    });
  } catch (error) {
    timeLog("Upload failed: " +  error);
    return;
  }

  const ext = path.extname(filePath);
  return `${response.data.link}${ext}`;
}

function ytdlpDownload(url: string): Promise<string | null> {
  const outputTemplate = path.join(os.tmpdir(), `dl-${crypto.randomUUID()}.%(ext)s`);
  const cookiesPath = "/home/ploorp/cookies.txt"; // cookies for instant gram

  return new Promise((resolve) => {
    const args = [
      "-o", outputTemplate,
      "--no-playlist",
      "--cookies", cookiesPath,
      "--force-ipv4",
      "-S", "vcodec:h264",
      "--max-filesize", "200M",
      "--restrict-filenames",
      "--merge-output-format", "mp4",
      "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
      "--", url
    ];
    const proc = spawn("/usr/local/bin/yt-dlp", args);
    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        if (stderr.includes("No video formats found")) {
          return resolve("not-video");
        }
        timeLog("yt-dlp failed: " + stderr);
        return resolve(null);
      }

      const match = stderr.match(/Destination:\s(.+)/);
      if (match) {
        return resolve(match[1].trim());
      }

      const outDir = path.dirname(outputTemplate);
      const outBase = path.basename(outputTemplate, ".%(ext)s");
      try {
        const files = fs.readdirSync(outDir);
        const candidate = files.find(f => f.startsWith(outBase));
        if (candidate) {
          return resolve(path.join(outDir, candidate));
        }
      } catch (err) {
        timeLog("error reading temp dir: " + err);
      }

      return resolve(null);
    });

    proc.on("error", (err) => {
      timeLog("yt-dlp spawn error: " + err);
      resolve(null);
    });
  });
}

export default async function download(msg: PrivmsgMessage, mediaLink: string) {
  const sanitized = sanitizeUrl(mediaLink);
  if (!sanitized) {
    timeLog("Invalid URL for downloader: " + mediaLink);
    return;
  }

  const filePath = await ytdlpDownload(sanitized);
  if (!filePath) {
    timeLog("Download failed for: " + sanitized);
    return client.say(msg.channelName, `@${msg.senderUsername}, uh download failed`);
  }
  if (filePath === "not-video") return;

  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    timeLog("Error getting file stats: " + error);
    return client.say(msg.channelName, `@${msg.senderUsername}, uh error downloading`);
  }

  if (stats.size > sizeLimit) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      timeLog("Error deleting file: " + error);
    }
    timeLog(`File too large: ${stats.size} bytes, limit is ${sizeLimit} bytes`);
    return client.say(msg.channelName, `@${msg.senderUsername}, uh file was too big`);
  }

  try {
    const uploadedUrl = await uploadMedia(filePath);
    if (!uploadedUrl) {
      await client.say(msg.channelName, `@${msg.senderUsername}, uh upload failed`);
    } else {
      await client.say(msg.channelName, `@${msg.senderUsername}, ${uploadedUrl}`);
    }
  } finally {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      timeLog("Error cleaning up file: " + error);
    }
  }

  return;
}
