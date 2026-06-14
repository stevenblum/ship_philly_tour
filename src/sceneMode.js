// sceneMode centralizes high-detail scene selection so development, testing,
// and presentations can conserve Google Photorealistic 3D Tiles quota by
// default while still allowing an intentional demo override.
const PHOTOREALISTIC_MODES = new Set(["demo", "photorealistic"]);
const LIGHTWEIGHT_MODES = new Set(["lightweight", "standard"]);

// readRuntimeEnv lets browser code use Vite's import.meta.env and lets Vitest
// call the same parser in Node without creating a Cesium viewer.
function readRuntimeEnv() {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env;
  }

  if (typeof process !== "undefined" && process.env) {
    return process.env;
  }

  return {};
}

// normalizeSearch shields callers from passing either "?mode=demo" or
// "mode=demo", which keeps URL override tests small and deterministic.
function normalizeSearch(search) {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
}

// normalizeSceneMode accepts the documented names and degrades unknown values
// to lightweight so a typo cannot accidentally consume photorealistic quota.
function normalizeSceneMode(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (PHOTOREALISTIC_MODES.has(normalized) || LIGHTWEIGHT_MODES.has(normalized)) {
    return normalized;
  }

  return normalized ? "lightweight" : null;
}

// readBooleanFlag parses URL and env boolean flags while leaving absent or
// unrecognized values neutral so scene mode can be controlled by another input.
function readBooleanFlag(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return null;
}

// buildSceneModeResult returns the compact contract consumed by sceneSetup and
// the UI status badge: the requested mode, whether high-detail tiles should be
// created, and which input made the decision.
function buildSceneModeResult(sceneMode, usePhotorealistic, source) {
  return {
    sceneMode,
    usePhotorealistic,
    source,
  };
}

// resolveSceneMode implements the quota-conservation policy. URL overrides have
// priority because presenters need a no-code way to switch mode for demos, while
// environment variables provide repeatable defaults for dev and build scripts.
export function resolveSceneMode(options = {}) {
  const env = options.env ?? readRuntimeEnv();
  const browserSearch = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(normalizeSearch(options.search ?? browserSearch));

  // The explicit boolean URL override is the strongest control because it can
  // disable photorealistic mode even if a demo env script was used.
  const urlPhotorealistic = readBooleanFlag(params.get("photorealistic"));
  if (urlPhotorealistic !== null) {
    return buildSceneModeResult(
      urlPhotorealistic ? "demo" : "lightweight",
      urlPhotorealistic,
      "url:photorealistic",
    );
  }

  // The named URL mode is the normal presenter-facing switch:
  // http://localhost:5173/?mode=demo.
  const urlMode = normalizeSceneMode(params.get("mode"));
  if (urlMode) {
    return buildSceneModeResult(urlMode, PHOTOREALISTIC_MODES.has(urlMode), "url:mode");
  }

  // A true env flag intentionally enables demo visuals for a whole dev server
  // session; false stays neutral so VITE_SCENE_MODE can still be used alone.
  const envPhotorealistic = readBooleanFlag(env.VITE_ENABLE_GOOGLE_PHOTOREALISTIC);
  if (envPhotorealistic === true) {
    return buildSceneModeResult("demo", true, "env:VITE_ENABLE_GOOGLE_PHOTOREALISTIC");
  }

  // VITE_SCENE_MODE is the preferred descriptive default. Missing, invalid, or
  // explicit lightweight values keep the app in low-usage mode.
  const envMode = normalizeSceneMode(env.VITE_SCENE_MODE);
  if (envMode) {
    return buildSceneModeResult(envMode, PHOTOREALISTIC_MODES.has(envMode), "env:VITE_SCENE_MODE");
  }

  return buildSceneModeResult("lightweight", false, "default");
}

// formatSceneModeStatus produces the human-readable status used in the visible
// badge and log messages so presenters see the same wording everywhere.
export function formatSceneModeStatus(status) {
  const photorealisticState = status.photorealisticEnabled ?? status.usePhotorealistic;
  return `Scene mode: ${status.sceneMode} | Google Photorealistic 3D Tiles: ${
    photorealisticState ? "enabled" : "disabled"
  }`;
}
