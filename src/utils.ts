export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const timeLog = (message: string) => {
  const timestamp = new Date().toLocaleString('en-US', {hour12: false});
  const logMessage = `[${timestamp}] ${message}`;

  console.error(logMessage);
}

// trim, but it also removes the reserved character
export const ttrim = (str: string) => {
  const pattern = /^[\s\u{E0000}]+|[\s\u{E0000}]+$/gu;
  return str.replace(pattern, '');
}