import rawConfig from '../../config.json' with { type: 'json' };
import { assertConfig, AppConfig } from './assertConfig.js';

const config = rawConfig as AppConfig;
assertConfig(config);

export default config;
export type { AppConfig };
