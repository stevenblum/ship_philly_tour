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
// Tiles. Dynamic image export avoids tile-specific CORS/missing-tile failures
// that can appear when close target-centered views request cached tiles.
function createLightweightBaseLayer() {
  return Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromUrl(LIGHTWEIGHT_IMAGERY_URL, {
      enablePickFeatures: false,
      usePreCachedTilesIfAvailable: false,
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
  viewer.cesiumNavigation = new CesiumNavigation(viewer, buildNavigationOptions());
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

// createLightweightViewer provides the default low-usage scene. It avoids
// Google Photorealistic 3D Tiles while preserving camera, entity, callout,
// overlay, and authoring behavior for normal coding and rehearsals.
function createLightweightViewer(containerId) {
  logger.info("Using lightweight Cesium scene.");
  return createViewer(containerId, buildViewerOptions({ photorealistic: false }));
}

// addGooglePhotorealisticTiles is called only after resolveSceneMode has
// explicitly selected demo/photorealistic mode, which prevents accidental quota
// usage during development and automated tests.
async function addGooglePhotorealisticTiles(viewer) {
  try {
    const { apiOptions, tilesetOptions } = buildGooglePhotorealisticTilesetConfig();
    const tileset = await Cesium.createGooglePhotorealistic3DTileset(apiOptions, tilesetOptions);
    // enableCollision is required for CLAMP_TO_GROUND entities to resolve
    // against Photorealistic 3D Tiles rather than only the ellipsoid/terrain.
    tileset.enableCollision = true;
    viewer.scene.primitives.add(tileset);
    ensureCreditsVisible(viewer);
    logger.info("Google Photorealistic 3D Tiles loaded.");
    return true;
  } catch (error) {
    logger.warn(
      "Failed to load Google Photorealistic 3D Tiles. Falling back to the lightweight Cesium scene.",
      error,
    );
    return false;
  }
}

// setupScene creates a lightweight scene by default and only loads Google
// Photorealistic 3D Tiles when URL or environment configuration explicitly asks
// for high-detail demo mode.
export async function setupScene(containerId) {
  const modeConfig = resolveSceneMode();
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN;

  if (token) {
    Cesium.Ion.defaultAccessToken = token;
  }

  logger.info(formatSceneModeStatus(modeConfig), { source: modeConfig.source });

  if (!modeConfig.usePhotorealistic) {
    const viewer = createLightweightViewer(containerId);
    const sceneStatus = buildSceneStatus(modeConfig, { reason: "low-usage-default" });
    logger.info(formatSceneModeStatus(sceneStatus));
    return { viewer, sceneStatus };
  }

  if (!token) {
    logger.warn("VITE_CESIUM_ION_TOKEN is missing; photorealistic tiles are unavailable.");
    const viewer = createLightweightViewer(containerId);
    const sceneStatus = buildSceneStatus(modeConfig, {
      sceneMode: "lightweight",
      reason: "missing-token",
    });
    logger.warn(formatSceneModeStatus(sceneStatus));
    return { viewer, sceneStatus };
  }

  let viewer = createViewer(containerId, buildViewerOptions({ photorealistic: true }));
  const loaded = await addGooglePhotorealisticTiles(viewer);

  if (!loaded) {
    viewer.destroy();
    document.getElementById(containerId).innerHTML = "";
    viewer = createLightweightViewer(containerId);
    const sceneStatus = buildSceneStatus(modeConfig, {
      sceneMode: "lightweight",
      reason: "tile-load-failed",
    });
    logger.warn(formatSceneModeStatus(sceneStatus));
    return { viewer, sceneStatus };
  }

  const sceneStatus = buildSceneStatus(modeConfig, { photorealisticEnabled: true });
  logger.info(formatSceneModeStatus(sceneStatus));
  return { viewer, sceneStatus };
}
