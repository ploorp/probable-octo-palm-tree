import { saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { exec } from "child_process";
import { timeLog } from '../utils.js';
import { isWhitelisted, updateStreak } from '../db/dbManager.js';
import config from '../../config.json' with { type: 'json' };

function getTimeLeftToMidnightUTC() {
  const now = new Date();
  const nextMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  const msLeft = nextMidnightUTC.getTime() - now.getTime();
  const hours = Math.floor(msLeft / 1000 / 60 / 60);
  const minutes = Math.floor((msLeft / 1000 / 60) % 60);
  return `${hours}h ${minutes}m`;
}

export default async function fortune(msg: PrivmsgMessage, args: string[]) {
  if (isWhitelisted(msg.senderUserID)) {
    if (args[1]) {
      let f_args = "";
      if (config.admins.includes(msg.senderUserID)) {
        f_args = args.slice(1).join(" ");
      } else {
        for (const char of args.slice(1).join(" ")) {
          if (" -asbcfhnlroptw".includes(char)) {
            f_args += char;
          }
        }
      }
      exec(`/usr/games/fortune ${f_args}`, (err, stdout, stderr) => {
        if (err) {
          timeLog("fortune error: " + err);
          saySafe(msg.channelName, "error Reacting", msg.messageID);
          return;
        }
        let output = stdout.replace(/\s+/g, ' ').trim();
        if (output.length > 490) output = output.slice(0, 487) + '...';
        saySafe(msg.channelName, output, msg.messageID);
      });
      return;
    }
  }

  return new Promise<void>(async (resolve) => {
    const streak = updateStreak(msg.senderUserID);
    const timeLeft = getTimeLeftToMidnightUTC();

    if (!streak?.success) {
      let reply = `you can see a new fortune in ${timeLeft}, streak of ${streak?.streak}`;
      if (reply.length > 500) reply = reply.slice(0, 497) + '...';
      saySafe(msg.channelName, reply, msg.messageID);
      return resolve();
    }

    let streakMessage = streak?.streak === 1
      ? "streak of 1 day"
      : `streak of ${streak?.streak} days`;

    exec("/usr/games/fortune -s", (err, stdout, stderr) => {
      if (err) {
        timeLog("fortune error: " + err);
        saySafe(msg.channelName, "error Reacting", msg.messageID);
        return resolve();
      }
      const cleaned = stdout.replace(/\s+/g, ' ').trim();
      const emotes = ["Wise", "Wisdom", "facts", "👀"];
      const randomEmote = emotes[Math.floor(Math.random() * emotes.length)];
      let reply = `${streakMessage}. ${cleaned} ${randomEmote}`;
      if (reply.length > 500) reply = reply.slice(0, 497) + '...';
      saySafe(msg.channelName, reply, msg.messageID);
      resolve();
    });
  });
}