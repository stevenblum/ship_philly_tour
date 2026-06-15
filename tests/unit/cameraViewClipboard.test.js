// @vitest-environment jsdom
import { waitFor } from "@testing-library/dom";
import * as Cesium from "cesium";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildCameraViewPayload,
  buildTargetCenteredApprox,
  initializeCameraViewCopyButton,
  serializeCameraViewPayload,
} from "../../src/cameraViewClipboard.js";

const CAMERA_POSITION = Cesium.Cartesian3.fromDegrees(-75.19, 39.89, 512.4);
const TARGET_POSITION = Cesium.Cartesian3.fromDegrees(-75.1884, 39.8904, 24.8);

// createViewerStub provides the Cesium camera properties needed by the
// clipboard serializer without constructing a WebGL Viewer in unit tests.
function createViewerStub(options = {}) {
  return {
    camera: {
      positionWC: CAMERA_POSITION,
      positionCartographic: Cesium.Cartographic.fromCartesian(CAMERA_POSITION),
      heading: Cesium.Math.toRadians(85),
      pitch: Cesium.Math.toRadians(-41.2),
      roll: Cesium.Math.toRadians(0.5),
      directionWC: new Cesium.Cartesian3(0.1, 0.2, 0.3),
      upWC: new Cesium.Cartesian3(0.4, 0.5, 0.6),
      rightWC: new Cesium.Cartesian3(0.7, 0.8, 0.9),
      getPickRay: vi.fn(() => ({ origin: CAMERA_POSITION })),
    },
    scene: {
      canvas: { clientWidth: 1200, clientHeight: 800 },
      pickPosition: vi.fn(() => options.pickPosition),
      globe: {
        pick: vi.fn(() => options.globePick),
      },
    },
  };
}

// createButtonDom mirrors production markup for the camera-copy control.
function createButtonDom() {
  document.body.innerHTML = `
    <button
      id="cameraViewCopyButton"
      type="button"
      aria-label="Copy current camera view"
    >
      Copy Camera
    </button>
  `;
}

describe("camera view clipboard payload", () => {
  test("captures an absolutePose-compatible camera snippet", () => {
    const viewer = createViewerStub();
    const payload = buildCameraViewPayload(viewer, {
      currentStop: {
        index: 4,
        stopNumber: 5,
        id: "section-assembly-shop",
        title: "Section Assembly Shop",
        view: { durationSec: 4 },
      },
      targetPosition: null,
    });

    expect(payload.type).toBe("ship_philly_tour_camera_view");
    expect(payload.cameraModeRecommendation).toBe("absolutePose");
    expect(payload.currentStop).toMatchObject({
      index: 4,
      stopNumber: 5,
      id: "section-assembly-shop",
    });
    expect(payload.camera.destination.lonDeg).toBeCloseTo(-75.19);
    expect(payload.camera.destination.latDeg).toBeCloseTo(39.89);
    expect(payload.camera.destination.heightM).toBeCloseTo(512.4);
    expect(payload.camera.orientation.headingDeg).toBe(85);
    expect(payload.camera.orientation.pitchDeg).toBe(-41.2);
    expect(payload.camera.orientation.rollDeg).toBe(0.5);
    expect(payload.camera.durationSec).toBe(4);
    expect(payload.absolutePoseSnippet).toEqual({
      cameraMode: "absolutePose",
      camera: payload.camera,
    });
    expect(payload.cameraRadians.heading).toBeCloseTo(
      Cesium.Math.toRadians(85),
    );
    expect(payload.targetCenteredApprox).toBeNull();
  });

  test("creates a target-centered approximation when center picking succeeds", () => {
    const viewer = createViewerStub();
    const approx = buildTargetCenteredApprox(viewer, TARGET_POSITION, {
      durationSec: 3,
      radiusM: 120,
    });

    expect(approx.target.lonDeg).toBeCloseTo(-75.1884);
    expect(approx.target.latDeg).toBeCloseTo(39.8904);
    expect(approx.target.heightM).toBeCloseTo(24.8);
    expect(approx.target.radiusM).toBe(120);
    expect(approx.view.headingDeg).toBe(85);
    expect(approx.view.pitchDeg).toBe(-41.2);
    expect(approx.view.rangeM).toBeGreaterThan(0);
  });

  test("falls back to null target-centered approximation when picking fails", () => {
    const viewer = createViewerStub();
    const payload = buildCameraViewPayload(viewer, {
      targetPosition: null,
    });

    expect(payload.targetCenteredApprox).toBeNull();
  });

  test("serializes clipboard text as valid formatted JSON", () => {
    const viewer = createViewerStub();
    const payload = buildCameraViewPayload(viewer, {
      targetPosition: TARGET_POSITION,
    });
    const text = serializeCameraViewPayload(payload);

    expect(text).toContain("\n");
    expect(JSON.parse(text)).toMatchObject({
      type: "ship_philly_tour_camera_view",
      camera: {
        destination: expect.any(Object),
        orientation: expect.any(Object),
      },
    });
  });
});

describe("initializeCameraViewCopyButton", () => {
  beforeEach(() => {
    createButtonDom();
  });

  test("copies JSON to the clipboard without rendering it in the DOM", async () => {
    const viewer = createViewerStub();
    const writeText = vi.fn().mockResolvedValue(undefined);

    initializeCameraViewCopyButton(viewer, {
      writeText,
      resetDelayMs: 100_000,
      getCurrentStopSnapshot: () => ({
        index: 0,
        stopNumber: 1,
        id: "overview",
        title: "Shipyard Overview",
      }),
    });

    document.getElementById("cameraViewCopyButton").click();

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedPayload = JSON.parse(writeText.mock.calls[0][0]);
    expect(copiedPayload.currentStop.id).toBe("overview");
    expect(copiedPayload.camera.destination).toBeTruthy();
    expect(copiedPayload.camera.orientation).toBeTruthy();
    expect(document.body.textContent).not.toContain(
      "ship_philly_tour_camera_view",
    );
    expect(document.getElementById("cameraViewCopyButton").textContent).toBe(
      "Copied",
    );
  });

  test("shows a small failure state when clipboard writing fails", async () => {
    const viewer = createViewerStub();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));

    initializeCameraViewCopyButton(viewer, {
      writeText,
      resetDelayMs: 100_000,
    });

    document.getElementById("cameraViewCopyButton").click();

    await waitFor(() =>
      expect(document.getElementById("cameraViewCopyButton").textContent).toBe(
        "Copy failed",
      ),
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain(
      "ship_philly_tour_camera_view",
    );
  });
});
