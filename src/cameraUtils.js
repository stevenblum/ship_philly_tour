import * as Cesium from "cesium";

// resolveCameraMode makes target-centered views the default authoring model.
// Absolute camera destinations are only used when a stop explicitly opts into
// cameraMode: "absolutePose".
export function resolveCameraMode(stop) {
  return stop.cameraMode ?? "targetCentered";
}

// targetCartesian converts the data-authored target into Cesium's Cartesian
// coordinate type so the target, not the camera position, becomes the center of
// the view.
function targetCartesian(target) {
  return Cesium.Cartesian3.fromDegrees(target.lonDeg, target.latDeg, target.heightM ?? 0);
}

// targetBoundingSphere gives Cesium a focus object to frame. The radius keeps
// labels, polygons, and local context visible around the authored target point.
export function targetBoundingSphere(stop) {
  return new Cesium.BoundingSphere(targetCartesian(stop.target), stop.target.radiusM ?? 25);
}

// targetHeadingPitchRange converts human-readable degree and meter values into
// Cesium's target-centered offset. Heading is rotation around the target, pitch
// is the oblique viewing angle, and range is the camera distance from target.
export function targetHeadingPitchRange(stop) {
  return new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(stop.view.headingDeg),
    Cesium.Math.toRadians(stop.view.pitchDeg),
    stop.view.rangeM,
  );
}

// absolutePoseDestination converts an explicit camera destination into Cesium's
// Cartesian coordinate type for cinematic shots where exact camera position
// matters more than keeping a target centered.
function absolutePoseDestination(camera) {
  return Cesium.Cartesian3.fromDegrees(
    camera.destination.lonDeg,
    camera.destination.latDeg,
    camera.destination.heightM,
  );
}

// absolutePoseOrientation converts the explicit orientation for absolutePose
// shots from author-friendly degrees into Cesium radians.
function absolutePoseOrientation(camera) {
  return {
    heading: Cesium.Math.toRadians(camera.orientation.headingDeg),
    pitch: Cesium.Math.toRadians(camera.orientation.pitchDeg),
    roll: Cesium.Math.toRadians(camera.orientation.rollDeg ?? 0),
  };
}

// setViewToTargetCentered handles first-render positioning without an animated
// flight while still using the same target-centered Cesium framing model.
function setViewToTargetCentered(viewer, stop) {
  viewer.camera.viewBoundingSphere(targetBoundingSphere(stop), targetHeadingPitchRange(stop));
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

// flyToTargetCentered animates to a target-centered stop. The returned promise
// gives callers a completion signal without forcing the tour UI to block.
export function flyToTargetCentered(viewer, stop) {
  return new Promise((resolve, reject) => {
    viewer.camera.flyToBoundingSphere(targetBoundingSphere(stop), {
      offset: targetHeadingPitchRange(stop),
      duration: stop.view.durationSec ?? 3,
      complete: resolve,
      cancel: () => reject(new Error("Camera flight cancelled")),
    });
  });
}

// setViewToAbsolutePose handles first-render positioning for explicit camera
// poses where the authored destination is the camera location.
function setViewToAbsolutePose(viewer, stop) {
  viewer.camera.setView({
    destination: absolutePoseDestination(stop.camera),
    orientation: absolutePoseOrientation(stop.camera),
  });
}

// flyToAbsolutePose animates to an explicit camera pose. This mode is reserved
// for cinematic exceptions where the camera location itself is the authored
// requirement.
export function flyToAbsolutePose(viewer, stop) {
  return new Promise((resolve, reject) => {
    viewer.camera.flyTo({
      destination: absolutePoseDestination(stop.camera),
      orientation: absolutePoseOrientation(stop.camera),
      duration: stop.camera.durationSec ?? 3,
      complete: resolve,
      cancel: () => reject(new Error("Camera flight cancelled")),
    });
  });
}

// setViewForStop dispatches the instant first-render path based on cameraMode
// so the TourManager never treats a target as a camera destination by accident.
export function setViewForStop(viewer, stop) {
  if (resolveCameraMode(stop) === "absolutePose") {
    setViewToAbsolutePose(viewer, stop);
    return;
  }

  setViewToTargetCentered(viewer, stop);
}

// flyToStopCamera dispatches animated presentation moves based on cameraMode.
// targetCentered remains the default, while absolutePose must be explicit.
export function flyToStopCamera(viewer, stop) {
  if (resolveCameraMode(stop) === "absolutePose") {
    return flyToAbsolutePose(viewer, stop);
  }

  return flyToTargetCentered(viewer, stop);
}

// getAbsolutePoseSnapshot serializes the current camera into the absolutePose
// shape so developers can capture cinematic exceptions when needed.
export function getAbsolutePoseSnapshot(viewer, durationSec = 3) {
  const position = viewer.camera.positionCartographic;

  return {
    destination: {
      lonDeg: Cesium.Math.toDegrees(position.longitude),
      latDeg: Cesium.Math.toDegrees(position.latitude),
      heightM: position.height,
    },
    orientation: {
      headingDeg: Cesium.Math.toDegrees(viewer.camera.heading),
      pitchDeg: Cesium.Math.toDegrees(viewer.camera.pitch),
      rollDeg: Cesium.Math.toDegrees(viewer.camera.roll),
    },
    durationSec,
  };
}

// getTargetCenteredViewSnapshot derives a target-centered view from the current
// camera and clicked point, which is the authoring workflow used for most stops.
export function getTargetCenteredViewSnapshot(viewer, targetCartesianPosition, durationSec = 3) {
  return {
    headingDeg: Cesium.Math.toDegrees(viewer.camera.heading),
    pitchDeg: Cesium.Math.toDegrees(viewer.camera.pitch),
    rangeM: Cesium.Cartesian3.distance(viewer.camera.positionWC, targetCartesianPosition),
    durationSec,
  };
}
