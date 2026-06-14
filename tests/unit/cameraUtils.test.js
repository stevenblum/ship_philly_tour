import * as Cesium from "cesium";
import { describe, expect, test, vi } from "vitest";
import {
  flyToAbsolutePose,
  flyToTargetCentered,
  resolveCameraMode,
  targetBoundingSphere,
  targetHeadingPitchRange,
} from "../../src/cameraUtils.js";

const targetCenteredStop = {
  id: "target-stop",
  cameraMode: "targetCentered",
  target: { lonDeg: -75.19, latDeg: 39.89, heightM: 25, radiusM: 80 },
  view: { headingDeg: 85, pitchDeg: -35, rangeM: 450, durationSec: 3 },
};

const absolutePoseStop = {
  id: "absolute-stop",
  cameraMode: "absolutePose",
  camera: {
    destination: { lonDeg: -75.18, latDeg: 39.88, heightM: 800 },
    orientation: { headingDeg: 85, pitchDeg: -42, rollDeg: 0 },
    durationSec: 4,
  },
};

// Camera utility tests verify our data-to-Cesium conversion without constructing
// a real Viewer or relying on WebGL rendering.
describe("camera utilities", () => {
  test("defaults missing cameraMode to targetCentered", () => {
    expect(resolveCameraMode({})).toBe("targetCentered");
  });

  test("builds target-centered Cesium framing primitives", () => {
    const sphere = targetBoundingSphere(targetCenteredStop);
    const offset = targetHeadingPitchRange(targetCenteredStop);

    expect(sphere).toBeInstanceOf(Cesium.BoundingSphere);
    expect(sphere.radius).toBe(80);
    expect(offset).toBeInstanceOf(Cesium.HeadingPitchRange);
    expect(offset.heading).toBeCloseTo(Cesium.Math.toRadians(85));
    expect(offset.pitch).toBeCloseTo(Cesium.Math.toRadians(-35));
    expect(offset.range).toBe(450);
  });

  test("flies to a target-centered stop using flyToBoundingSphere", async () => {
    const viewer = {
      camera: {
        flyToBoundingSphere: vi.fn((sphere, options) => options.complete()),
      },
    };

    await flyToTargetCentered(viewer, targetCenteredStop);

    expect(viewer.camera.flyToBoundingSphere).toHaveBeenCalledWith(
      expect.any(Cesium.BoundingSphere),
      expect.objectContaining({
        offset: expect.any(Cesium.HeadingPitchRange),
        duration: 3,
      }),
    );
  });

  test("flies to an explicit absolute pose using flyTo", async () => {
    const viewer = {
      camera: {
        flyTo: vi.fn((options) => options.complete()),
      },
    };

    await flyToAbsolutePose(viewer, absolutePoseStop);

    expect(viewer.camera.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: expect.any(Cesium.Cartesian3),
        orientation: expect.objectContaining({
          heading: Cesium.Math.toRadians(85),
          pitch: Cesium.Math.toRadians(-42),
          roll: 0,
        }),
        duration: 4,
      }),
    );
  });
});
