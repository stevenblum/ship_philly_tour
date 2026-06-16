import { normalizeBasePath } from "./basePath.js";

// readRuntimeBasePath resolves Vite's configured public base path in browser
// builds while keeping Node-based unit tests able to pass an explicit base.
function readRuntimeBasePath() {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env.BASE_URL ?? import.meta.env.VITE_APP_BASE_PATH ?? "/";
  }

  if (typeof process !== "undefined" && process.env) {
    return process.env.VITE_APP_BASE_PATH ?? "/";
  }

  return "/";
}

// buildPublicAssetUrl converts files served from public/ into runtime URLs.
// GitHub Pages project sites need the repository base path prefixed, while
// local root hosting should keep the same authored `/photos/...` behavior.
export function buildPublicAssetUrl(
  source,
  basePath = readRuntimeBasePath(),
) {
  if (!source || /^(https?:|data:|blob:)/i.test(source)) return source;

  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedSource = source.startsWith("/") ? source.slice(1) : source;

  return `${normalizedBasePath}${normalizedSource}`;
}
