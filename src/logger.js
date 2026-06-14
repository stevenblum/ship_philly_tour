// The logger is the only place application code should call console methods,
// which keeps normal presentation diagnostics separate from authoring traces.
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// readEnvValue supports Vite runtime code and Vitest's Node environment so the
// same logger behavior can be tested without browser-only globals.
function readEnvValue(key, fallback) {
  if (typeof import.meta !== "undefined" && import.meta.env?.[key] !== undefined) {
    return import.meta.env[key];
  }

  if (typeof process !== "undefined" && process.env?.[key] !== undefined) {
    return process.env[key];
  }

  return fallback;
}

// shouldLog implements the level threshold required by VITE_LOG_LEVEL.
function shouldLog(level) {
  const configuredLevel = readEnvValue("VITE_LOG_LEVEL", "info");
  const threshold = LOG_LEVELS[configuredLevel] ?? LOG_LEVELS.info;
  return LOG_LEVELS[level] <= threshold;
}

// isAuthoringEnabled gates coordinate capture and verbose authoring diagnostics
// so production presentation builds do not expose internal authoring tools.
export function isAuthoringEnabled() {
  return readEnvValue("VITE_ENABLE_AUTHORING", "false") === "true";
}

// logger provides level-specific methods plus authoringDebug for development
// details that should disappear when VITE_ENABLE_AUTHORING is false.
export const logger = {
  error(message, details) {
    if (shouldLog("error")) console.error(message, details ?? "");
  },
  warn(message, details) {
    if (shouldLog("warn")) console.warn(message, details ?? "");
  },
  info(message, details) {
    if (shouldLog("info")) console.info(message, details ?? "");
  },
  debug(message, details) {
    if (shouldLog("debug")) console.debug(message, details ?? "");
  },
  authoringDebug(message, details) {
    if (isAuthoringEnabled()) this.debug(message, details);
  },
};
