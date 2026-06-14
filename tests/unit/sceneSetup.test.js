import { describe, expect, test, vi } from "vitest";
import {
  buildGooglePhotorealisticTilesetConfig,
  buildNavigationOptions,
  buildViewerOptions,
  classifyPhotorealisticTilesError,
  setGooglePhotorealisticTilesEnabled,
} from "../../src/sceneSetup.js";

// createViewerStub provides the small subset of Cesium Viewer state touched by
// the runtime photorealistic toggle, avoiding a real WebGL viewer in unit tests.
function createViewerStub() {
  return {
    scene: {
      globe: { show: true },
      primitives: {
        add: vi.fn((primitive) => primitive),
        remove: vi.fn(() => true),
      },
    },
    cesiumWidget: {
      creditContainer: {
        style: { display: "none" },
        removeAttribute: vi.fn(),
      },
    },
  };
}

// buildViewerOptions tests protect the lightweight scene contract without
// constructing a Cesium Viewer or making imagery network requests.
describe("buildViewerOptions", () => {
  test("keeps aerial imagery enabled in lightweight mode", () => {
    const options = buildViewerOptions({ photorealistic: false });

    expect(options.globe).toBeUndefined();
    expect(options.baseLayer).toBeTruthy();
    expect(options.baseLayer).not.toBe(false);
    expect(options.baseLayerPicker).toBe(false);
  });

  test("keeps photorealistic mode globe-less for Google 3D Tiles", () => {
    const options = buildViewerOptions({ photorealistic: true });

    expect(options.globe).toBe(false);
    expect(options.geocoder).toBeTruthy();
  });

  test("enables 3D Tiles collision for surface-clamped callouts in demo mode", () => {
    const config = buildGooglePhotorealisticTilesetConfig();

    expect(config.apiOptions.onlyUsingWithGoogleGeocoder).toBe(true);
    expect(config.tilesetOptions.enableCollision).toBe(true);
  });

  test("uses the standard Cesium navigation plugin controls", () => {
    const options = buildNavigationOptions();

    expect(options).toEqual({
      enableCompass: true,
      enableZoomControls: true,
      enableDistanceLegend: true,
      enableCompassOuterRing: true,
    });
  });
});

// Runtime toggle tests protect the quota-control requirement: Google
// Photorealistic 3D Tiles are created only after explicit user/config action
// and can be removed without replacing the Cesium Viewer.
describe("setGooglePhotorealisticTilesEnabled", () => {
  test("classifies Cesium ion permission failures as access-forbidden", () => {
    const result = classifyPhotorealisticTilesError({ statusCode: 403 });

    expect(result).toEqual({
      reason: "access-forbidden",
      errorStatusCode: 403,
    });
  });

  test("adds Google Photorealistic 3D Tiles and hides the lightweight globe", async () => {
    const viewer = createViewerStub();
    const tileset = {};
    const createTileset = vi.fn().mockResolvedValue(tileset);

    const status = await setGooglePhotorealisticTilesEnabled(viewer, true, {
      token: "test-token",
      createTileset,
    });

    expect(createTileset).toHaveBeenCalledWith(
      { onlyUsingWithGoogleGeocoder: true },
      { enableCollision: true },
    );
    expect(tileset.enableCollision).toBe(true);
    expect(viewer.scene.primitives.add).toHaveBeenCalledWith(tileset);
    expect(viewer.shipyardPhotorealisticTileset).toBe(tileset);
    expect(viewer.scene.globe.show).toBe(false);
    expect(status.photorealisticEnabled).toBe(true);
    expect(status.reason).toBe("user-enabled");
  });

  test("removes Google Photorealistic 3D Tiles and restores the lightweight globe", async () => {
    const viewer = createViewerStub();
    const tileset = { enableCollision: true };
    viewer.shipyardPhotorealisticTileset = tileset;
    viewer.scene.globe.show = false;

    const status = await setGooglePhotorealisticTilesEnabled(viewer, false, {
      token: "test-token",
    });

    expect(viewer.scene.primitives.remove).toHaveBeenCalledWith(tileset);
    expect(viewer.shipyardPhotorealisticTileset).toBeUndefined();
    expect(viewer.scene.globe.show).toBe(true);
    expect(status.photorealisticEnabled).toBe(false);
    expect(status.reason).toBe("user-disabled");
  });

  test("does not create Google Photorealistic 3D Tiles without a token", async () => {
    const viewer = createViewerStub();
    const createTileset = vi.fn();

    const status = await setGooglePhotorealisticTilesEnabled(viewer, true, {
      token: "",
      createTileset,
    });

    expect(createTileset).not.toHaveBeenCalled();
    expect(viewer.scene.primitives.add).not.toHaveBeenCalled();
    expect(viewer.scene.globe.show).toBe(true);
    expect(status.photorealisticEnabled).toBe(false);
    expect(status.reason).toBe("missing-token");
  });

  test("returns access-forbidden when Cesium ion rejects the Google tiles endpoint", async () => {
    const viewer = createViewerStub();
    const createTileset = vi.fn().mockRejectedValue({ statusCode: 403 });

    const status = await setGooglePhotorealisticTilesEnabled(viewer, true, {
      token: "test-token",
      createTileset,
    });

    expect(createTileset).toHaveBeenCalled();
    expect(viewer.scene.primitives.add).not.toHaveBeenCalled();
    expect(viewer.scene.globe.show).toBe(true);
    expect(status.photorealisticEnabled).toBe(false);
    expect(status.reason).toBe("access-forbidden");
    expect(status.errorStatusCode).toBe(403);
  });
});
