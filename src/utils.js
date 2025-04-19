import fs from 'fs';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const logToFile = (message, file) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFile(file, logMessage);
}
