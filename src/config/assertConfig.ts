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
  helix: {
    access_token: string;
    helix_id: string;
  };
  lastfm: {
    client_id: string;
  };
  tmdb: {
    api_key: string;
  };
  spotify?: {
    client_id: string;
    client_secret: string;
  };
  youtube?: {
    api_key: string;
  };
  osu: {
    client_id: string;
    client_secret: string;
  };
  cobalt_url: string;
  uploader_url: string;
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

  const helix = (rawConfig as any).helix;
  if (!helix || typeof helix !== 'object') {
    throw new Error('config.helix must be an object');
  }
  if (typeof helix.access_token !== 'string') {
    throw new Error('config.helix.access_token must be a string');
  }
  
  if (typeof helix.helix_id !== 'string') {
    throw new Error('config.helix.helix_id must be a string');
  }

  const lastfm = (rawConfig as any).lastfm;
  if (!lastfm || typeof lastfm !== 'object') {
    throw new Error('config.lastfm must be an object');
  }
  if (typeof lastfm.client_id !== 'string') {
    throw new Error('config.lastfm.client_id must be a string');
  }

  const tmdb = (rawConfig as any).tmdb;
  if (!tmdb || typeof tmdb !== 'object') {
    throw new Error('config.tmdb must be an object');
  }
  if (typeof tmdb.api_key !== 'string') {
    throw new Error('config.tmdb.api_key must be a string');
  }

  const spotify = (rawConfig as any).spotify;
  if (spotify) {
    if (typeof spotify.client_id !== 'string') throw new Error('config.spotify.client_id must be a string');
    if (typeof spotify.client_secret !== 'string') throw new Error('config.spotify.client_secret must be a string');
  }

  const youtube = (rawConfig as any).youtube;
  if (youtube) {
    if (typeof youtube.api_key !== 'string') throw new Error('config.youtube.api_key must be a string');
  }

  const osu = (rawConfig as any).osu;
  if (!osu || typeof osu !== 'object') {
    throw new Error('config.osu must be an object');
  }
  if (typeof osu.client_id !== 'string') {
    throw new Error('config.osu.client_id must be a string');
  }
  if (typeof osu.client_secret !== 'string') {
    throw new Error('config.osu.client_secret must be a string');
  }

  if (typeof (rawConfig as any).cobalt_url !== 'string') {
    throw new Error('config.cobalt_url must be a string');
  }

  if (typeof (rawConfig as any).uploader_url !== 'string') {
    throw new Error('config.uploader_url must be a string');
  }

}