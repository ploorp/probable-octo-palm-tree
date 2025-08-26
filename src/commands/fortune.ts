import { client } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { exec } from "child_process";
import { timeLog } from '../utils.js';
import { isWhitelisted, updateStreak } from '../db/dbManager.js';

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
      exec(`/usr/games/fortune ${args.slice(1).join(" ")}`, (err, stdout, stderr) => {
        if (err) {
          timeLog("fortune error: " + err);
          client.say(msg.channelName, "error Reacting");
          return;
        }
        const output = stdout.replace(/\s+/g, ' ').trim();
        let reply = `@${msg.senderUsername}, ${output}`;
        if (reply.length > 490) reply = reply.slice(0, 487) + '...';
        client.say(msg.channelName, reply);
      });
      return;
    }
  }

  return new Promise<void>(async (resolve) => {
    const streak = updateStreak(msg.senderUserID);
    const timeLeft = getTimeLeftToMidnightUTC();

    if (!streak?.success) {
      let reply = `@${msg.senderUsername}, you can see a new fortune in ${timeLeft}, streak of ${streak?.streak}`;
      if (reply.length > 500) reply = reply.slice(0, 497) + '...';
      client.say(msg.channelName, reply);
      return resolve();
    }

    let streakMessage = streak?.streak === 1
      ? "streak of 1 day"
      : `streak of ${streak?.streak} days`;

    exec("/usr/games/fortune -s", (err, stdout, stderr) => {
      if (err) {
        timeLog("fortune error: " + err);
        client.say(msg.channelName, "error Reacting");
        return resolve();
      }
      const cleaned = stdout.replace(/\s+/g, ' ').trim();
      const emotes = ["Wise", "Wisdom", "facts", "👀"];
      const randomEmote = emotes[Math.floor(Math.random() * emotes.length)];
      let reply = `@${msg.senderUsername}, ${streakMessage}. ${cleaned} ${randomEmote}`;
      if (reply.length > 500) reply = reply.slice(0, 497) + '...';
      client.say(msg.channelName, reply);
      resolve();
    });
  });
}