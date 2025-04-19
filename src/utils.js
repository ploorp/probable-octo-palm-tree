import fs from 'fs';
import path from 'path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const toLogFile = (message, file) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  const logFile = path.join(__dirname, file);

  fs.appendFile(logFile, logMessage);
}
