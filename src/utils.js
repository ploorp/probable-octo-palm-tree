import fs from 'fs';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const logToFile = (message, file) => {
  const timestamp = new Date().toLocaleString('en-US', {hour12: false});
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFile(file, logMessage, err => {
    if (err) {
      console.error(`Error writing to log file: ${err}`);
    }
  });
}
