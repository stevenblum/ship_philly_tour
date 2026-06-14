// This module centralizes deployment path behavior so Vite and Cesium resolve
// runtime files from the same base path in local and GitHub Pages builds.
const DEFAULT_BASE_PATH = "/";

// normalizeBasePath ensures Vite receives a root-relative path with a trailing
// slash, which is required for predictable asset URLs in both build targets.
export function normalizeBasePath(basePath = DEFAULT_BASE_PATH) {
  const trimmedPath = `${basePath || DEFAULT_BASE_PATH}`.trim();
  const withLeadingSlash = trimmedPath.startsWith("/")
    ? trimmedPath
    : `/${trimmedPath}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

// getCesiumBaseUrl ties Cesium worker/static asset loading to the same base
// path used by Vite so GitHub Pages project-site deployment does not break.
export function getCesiumBaseUrl(basePath = DEFAULT_BASE_PATH) {
  return `${normalizeBasePath(basePath)}cesiumStatic`;
}
