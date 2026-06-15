import * as Cesium from "cesium";
import CesiumNavigation from "cesium-navigation-es6/dist/CesiumNavigation.js";
import { logger } from "./logger.js";
import { formatSceneModeStatus, resolveSceneMode } from "./sceneMode.js";

// LIGHTWEIGHT_IMAGERY_URL points at ArcGIS World Imagery because it provides a
// satellite basemap without requiring this app's Cesium ion token to include
// Cesium World Imagery permissions.
const LIGHTWEIGHT_IMAGERY_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

// createLightweightBaseLayer provides the minimum expected visual context for
// development mode: satellite/aerial imagery without Google Photorealistic 3D
// Tiles. Cached ArcGIS tiles are more reliable for the low-altitude WIP flight
// than dynamic image export, which can reject very small close-range extents.
function createLightweightBaseLayer() {
  return Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromUrl(LIGHTWEIGHT_IMAGERY_URL, {
      enablePickFeatures: false,
      usePreCachedTilesIfAvailable: true,
    }),
  );
}

// buildViewerOptions centralizes widget choices so photorealistic and
// lightweight scenes keep the same presentation-focused UI surface.
export function buildViewerOptions({ photorealistic }) {
  return {
    timeline: false,
    animation: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    selectionIndicator: false,
    baseLayer: photorealistic ? undefined : createLightweightBaseLayer(),
    geocoder: photorealistic ? Cesium.IonGeocodeProviderType.GOOGLE : false,
    globe: photorealistic ? false : undefined,
  };
}

// buildNavigationOptions keeps the third-party navigation widget integration
// minimal and easy to remove. These are the plugin's standard compass, zoom,
// distance legend, and outer-ring controls with no custom compass behavior.
export function buildNavigationOptions() {
  return {
    enableCompass: true,
    enableZoomControls: true,
    enableDistanceLegend: true,
    enableCompassOuterRing: true,
  };
}

// installCesiumNavigation adds the standard Cesium navigation plugin immediately
// after Viewer construction so presenters have a visible north/rotation
// reference without changing tour camera authoring or flight behavior.
function installCesiumNavigation(viewer) {
  viewer.cesiumNavigation = new CesiumNavigation(
    viewer,
    buildNavigationOptions(),
  );
}

// buildSceneStatus separates the requested mode from the actually active mode
// so the app can report a lightweight fallback after missing-token or tile-load
// failures without losing the presenter-selected source.
function buildSceneStatus(modeConfig, overrides = {}) {
  return {
    sceneMode: overrides.sceneMode ?? modeConfig.sceneMode,
    requestedMode: modeConfig.sceneMode,
    photorealisticEnabled: overrides.photorealisticEnabled ?? false,
    source: modeConfig.source,
    reason: overrides.reason ?? "configured",
    errorStatusCode: overrides.errorStatusCode,
  };
}

// createViewer constructs the Cesium Viewer. Keeping this in a helper lets the
// fallback path recreate the viewer if a globe-less photorealistic scene fails.
function createViewer(containerId, options) {
  const viewer = new Cesium.Viewer(containerId, options);
  installCesiumNavigation(viewer);

  if (viewer.scene.globe) {
    viewer.scene.globe.depthTestAgainstTerrain = true;
  }

  return viewer;
}

// ensureCreditsVisible protects Cesium and Google attribution in demo mode.
// Cesium shows credits by default; this guard makes the requirement explicit if
// future CSS or UI changes accidentally hide the credit container.
function ensureCreditsVisible(viewer) {
  const creditContainer = viewer.cesiumWidget?.creditContainer;

  if (creditContainer) {
    creditContainer.style.display = "";
    creditContainer.removeAttribute("aria-hidden");
  }
}

// buildGooglePhotorealisticTilesetConfig makes 3D Tiles creation testable and
// keeps the collision setting tied to the surface-clamped callout requirement.
export function buildGooglePhotorealisticTilesetConfig() {
  return {
    apiOptions: {
      onlyUsingWithGoogleGeocoder: true,
    },
    tilesetOptions: {
      enableCollision: true,
    },
  };
}

// readPhotorealisticErrorStatusCode normalizes Cesium RequestErrorEvent objects
// and fetch-like errors so the runtime toggle can report permission failures in
// operator language instead of only saying that tiles failed to load.
function readPhotorealisticErrorStatusCode(error) {
  const statusCode =
    error?.statusCode ??
    error?.response?.status ??
    error?.response?.statusCode ??
    error?.status;
  const numericStatusCode = Number(statusCode);

  return Number.isFinite(numericStatusCode) ? numericStatusCode : undefined;
}

// classifyPhotorealisticTilesError turns Cesium's lower-level request failure
// into the app's scene-status reason contract. A 401/403 from asset 2275207
// means the ion token, asset permission, or allowed URL restriction denied
// access, which is the failure presenters most need to understand quickly.
export function classifyPhotorealisticTilesError(error) {
  const statusCode = readPhotorealisticErrorStatusCode(error);

  if (statusCode === 401 || statusCode === 403) {
    return {
      reason: "access-forbidden",
      errorStatusCode: statusCode,
    };
  }

  return {
    reason: "tile-load-failed",
    errorStatusCode: statusCode,
  };
}

// createLightweightViewer provides the default low-usage scene. It avoids
// Google Photorealistic 3D Tiles while preserving camera, entity, callout,
// overlay, and authoring behavior for normal coding and rehearsals.
function createLightweightViewer(containerId) {
  logger.info("Using lightweight Cesium scene.");
  return createViewer(
    containerId,
    buildViewerOptions({ photorealistic: false }),
  );
}

// readCesiumIonToken centralizes token lookup so startup scene mode and the
// runtime checkbox use the same source. Vite exposes import.meta.env in browser
// builds, while tests can pass an explicit token into the toggle helper.
function readCesiumIonToken(options = {}) {
  if (options.token !== undefined) return options.token;

  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_CESIUM_ION_TOKEN !== undefined
  ) {
    return import.meta.env.VITE_CESIUM_ION_TOKEN;
  }

  if (
    typeof process !== "undefined" &&
    process.env?.VITE_CESIUM_ION_TOKEN !== undefined
  ) {
    return process.env.VITE_CESIUM_ION_TOKEN;
  }

  return undefined;
}

// setLightweightGlobeVisible hides the default globe while Google
// Photorealistic 3D Tiles are active and restores it when the user disables the
// checkbox. Keeping the original globe in the same viewer preserves tour
// entities, camera state, and Cesium Navigation controls across mode changes.
function setLightweightGlobeVisible(viewer, visible) {
  if (viewer.scene.globe) {
    viewer.scene.globe.show = visible;
  }
}

// addGooglePhotorealisticTiles is called only after startup config or the
// runtime checkbox explicitly selects high-detail mode, which prevents
// accidental quota usage during development and automated tests.
async function addGooglePhotorealisticTiles(viewer, options = {}) {
  try {
    const { apiOptions, tilesetOptions } =
      buildGooglePhotorealisticTilesetConfig();
    const createTileset =
      options.createTileset ?? Cesium.createGooglePhotorealistic3DTileset;
    const tileset = await createTileset(apiOptions, tilesetOptions);
    // enableCollision is required for CLAMP_TO_GROUND entities to resolve
    // against Photorealistic 3D Tiles rather than only the ellipsoid/terrain.
    tileset.enableCollision = true;
    viewer.scene.primitives.add(tileset);
    ensureCreditsVisible(viewer);
    logger.info("Google Photorealistic 3D Tiles loaded.");
    return { tileset };
  } catch (error) {
    const failure = classifyPhotorealisticTilesError(error);
    logger.warn(
      failure.reason === "access-forbidden"
        ? "Cesium ion denied access to Google Photorealistic 3D Tiles. Check token asset permissions and allowed URLs."
        : "Failed to load Google Photorealistic 3D Tiles. Falling back to the lightweight Cesium scene.",
      { ...failure, error },
    );
    return failure;
  }
}

// setGooglePhotorealisticTilesEnabled is the runtime scene-detail switch used by
// the UI checkbox. It intentionally toggles only the Google tileset primitive
// and lightweight globe visibility, so the tour manager, callouts, arrows,
// chevrons, camera state, and navigation widget remain intact.
export async function setGooglePhotorealisticTilesEnabled(
  viewer,
  enabled,
  options = {},
) {
  const token = readCesiumIonToken(options);

  if (token) {
    Cesium.Ion.defaultAccessToken = token;
  }

  if (!enabled) {
    if (viewer.shipyardPhotorealisticTileset) {
      viewer.scene.primitives.remove(viewer.shipyardPhotorealisticTileset);
      viewer.shipyardPhotorealisticTileset = undefined;
    }

    setLightweightGlobeVisible(viewer, true);
    const sceneStatus = buildSceneStatus(
      { sceneMode: "lightweight", source: "ui:photorealistic-toggle" },
      { reason: "user-disabled" },
    );
    logger.info(formatSceneModeStatus(sceneStatus));
    return sceneStatus;
  }

  if (viewer.shipyardPhotorealisticTileset) {
    setLightweightGlobeVisible(viewer, false);
    const sceneStatus = buildSceneStatus(
      { sceneMode: "photorealistic", source: "ui:photorealistic-toggle" },
      { photorealisticEnabled: true, reason: "already-loaded" },
    );
    logger.info(formatSceneModeStatus(sceneStatus));
    return sceneStatus;
  }

  if (!token) {
    logger.warn(
      "VITE_CESIUM_ION_TOKEN is missing; photorealistic tiles are unavailable.",
    );
    const sceneStatus = buildSceneStatus(
      { sceneMode: "lightweight", source: "ui:photorealistic-toggle" },
      { reason: "missing-token" },
    );
    logger.warn(formatSceneModeStatus(sceneStatus));
    return sceneStatus;
  }

  const tileLoadResult = await addGooglePhotorealisticTiles(viewer, options);

  if (!tileLoadResult.tileset) {
    setLightweightGlobeVisible(viewer, true);
    const sceneStatus = buildSceneStatus(
      { sceneMode: "lightweight", source: "ui:photorealistic-toggle" },
      {
        reason: tileLoadResult.reason ?? "tile-load-failed",
        errorStatusCode: tileLoadResult.errorStatusCode,
      },
    );
    logger.warn(formatSceneModeStatus(sceneStatus));
    return sceneStatus;
  }

  viewer.shipyardPhotorealisticTileset = tileLoadResult.tileset;
  setLightweightGlobeVisible(viewer, false);
  const sceneStatus = buildSceneStatus(
    { sceneMode: "photorealistic", source: "ui:photorealistic-toggle" },
    { photorealisticEnabled: true, reason: "user-enabled" },
  );
  logger.info(formatSceneModeStatus(sceneStatus));
  return sceneStatus;
}

// setupScene creates a lightweight scene by default and only loads Google
// Photorealistic 3D Tiles when URL or environment configuration explicitly asks
// for high-detail demo mode.
export async function setupScene(containerId) {
  const modeConfig = resolveSceneMode();
  const token = readCesiumIonToken();

  if (token) {
    Cesium.Ion.defaultAccessToken = token;
  }

  logger.info(formatSceneModeStatus(modeConfig), { source: modeConfig.source });

  const viewer = createLightweightViewer(containerId);

  if (!modeConfig.usePhotorealistic) {
    const sceneStatus = buildSceneStatus(modeConfig, {
      reason: "low-usage-default",
    });
    logger.info(formatSceneModeStatus(sceneStatus));
    return { viewer, sceneStatus };
  }

  if (!token) {
    logger.warn(
      "VITE_CESIUM_ION_TOKEN is missing; photorealistic tiles are unavailable.",
    );
    const sceneStatus = buildSceneStatus(modeConfig, {
      sceneMode: "lightweight",
      reason: "missing-token",
    });
    logger.warn(formatSceneModeStatus(sceneStatus));
    return { viewer, sceneStatus };
  }

  const loadedStatus = await setGooglePhotorealisticTilesEnabled(viewer, true, {
    token,
  });

  if (!loadedStatus.photorealisticEnabled) {
    const sceneStatus = buildSceneStatus(modeConfig, {
      sceneMode: "lightweight",
      reason: loadedStatus.reason,
    });
    logger.warn(formatSceneModeStatus(sceneStatus));
    return { viewer, sceneStatus };
  }

  const sceneStatus = buildSceneStatus(modeConfig, {
    photorealisticEnabled: true,
  });
  logger.info(formatSceneModeStatus(sceneStatus));
  return { viewer, sceneStatus };
}
