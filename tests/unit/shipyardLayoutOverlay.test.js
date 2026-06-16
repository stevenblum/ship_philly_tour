// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Cesium from "cesium";
import { describe, expect, test, vi } from "vitest";
import {
  buildLayoutGeometryData,
  buildPublicAssetUrl,
  buildShipyardLayoutRegistrationUrl,
  ShipyardLayoutOverlay,
} from "../../src/shipyardLayoutOverlay.js";

const REGISTRATION = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "public/data/shipyard-layout-registration.json"),
    "utf8",
  ),
);

// Cesium's material uniform detection checks browser image classes. jsdom has
// canvas/image elements but not ImageBitmap, so the test provides the missing
// constructor without changing production code.
globalThis.ImageBitmap ??= class ImageBitmap {};
globalThis.OffscreenCanvas ??= class OffscreenCanvas {};

// createViewerStub supplies only the Cesium viewer surface that the layout
// overlay mutates, keeping tests focused on alpha and visibility state.
function createViewerStub(options = {}) {
  const layers =
    options.layers ??
    [
      { alpha: 1 },
      { alpha: 0.5 },
    ];
  const primitives = [];

  return {
    imageryLayers: {
      length: layers.length,
      get: (index) => layers[index],
    },
    scene: {
      primitives: {
        add: vi.fn((primitive) => {
          primitives.push(primitive);
          return primitive;
        }),
      },
      requestRender: vi.fn(),
    },
    camera: {
      setView: vi.fn(),
      flyTo: vi.fn((options) => options.complete?.()),
    },
    shipyardPhotorealisticTileset: options.tileset,
    testState: { layers, primitives },
  };
}

describe("shipyard layout overlay helpers", () => {
  test("builds base-path aware runtime URLs", () => {
    expect(
      buildShipyardLayoutRegistrationUrl(
        "data/shipyard-layout-registration.json",
        "/ship_philly_tour",
      ),
    ).toBe("/ship_philly_tour/data/shipyard-layout-registration.json");
    expect(
      buildPublicAssetUrl(
        "/photos/philly-shipyard-layout.png",
        "/ship_philly_tour/",
      ),
    ).toBe("/ship_philly_tour/photos/philly-shipyard-layout.png");
  });

  test("builds one textured quad from generated corners", () => {
    const geometryData = buildLayoutGeometryData(REGISTRATION);

    expect(geometryData.positionValues).toHaveLength(12);
    expect(geometryData.normalValues).toHaveLength(12);
    expect(Array.from(geometryData.textureValues)).toEqual([
      0, 1, 1, 1, 1, 0, 0, 0,
    ]);
    expect(Array.from(geometryData.indices)).toEqual([0, 1, 2, 0, 2, 3]);
  });
});

describe("ShipyardLayoutOverlay lifecycle", () => {
  test("fades in the PNG above imagery and Google 3D without hiding either", async () => {
    const tileset = { show: true };
    const viewer = createViewerStub({ tileset });
    const overlay = new ShipyardLayoutOverlay(viewer, {
      fetchJson: vi.fn(async () => REGISTRATION),
    });

    await overlay.show({
      source: "data/shipyard-layout-registration.json",
      fadeDurationSec: 0,
    });

    const primitive = viewer.testState.primitives[0];

    expect(viewer.scene.primitives.add).toHaveBeenCalledTimes(1);
    expect(primitive.show).toBe(true);
    expect(
      Cesium.Color.equals(
        primitive.appearance.material.uniforms.color,
        Cesium.Color.WHITE.withAlpha(1),
      ),
    ).toBe(true);
    expect(primitive.appearance.renderState.depthTest.enabled).toBe(false);
    expect(primitive.appearance.renderState.depthMask).toBe(false);
    expect(primitive.appearance.renderState.blending).toBeTruthy();
    expect(viewer.testState.layers.map((layer) => layer.alpha)).toEqual([
      1, 0.5,
    ]);
    expect(tileset.show).toBe(true);
  });

  test("hides only the PNG primitive when leaving slide 0", async () => {
    const tileset = { show: true };
    const viewer = createViewerStub({ tileset });
    const overlay = new ShipyardLayoutOverlay(viewer, {
      fetchJson: vi.fn(async () => REGISTRATION),
    });

    await overlay.show({
      source: "data/shipyard-layout-registration.json",
      fadeDurationSec: 0,
    });
    await overlay.hide({ fadeDurationSec: 0 });

    const primitive = viewer.testState.primitives[0];

    expect(viewer.scene.primitives.add).toHaveBeenCalledTimes(1);
    expect(primitive.show).toBe(false);
    expect(viewer.testState.layers.map((layer) => layer.alpha)).toEqual([
      1, 0.5,
    ]);
    expect(tileset.show).toBe(true);
  });

  test("sets the overhead layout camera from generated registration metadata", async () => {
    const viewer = createViewerStub();
    const overlay = new ShipyardLayoutOverlay(viewer, {
      fetchJson: vi.fn(async () => REGISTRATION),
    });

    await overlay.flyToOverhead({
      source: "data/shipyard-layout-registration.json",
      durationSec: 0,
      instant: true,
    });

    const setViewOptions = viewer.camera.setView.mock.calls[0][0];

    expect(viewer.camera.setView).toHaveBeenCalledTimes(1);
    expect(setViewOptions.destination).toBeInstanceOf(Cesium.Cartesian3);
    expect(setViewOptions.orientation.heading).toBeCloseTo(
      Cesium.Math.toRadians(REGISTRATION.camera.headingDeg),
    );
    expect(setViewOptions.orientation.pitch).toBeCloseTo(
      Cesium.Math.toRadians(-90),
    );
  });
});
