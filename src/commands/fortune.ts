import { client } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { spawn } from "child_process";
import { timeLog } from '../utils.js';
import { setStreak } from '../db/dbManager.js';

function getTimeLeftToMidnightUTC() {
  const now = new Date();
  const nextMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  const msLeft = nextMidnightUTC.getTime() - now.getTime();
  const hours = Math.floor(msLeft / 1000 / 60 / 60);
  const minutes = Math.floor((msLeft / 1000 / 60) % 60);
  return `${hours}h ${minutes}m`;
}

export default async function fortune(msg: PrivmsgMessage, args: string[]) {
  return new Promise<void>((resolve) => {
    const streak = setStreak(msg.senderUserID, msg.senderUsername);
    const timeLeft = getTimeLeftToMidnightUTC();
    let streakMessage = "";
    
    if (!streak?.success) {
      streakMessage = `you can open another fortune in ${timeLeft}, current streak is ${streak?.streak}`;
    } else if (streak?.streak === 1) {
      streakMessage = `current streak is 1 day 🥀`;
    } else {
      streakMessage = `current streak is ${streak?.streak} days`;
    }

    const proc = spawn("/usr/games/fortune", ["-s"]);

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    const emotes = ["Wise", "Wisdom", "facts", "👀"];
    const randomEmote = emotes[Math.floor(Math.random() * emotes.length)];

    proc.on("close", () => {
      const cleaned = output.replace(/\s+/g, ' ').trim();
      client.say(msg.channelName, `@${msg.senderUsername}, ${streakMessage}. ${cleaned} ${randomEmote}`);
      resolve();
    });

    proc.on("error", (err) => {
      timeLog("fortune error: " + err);
      client.say(msg.channelName, "error Reacting");
      resolve();
    });
  });
}