import * as Cesium from "cesium";
import { DEFAULT_SHIPYARD_HEADING_DEGREES } from "./tourStops.js";
import { getAbsolutePoseSnapshot, getTargetCenteredViewSnapshot } from "./cameraUtils.js";
import { isAuthoringEnabled, logger } from "./logger.js";

// pickScenePosition tries precise 3D picking first and falls back to globe
// picking because pickPosition depends on rendered depth support.
function pickScenePosition(viewer, windowPosition) {
  const pickedPosition = viewer.scene.pickPosition(windowPosition);

  if (Cesium.defined(pickedPosition)) {
    return pickedPosition;
  }

  const pickRay = viewer.camera.getPickRay(windowPosition);
  return pickRay ? viewer.scene.globe?.pick(pickRay, viewer.scene) : undefined;
}

// createStopTemplate serializes the clicked point as the center target because
// targetCentered is the default authoring mode for this tour. It also includes
// an absolutePose snapshot as a commented-style reference object for rare
// cinematic shots where the exact camera position matters.
function createStopTemplate(viewer, pickedPosition) {
  const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
  const lon = Cesium.Math.toDegrees(cartographic.longitude);
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const height = cartographic.height;
  const target = {
    lonDeg: lon,
    latDeg: lat,
    heightM: height,
    radiusM: 50,
  };
  const view = {
    ...getTargetCenteredViewSnapshot(viewer, pickedPosition),
    headingDeg: DEFAULT_SHIPYARD_HEADING_DEGREES,
  };

  return {
    id: "new-stop",
    title: "New Tour Stop",
    text: "Describe this stop.",
    cameraMode: "targetCentered",
    target,
    view,
    absolutePoseReference: {
      cameraMode: "absolutePose",
      camera: getAbsolutePoseSnapshot(viewer),
    },
    photo: null,
    stats: [],
    callouts: [
      {
        id: "new-callout",
        type: "point-label",
        label: "New callout",
        lon,
        lat,
        // Point-label height stays zero because CalloutManager clamps the
        // marker to terrain or 3D Tiles; target.heightM above keeps the camera
        // center tied to the picked surface.
        height: 0,
      },
    ],
    polygons: [],
    arrows: [],
    polylines: [],
  };
}

// enableCoordinateAuthoring wires development-only click capture to the Cesium
// canvas and logs copy-ready stop templates for rapid tour authoring.
export function enableCoordinateAuthoring(viewer) {
  if (!isAuthoringEnabled()) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((event) => {
    const cartesian = pickScenePosition(viewer, event.position);

    if (!Cesium.defined(cartesian)) {
      logger.warn("No Cesium position found for authoring click.");
      return;
    }

    const template = createStopTemplate(viewer, cartesian);
    logger.authoringDebug("Picked position and generated tour stop template.", template);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}
