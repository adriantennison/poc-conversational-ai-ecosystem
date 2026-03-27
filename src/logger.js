import { config } from './config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function formatMsg(level, msg, data) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data && Object.keys(data).length ? { data } : {}),
  };
  return JSON.stringify(entry);
}

export const logger = {
  error: (msg, data) => currentLevel >= LEVELS.error && console.error(formatMsg('error', msg, data)),
  warn: (msg, data) => currentLevel >= LEVELS.warn && console.warn(formatMsg('warn', msg, data)),
  info: (msg, data) => currentLevel >= LEVELS.info && console.log(formatMsg('info', msg, data)),
  debug: (msg, data) => currentLevel >= LEVELS.debug && console.log(formatMsg('debug', msg, data)),
};
