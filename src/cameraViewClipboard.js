import * as Cesium from "cesium";
import { getAbsolutePoseSnapshot } from "./cameraUtils.js";
import { logger } from "./logger.js";

const DEFAULT_BUTTON_TEXT = "Copy Camera";
const COPIED_BUTTON_TEXT = "Copied";
const FAILED_BUTTON_TEXT = "Copy failed";
const DEFAULT_BUTTON_TITLE = "Copy current camera view to clipboard.";
const COPIED_BUTTON_TITLE = "Current camera view copied to clipboard.";
const FAILED_BUTTON_TITLE = "Camera view copy failed. Check browser permissions.";
const BUTTON_STATE_RESET_MS = 1500;
const DEFAULT_DURATION_SEC = 3;
const DEFAULT_TARGET_RADIUS_M = 80;

// roundNumber keeps copied camera payloads readable while preserving enough
// precision for tour-stop editing at shipyard scale.
function roundNumber(value, decimals) {
  if (!Number.isFinite(value)) return value;

  return Number(value.toFixed(decimals));
}

// cartesianComponentArray serializes Cesium direction/up/right vectors so a
// developer can debug the exact camera basis if heading/pitch/roll need review.
function cartesianComponentArray(cartesian) {
  if (!cartesian) return undefined;

  return [
    roundNumber(cartesian.x, 8),
    roundNumber(cartesian.y, 8),
    roundNumber(cartesian.z, 8),
  ];
}

// readCameraDuration keeps copied snippets aligned with the current stop's
// authored duration when that context is available, otherwise it uses the app's
// normal three-second camera transition.
function readCameraDuration(currentStop) {
  const duration =
    currentStop?.view?.durationSec ?? currentStop?.camera?.durationSec;

  return Number.isFinite(duration) && duration > 0
    ? duration
    : DEFAULT_DURATION_SEC;
}

// readTargetRadius reuses the current stop's framing radius when possible so a
// copied target-centered approximation starts close to the existing slide style.
function readTargetRadius(currentStop) {
  const radius = currentStop?.target?.radiusM;

  return Number.isFinite(radius) && radius > 0
    ? radius
    : DEFAULT_TARGET_RADIUS_M;
}

// pickSceneCenterPosition samples the center of the Cesium canvas. The precise
// pick path works with rendered 3D Tiles; the globe-pick fallback keeps the
// authoring button useful in lightweight imagery mode.
function pickSceneCenterPosition(viewer) {
  const canvas = viewer?.scene?.canvas;
  const width = canvas?.clientWidth ?? canvas?.width;
  const height = canvas?.clientHeight ?? canvas?.height;

  if (!width || !height) return undefined;

  const center = new Cesium.Cartesian2(width / 2, height / 2);

  try {
    const pickedPosition = viewer.scene.pickPosition?.(center);

    if (Cesium.defined(pickedPosition)) {
      return pickedPosition;
    }
  } catch (error) {
    logger.debug("Center-screen camera copy pickPosition failed.", error);
  }

  try {
    const pickRay = viewer.camera.getPickRay?.(center);
    return pickRay
      ? viewer.scene.globe?.pick?.(pickRay, viewer.scene)
      : undefined;
  } catch (error) {
    logger.debug("Center-screen camera copy globe pick failed.", error);
    return undefined;
  }
}

// buildTargetCenteredApprox converts a center-screen picked point into the
// target/view schema used by ordinary tour stops. It is approximate because
// Cesium camera state does not know the user's intended target radius.
export function buildTargetCenteredApprox(viewer, targetPosition, options = {}) {
  if (!Cesium.defined(targetPosition)) return null;

  const target = Cesium.Cartographic.fromCartesian(targetPosition);
  const durationSec = options.durationSec ?? DEFAULT_DURATION_SEC;

  return {
    target: {
      lonDeg: roundNumber(Cesium.Math.toDegrees(target.longitude), 8),
      latDeg: roundNumber(Cesium.Math.toDegrees(target.latitude), 8),
      heightM: roundNumber(target.height, 3),
      radiusM: options.radiusM ?? DEFAULT_TARGET_RADIUS_M,
    },
    view: {
      headingDeg: roundNumber(Cesium.Math.toDegrees(viewer.camera.heading), 6),
      pitchDeg: roundNumber(Cesium.Math.toDegrees(viewer.camera.pitch), 6),
      rangeM: roundNumber(
        Cesium.Cartesian3.distance(viewer.camera.positionWC, targetPosition),
        3,
      ),
      durationSec,
    },
  };
}

// buildCameraViewPayload captures both the exact camera pose and the optional
// target-centered approximation so pasted data can support either authoring mode.
export function buildCameraViewPayload(viewer, options = {}) {
  const currentStop = options.currentStop;
  const durationSec = readCameraDuration(currentStop);
  const camera = getAbsolutePoseSnapshot(viewer, durationSec);
  const targetPosition =
    options.targetPosition === undefined
      ? pickSceneCenterPosition(viewer)
      : options.targetPosition;
  const targetCenteredApprox = buildTargetCenteredApprox(
    viewer,
    targetPosition,
    {
      durationSec,
      radiusM: readTargetRadius(currentStop),
    },
  );

  camera.destination.lonDeg = roundNumber(camera.destination.lonDeg, 8);
  camera.destination.latDeg = roundNumber(camera.destination.latDeg, 8);
  camera.destination.heightM = roundNumber(camera.destination.heightM, 3);
  camera.orientation.headingDeg = roundNumber(
    camera.orientation.headingDeg,
    6,
  );
  camera.orientation.pitchDeg = roundNumber(camera.orientation.pitchDeg, 6);
  camera.orientation.rollDeg = roundNumber(camera.orientation.rollDeg, 6);

  return {
    type: "ship_philly_tour_camera_view",
    cameraModeRecommendation: "absolutePose",
    currentStop: currentStop
      ? {
          index: currentStop.index,
          stopNumber: currentStop.stopNumber,
          id: currentStop.id,
          title: currentStop.title,
        }
      : null,
    camera,
    absolutePoseSnippet: {
      cameraMode: "absolutePose",
      camera,
    },
    cameraRadians: {
      heading: roundNumber(viewer.camera.heading, 8),
      pitch: roundNumber(viewer.camera.pitch, 8),
      roll: roundNumber(viewer.camera.roll, 8),
    },
    cameraVectors: {
      directionWC: cartesianComponentArray(viewer.camera.directionWC),
      upWC: cartesianComponentArray(viewer.camera.upWC),
      rightWC: cartesianComponentArray(viewer.camera.rightWC),
    },
    targetCenteredApprox,
  };
}

// serializeCameraViewPayload produces clipboard text without putting the camera
// data into the DOM, preserving the presenter's clean screen.
export function serializeCameraViewPayload(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// resolveClipboardWriter isolates browser Clipboard API access so tests can
// inject a writer and failure states can be reported consistently.
function resolveClipboardWriter(options = {}) {
  if (options.writeText) return options.writeText;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return (text) => navigator.clipboard.writeText(text);
  }

  return undefined;
}

// setButtonState gives a small status cue without displaying the copied JSON.
function setButtonState(button, state) {
  if (state === "copied") {
    button.textContent = COPIED_BUTTON_TEXT;
    button.title = COPIED_BUTTON_TITLE;
    button.dataset.copyState = "copied";
    return;
  }

  if (state === "failed") {
    button.textContent = FAILED_BUTTON_TEXT;
    button.title = FAILED_BUTTON_TITLE;
    button.dataset.copyState = "failed";
    return;
  }

  button.textContent = DEFAULT_BUTTON_TEXT;
  button.title = DEFAULT_BUTTON_TITLE;
  button.dataset.copyState = "idle";
}

// initializeCameraViewCopyButton wires the presenter-facing copy control. It
// copies camera data only on click and never renders the payload in the page.
export function initializeCameraViewCopyButton(viewer, options = {}) {
  const button =
    options.button ?? document.getElementById("cameraViewCopyButton");

  if (!button) {
    logger.warn("Camera view copy button is missing from the DOM.");
    return;
  }

  const writeText = resolveClipboardWriter(options);
  const resetDelayMs = options.resetDelayMs ?? BUTTON_STATE_RESET_MS;

  setButtonState(button, "idle");

  button.addEventListener("click", async () => {
    try {
      if (!writeText) {
        throw new Error("Clipboard API is unavailable.");
      }

      const payload = buildCameraViewPayload(viewer, {
        currentStop: options.getCurrentStopSnapshot?.(),
      });
      await writeText(serializeCameraViewPayload(payload));
      setButtonState(button, "copied");
    } catch (error) {
      logger.warn("Failed to copy current camera view.", error);
      setButtonState(button, "failed");
    }

    window.setTimeout(() => {
      setButtonState(button, "idle");
    }, resetDelayMs);
  });
}
