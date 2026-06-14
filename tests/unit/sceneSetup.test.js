import { describe, expect, test } from "vitest";
import {
  buildGooglePhotorealisticTilesetConfig,
  buildNavigationOptions,
  buildViewerOptions,
} from "../../src/sceneSetup.js";

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
