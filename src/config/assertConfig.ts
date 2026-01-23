export function assertConfig<T extends Record<string, unknown>>(rawConfig: T): T & {
  admins: string[];
  channels: string[];
  whitelist_channels: string[];
} {
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

  return rawConfig as T & { admins: string[]; channels: string[]; whitelist_channels: string[]; };
}