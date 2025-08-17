import { client } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { spawn } from "child_process";
import { time } from 'console';
import { timeLog } from '../utils.js';

export default async function fortune(msg: PrivmsgMessage, args: string[]) {
  return new Promise<void>((resolve) => {
    const proc = spawn("fortune", ["-s"]);

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    const emotes = ["Wise", "Wisdom", "facts"];
    const randomEmote = emotes[Math.floor(Math.random() * emotes.length)];

    proc.on("close", () => {
      const cleaned = output.replace(/\s+/g, ' ').trim();
      client.say(msg.channelName, `@${msg.senderUsername}, ${cleaned} ${randomEmote}`);
      resolve();
    });

    proc.on("error", (err) => {
      timeLog("fortune error: " + err);
      client.say(msg.channelName, "error Reacting");
      resolve();
    });
  });
}