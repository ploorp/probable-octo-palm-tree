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

  const allowedDomains = /(instagram\.com|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i;
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
      "--embed-metadata",
      "--write-info-json",
      "--", url
    ];
    const proc = spawn("/usr/local/bin/yt-dlp", args);
    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        if (stderr.includes("No video formats found") || stderr.includes("Unsupported URL")) {
          return resolve("not-video");
        }
        timeLog("yt-dlp failed: " + stderr);
        return resolve(null);
      }

      // Find the actual video file (not .info.json)
      const outDir = path.dirname(outputTemplate);
      const outBase = path.basename(outputTemplate, ".%(ext)s");
      try {
        const files = fs.readdirSync(outDir);
        // Find the first file that matches and is not .info.json
        const candidate = files.find(f =>
          f.startsWith(outBase) &&
          !f.endsWith(".info.json") &&
          !f.endsWith(".part") &&
          (f.endsWith(".mp4") || f.endsWith(".mov") || f.endsWith(".webm") || f.endsWith(".mkv"))
        );
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

const downloadCache = new Map<string, string>();

export default async function download(msg: PrivmsgMessage, mediaLink: string) {
  const sanitized = sanitizeUrl(mediaLink);
  if (!sanitized) {
    timeLog("Invalid URL for downloader: " + mediaLink);
    return;
  }

  if (downloadCache.has(sanitized)) {
    const cachedLink = downloadCache.get(sanitized)!;
    await client.say(msg.channelName, `mirror: ${cachedLink}`);
    return;
  }

  const filePath = await ytdlpDownload(sanitized);
  if (!filePath) {
    timeLog("Download failed for: " + sanitized);
    return client.say(msg.channelName, `uh download failed`);
  }
  if (filePath === "not-video") {
    timeLog("Not a video: " + sanitized);
    return;
  }

  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    timeLog("Error getting file stats: " + error);
    return client.say(msg.channelName, `uh error downloading`);
  }

  if (stats.size > sizeLimit) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      timeLog("Error deleting file: " + error);
    }
    timeLog(`File too large: ${stats.size} bytes, limit is ${sizeLimit} bytes`);
    return client.say(msg.channelName, `uh file was too big`);
  }

  const infoJsonPath = filePath + ".info.json";
  let info: any = null;
  if (fs.existsSync(infoJsonPath)) {
    try {
      info = JSON.parse(fs.readFileSync(infoJsonPath, "utf8"));
    } catch (e) {
      timeLog("Failed to parse info.json: " + e);
    }
  }

  if (info) {
    if (info.extractor === "instagram" && (info._type === "playlist" || info.title?.toLowerCase().includes("carousel"))) {
      fs.unlinkSync(filePath);
      fs.unlinkSync(infoJsonPath);
      return client.say(msg.channelName, "Instagram slideshows (carousels) are not supported.");
    }
    if (info.extractor === "tiktok" && (info.is_ad === true || info.title?.toLowerCase().includes("ad"))) {
      fs.unlinkSync(filePath);
      fs.unlinkSync(infoJsonPath);
      return client.say(msg.channelName, "TikTok ads are not supported.");
    }
  }

  try {
    const uploadedUrl = await uploadMedia(filePath);
    if (!uploadedUrl) {
      await client.say(msg.channelName, `uh upload failed`);
    } else {
      downloadCache.set(sanitized, uploadedUrl);
      await client.say(msg.channelName, `mirror: ${uploadedUrl}`);
    }
  } finally {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (fs.existsSync(infoJsonPath)) fs.unlinkSync(infoJsonPath);
    } catch (error) {
      timeLog("Error cleaning up files: " + error);
    }
  }

  return;
}
