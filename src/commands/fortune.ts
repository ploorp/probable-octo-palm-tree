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

    proc.on("close", () => {
      const cleaned = output.replace(/\s+/g, ' ').trim().slice(0, 400);
      client.say(msg.channelName, cleaned);
      resolve();
    });

    proc.on("error", (err) => {
      timeLog("fortune error: " + err);
      client.say(msg.channelName, "error Reacting");
      resolve();
    });
  });
}