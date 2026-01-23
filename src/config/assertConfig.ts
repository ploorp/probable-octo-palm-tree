export type AppConfig = {
  admins: string[];
  channels: string[];
  whitelist_channels: string[];
  prefix: string;
  id: string;
  username: string;
  cooldown: number;
  commands: {
    osu_enabled: boolean;
    fortune_enabled: boolean;
    downloader_enabled: boolean;
    gup: boolean;
  };
  [key: string]: unknown;
};

export function assertConfig(rawConfig: Record<string, unknown>): asserts rawConfig is AppConfig {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('config.json is missing or invalid');
  }

  if (!Array.isArray((rawConfig as any).admins) || !(rawConfig as any).admins.every((id: unknown) => typeof id === 'string')) {
    throw new Error('config.admins must be an array of strings');
  }

  if (!Array.isArray((rawConfig as any).channels) || !(rawConfig as any).channels.every((id: unknown) => typeof id === 'string')) {
    throw new Error('config.channels must be an array of strings');
  }

  if (!Array.isArray((rawConfig as any).whitelist_channels) || !(rawConfig as any).whitelist_channels.every((id: unknown) => typeof id === 'string')) {
    throw new Error('config.whitelist_channels must be an array of strings');
  }

  if (typeof (rawConfig as any).prefix !== 'string') {
    throw new Error('config.prefix must be a string');
  }

  if (typeof (rawConfig as any).id !== 'string') {
    throw new Error('config.id must be a string');
  }

  if (typeof (rawConfig as any).username !== 'string') {
    throw new Error('config.username must be a string');
  }

  if (typeof (rawConfig as any).cooldown !== 'number') {
    throw new Error('config.cooldown must be a number');
  }

  const commands = (rawConfig as any).commands;
  if (!commands || typeof commands !== 'object') {
    throw new Error('config.commands must be an object');
  }
  for (const key of ['osu_enabled', 'fortune_enabled', 'downloader_enabled', 'gup']) {
    if (typeof (commands as any)[key] !== 'boolean') {
      throw new Error(`config.commands.${key} must be a boolean`);
    }
  }

}