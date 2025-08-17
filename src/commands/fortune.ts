import { client } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { spawn } from "child_process";

export default async function fortune(msg: PrivmsgMessage, args: string[]) {
  return new Promise<void>((resolve) => {
    const proc = spawn("fortune", ["-s"]);

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => {
      client.say(msg.channelName, output);
      resolve();
    });

    proc.on("error", (err) => {
      client.say(msg.channelName, "error Reacting");
      resolve();
    });
  });
}