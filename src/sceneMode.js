// sceneMode centralizes high-detail scene selection so the presentation loads
// Google Photorealistic 3D Tiles by default while still allowing URL/env
// overrides to fall back to lightweight satellite imagery.
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
// to lightweight so a typo does not accidentally request high-detail tiles.
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

// resolveSceneMode implements the scene-detail policy. URL overrides have
// priority because presenters need a no-code way to switch mode, while
// environment variables provide repeatable defaults for dev, tests, and builds.
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

  // The explicit env boolean is the strongest repeatable server/build default.
  // Tests and low-usage sessions use false to start in satellite imagery.
  const envPhotorealistic = readBooleanFlag(env.VITE_ENABLE_GOOGLE_PHOTOREALISTIC);
  if (envPhotorealistic === true) {
    return buildSceneModeResult("demo", true, "env:VITE_ENABLE_GOOGLE_PHOTOREALISTIC");
  }
  if (envPhotorealistic === false) {
    return buildSceneModeResult(
      "lightweight",
      false,
      "env:VITE_ENABLE_GOOGLE_PHOTOREALISTIC",
    );
  }

  // VITE_SCENE_MODE is the preferred descriptive default when the boolean flag
  // is not present. Missing values now fall through to photorealistic mode.
  const envMode = normalizeSceneMode(env.VITE_SCENE_MODE);
  if (envMode) {
    return buildSceneModeResult(envMode, PHOTOREALISTIC_MODES.has(envMode), "env:VITE_SCENE_MODE");
  }

  return buildSceneModeResult("photorealistic", true, "default");
}

// formatSceneModeStatus produces the human-readable status used in the visible
// badge and log messages so presenters see the same wording everywhere.
export function formatSceneModeStatus(status) {
  const photorealisticState = status.photorealisticEnabled ?? status.usePhotorealistic;
  return `Scene mode: ${status.sceneMode} | Google Photorealistic 3D Tiles: ${
    photorealisticState ? "enabled" : "disabled"
  }`;
}
