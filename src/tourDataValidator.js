// This module validates tour inputs before Cesium renders them so bad authoring
// data fails early with clear messages instead of producing broken camera moves.
function isFiniteNumber(value) {
  return Number.isFinite(value);
}

// isPositiveFiniteNumber captures meter ranges, radii, and durations where zero
// or negative values would make a camera view invalid or invisible.
function isPositiveFiniteNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

// validateCoordinate enforces WGS84-style lon/lat ranges used by Cesium's
// Cartesian3.fromDegrees conversion.
function validateCoordinate({ lon, lat, height }, path, errors) {
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) {
    errors.push(`${path}.lon must be between -180 and 180.`);
  }

  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
    errors.push(`${path}.lat must be between -90 and 90.`);
  }

  if (!isFiniteNumber(height)) {
    errors.push(`${path}.height must be a finite number.`);
  }
}

// validateTargetCoordinate checks the target-centered schema. Target height and
// radius are meter values used to frame the object rather than locate the camera.
function validateTargetCoordinate(target, path, errors, requiredMessage) {
  if (!target) {
    errors.push(requiredMessage);
    return;
  }

  if (!isFiniteNumber(target.lonDeg) || target.lonDeg < -180 || target.lonDeg > 180) {
    errors.push(`${path}.lonDeg must be between -180 and 180.`);
  }

  if (!isFiniteNumber(target.latDeg) || target.latDeg < -90 || target.latDeg > 90) {
    errors.push(`${path}.latDeg must be between -90 and 90.`);
  }

  if (target.heightM !== undefined && !isFiniteNumber(target.heightM)) {
    errors.push(`${path}.heightM must be a finite number when provided.`);
  }

  if (target.radiusM !== undefined && !isPositiveFiniteNumber(target.radiusM)) {
    errors.push(`${path}.radiusM must be positive when provided.`);
  }
}

// validateTargetView checks the HeadingPitchRange authoring values that place
// the camera around the target while keeping the target centered in the viewport.
function validateTargetView(view, path, errors) {
  if (!view) {
    errors.push(`${path}.view is required for targetCentered camera mode.`);
    return;
  }

  if (!isFiniteNumber(view.headingDeg)) {
    errors.push(`${path}.view.headingDeg must be a finite number.`);
  }

  if (!isFiniteNumber(view.pitchDeg)) {
    errors.push(`${path}.view.pitchDeg must be a finite number.`);
  }

  if (!isPositiveFiniteNumber(view.rangeM)) {
    errors.push(`${path}.view.rangeM must be positive.`);
  }

  if (view.durationSec !== undefined && !isPositiveFiniteNumber(view.durationSec)) {
    errors.push(`${path}.view.durationSec must be positive when provided.`);
  }
}

// validateAbsolutePoseCamera checks the explicit camera-position schema used
// only for cinematic exceptions where the camera location is intentionally fixed.
function validateAbsolutePoseCamera(camera, path, errors) {
  if (!camera) {
    errors.push(`${path}.camera is required for absolutePose camera mode.`);
    return;
  }

  if (!camera.destination) {
    errors.push(`${path}.camera.destination is required for absolutePose camera mode.`);
  } else {
    validateTargetCoordinate(
      {
        lonDeg: camera.destination.lonDeg,
        latDeg: camera.destination.latDeg,
        heightM: camera.destination.heightM,
      },
      `${path}.camera.destination`,
      errors,
      `${path}.camera.destination is required for absolutePose camera mode.`,
    );

    if (!isFiniteNumber(camera.destination.heightM)) {
      errors.push(`${path}.camera.destination.heightM must be a finite number.`);
    }
  }

  if (!camera.orientation) {
    errors.push(`${path}.camera.orientation is required for absolutePose camera mode.`);
  } else {
    if (!isFiniteNumber(camera.orientation.headingDeg)) {
      errors.push(`${path}.camera.orientation.headingDeg must be a finite number.`);
    }

    if (!isFiniteNumber(camera.orientation.pitchDeg)) {
      errors.push(`${path}.camera.orientation.pitchDeg must be a finite number.`);
    }

    if (camera.orientation.rollDeg !== undefined && !isFiniteNumber(camera.orientation.rollDeg)) {
      errors.push(`${path}.camera.orientation.rollDeg must be a finite number when provided.`);
    }
  }

  if (camera.durationSec !== undefined && !isPositiveFiniteNumber(camera.durationSec)) {
    errors.push(`${path}.camera.durationSec must be positive when provided.`);
  }
}

// validateStopCamera dispatches validation by mode. Missing cameraMode defaults
// to targetCentered behavior, but absolute camera positioning is never inferred.
function validateStopCamera(stop, path, errors) {
  const cameraMode = stop.cameraMode ?? "targetCentered";

  if (
    !["targetCentered", "absolutePose", "pathFlight", "layoutOverlay"].includes(
      cameraMode,
    )
  ) {
    errors.push(`${path}.cameraMode must be "targetCentered", "absolutePose", "pathFlight", or "layoutOverlay".`);
    return;
  }

  if (cameraMode === "absolutePose") {
    validateAbsolutePoseCamera(stop.camera, path, errors);
    return;
  }

  if (cameraMode === "pathFlight") {
    validatePathFlight(stop.pathFlight, path, errors);
    return;
  }

  if (cameraMode === "layoutOverlay") {
    validateLayoutOverlay(stop.layoutOverlay, path, errors);
    return;
  }

  validateTargetCoordinate(stop.target, `${path}.target`, errors, `${path}.target is required for targetCentered camera mode.`);
  validateTargetView(stop.view, path, errors);
}

// validatePathFlight checks the hidden KML-derived camera route used by the WIP
// presentation slide. It intentionally requires a browser-served JSON source.
function validatePathFlight(pathFlight, path, errors) {
  if (!pathFlight) {
    errors.push(`${path}.pathFlight is required for pathFlight camera mode.`);
    return;
  }

  if (!pathFlight.source || typeof pathFlight.source !== "string") {
    errors.push(`${path}.pathFlight.source is required.`);
  }

  if (!isPositiveFiniteNumber(pathFlight.durationSec)) {
    errors.push(`${path}.pathFlight.durationSec must be positive.`);
  }

  if (
    pathFlight.altitudeOffsetFt !== undefined &&
    !isPositiveFiniteNumber(pathFlight.altitudeOffsetFt)
  ) {
    errors.push(`${path}.pathFlight.altitudeOffsetFt must be positive when provided.`);
  }

  if (
    pathFlight.altitudeOffsetM !== undefined &&
    !isPositiveFiniteNumber(pathFlight.altitudeOffsetM)
  ) {
    errors.push(`${path}.pathFlight.altitudeOffsetM must be positive when provided.`);
  }

  if (
    pathFlight.lookAheadSec !== undefined &&
    !isPositiveFiniteNumber(pathFlight.lookAheadSec)
  ) {
    errors.push(`${path}.pathFlight.lookAheadSec must be positive when provided.`);
  }

  if (pathFlight.pitchDeg !== undefined && !isFiniteNumber(pathFlight.pitchDeg)) {
    errors.push(`${path}.pathFlight.pitchDeg must be a finite number when provided.`);
  }
}

// validateLayoutOverlay checks the registered PNG slide contract. The overlay
// source points at generated public JSON, while fade and camera durations drive
// the presentation transition rather than Cesium target-centered movement.
function validateLayoutOverlay(layoutOverlay, path, errors) {
  if (!layoutOverlay) {
    errors.push(`${path}.layoutOverlay is required for layoutOverlay camera mode.`);
    return;
  }

  if (!layoutOverlay.source || typeof layoutOverlay.source !== "string") {
    errors.push(`${path}.layoutOverlay.source is required.`);
  }

  if (
    layoutOverlay.fadeDurationSec !== undefined &&
    !isPositiveFiniteNumber(layoutOverlay.fadeDurationSec)
  ) {
    errors.push(`${path}.layoutOverlay.fadeDurationSec must be positive when provided.`);
  }

  if (
    layoutOverlay.durationSec !== undefined &&
    !isPositiveFiniteNumber(layoutOverlay.durationSec)
  ) {
    errors.push(`${path}.layoutOverlay.durationSec must be positive when provided.`);
  }
}

// validateArrow ensures curved arrows have enough control points for
// CatmullRomSpline and that each point can be converted to Cesium coordinates.
function validateArrow(arrow, path, errors) {
  if (!arrow.id) {
    errors.push(`${path}.id is required.`);
  }

  if (!Array.isArray(arrow.coordinates) || arrow.coordinates.length < 3) {
    errors.push(`${path}.coordinates must contain at least three control points.`);
    return;
  }

  arrow.coordinates.forEach(([lon, lat, height = 0], index) => {
    validateCoordinate({ lon, lat, height }, `${path}.coordinates[${index}]`, errors);
  });
}

// validateTourStops protects the app's main behavioral contract: every stop has
// stable identity, valid camera-mode data, and valid graphic coordinates.
export function validateTourStops(tourStops) {
  const errors = [];
  const ids = new Set();

  if (!Array.isArray(tourStops) || tourStops.length === 0) {
    return ["tourStops must be a non-empty array."];
  }

  tourStops.forEach((stop, index) => {
    const path = `tourStops[${index}]`;

    if (!stop.id) {
      errors.push(`${path}.id is required.`);
    } else if (ids.has(stop.id)) {
      errors.push(`${path}.id "${stop.id}" is duplicated.`);
    } else {
      ids.add(stop.id);
    }

    if (!stop.title) {
      errors.push(`${path}.title is required.`);
    }

    validateStopCamera(stop, path, errors);

    for (const arrow of stop.arrows ?? []) {
      validateArrow(arrow, `${path}.arrows[]`, errors);
    }

    for (const callout of stop.callouts ?? []) {
      validateCoordinate(callout, `${path}.callouts[${callout.id ?? "unknown"}]`, errors);
    }
  });

  return errors;
}

// validateShipyardLocations checks the KML-derived source data that seeds the
// initial build's shop and yard location layer.
export function validateShipyardLocations(locations) {
  const errors = [];
  const ids = new Set();

  for (const location of locations) {
    if (!location.id) {
      errors.push(`Location ${location.slug ?? "unknown"} is missing source id.`);
    } else if (ids.has(location.id)) {
      errors.push(`Location id ${location.id} is duplicated.`);
    } else {
      ids.add(location.id);
    }

    if (!location.name) {
      errors.push(`Location ${location.id ?? "unknown"} is missing source name.`);
    }

    validateCoordinate(location.point ?? {}, `locations[${location.slug ?? location.id}].point`, errors);

    if (location.lookAt) {
      validateCoordinate(
        { lon: location.lookAt.lon, lat: location.lookAt.lat, height: location.lookAt.altitude },
        `locations[${location.slug}].lookAt`,
        errors,
      );
    }
  }

  return errors;
}
