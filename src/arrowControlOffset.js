// WGS84_MEAN_RADIUS_M supports small-area shipyard distance estimates without
// pulling Cesium into pure data tests or tour-stop authoring helpers.
const WGS84_MEAN_RADIUS_M = 6371008.8;

// DEGREES_TO_RADIANS and RADIANS_TO_DEGREES keep the local tangent-plane math
// readable when converting between lon/lat coordinates and meter offsets.
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

// DEFAULT_RELATIVE_CURVE_RATIO makes each arrow bow proportional to shop
// spacing. A 0.16 ratio gives visible separation without tall or exaggerated
// curves at the compact scale of the shipyard.
export const DEFAULT_RELATIVE_CURVE_RATIO = 0.16;

// DEFAULT_ARROW_CONTROL_HEIGHT_M defines the vertical lift above the average
// endpoint height for route midpoint controls. Keeping this separate from the
// lateral curve ratio lets presentation tuning raise the arcs without changing
// route decluttering offsets.
export const DEFAULT_ARROW_CONTROL_HEIGHT_M = 8;

// coordinateParts accepts both callout objects and [lon, lat, height] tuples so
// the same offset math can run against authored data and runtime point records.
function coordinateParts(coordinate) {
  if (Array.isArray(coordinate)) {
    return {
      lon: coordinate[0],
      lat: coordinate[1],
    };
  }

  return {
    lon: coordinate.lon,
    lat: coordinate.lat,
  };
}

// localTangentVectorMeters approximates the start-to-end route vector in local
// east/north meters. The shipyard footprint is small enough that this is more
// durable and easier to author than hard-coded degree offsets.
function localTangentVectorMeters(startCoordinate, endCoordinate) {
  const start = coordinateParts(startCoordinate);
  const end = coordinateParts(endCoordinate);
  const averageLatRadians = ((start.lat + end.lat) / 2) * DEGREES_TO_RADIANS;

  return {
    eastM:
      (end.lon - start.lon) *
      DEGREES_TO_RADIANS *
      WGS84_MEAN_RADIUS_M *
      Math.cos(averageLatRadians),
    northM: (end.lat - start.lat) * DEGREES_TO_RADIANS * WGS84_MEAN_RADIUS_M,
    averageLatRadians,
  };
}

// approximateSurfaceDistanceMeters returns the local surface distance between
// two shop points for proportional route-control calculations and tests.
export function approximateSurfaceDistanceMeters(
  startCoordinate,
  endCoordinate,
) {
  const vector = localTangentVectorMeters(startCoordinate, endCoordinate);

  return Math.hypot(vector.eastM, vector.northM);
}

// metersToDegreeOffset converts an east/north meter offset back into lon/lat
// degree offsets that CalloutManager can add to the arrow midpoint.
function metersToDegreeOffset(eastM, northM, averageLatRadians) {
  return {
    lonDeg:
      (eastM / (WGS84_MEAN_RADIUS_M * Math.cos(averageLatRadians))) *
      RADIANS_TO_DEGREES,
    latDeg: (northM / WGS84_MEAN_RADIUS_M) * RADIANS_TO_DEGREES,
  };
}

// buildRelativeControlOffset calculates a perpendicular midpoint offset whose
// magnitude is proportional to route length. `side` is relative to travel from
// arrow tail/start to arrow head/end: "left" bows left of travel, "right" bows
// right of travel.
export function buildRelativeControlOffset(
  startCoordinate,
  endCoordinate,
  options = {},
) {
  const side = options.side ?? "left";

  if (!["left", "right"].includes(side)) {
    throw new Error(
      `Arrow control side must be "left" or "right"; received "${side}".`,
    );
  }

  const vector = localTangentVectorMeters(startCoordinate, endCoordinate);
  const distanceM = Math.hypot(vector.eastM, vector.northM);

  if (distanceM === 0) {
    return {
      lonDeg: 0,
      latDeg: 0,
      heightM: options.heightM ?? DEFAULT_ARROW_CONTROL_HEIGHT_M,
      distanceM,
      offsetM: 0,
      side,
    };
  }

  const ratio = options.ratio ?? DEFAULT_RELATIVE_CURVE_RATIO;
  const offsetM = distanceM * ratio;
  const sideSign = side === "left" ? 1 : -1;
  const unitPerpendicularEast = (-vector.northM / distanceM) * sideSign;
  const unitPerpendicularNorth = (vector.eastM / distanceM) * sideSign;
  const degreeOffset = metersToDegreeOffset(
    unitPerpendicularEast * offsetM,
    unitPerpendicularNorth * offsetM,
    vector.averageLatRadians,
  );

  return {
    ...degreeOffset,
    heightM: options.heightM ?? DEFAULT_ARROW_CONTROL_HEIGHT_M,
    distanceM,
    offsetM,
    side,
  };
}

// resolveArrowControlOffset preserves explicit manual offsets for rare custom
// arrows while letting production-flow arrows use proportional relative curves.
export function resolveArrowControlOffset(
  startCoordinate,
  endCoordinate,
  arrow,
) {
  if (arrow.controlCurve) {
    return buildRelativeControlOffset(
      startCoordinate,
      endCoordinate,
      arrow.controlCurve,
    );
  }

  return (
    arrow.controlOffset ?? {
      lonDeg: 0,
      latDeg: 0,
      heightM: DEFAULT_ARROW_CONTROL_HEIGHT_M,
    }
  );
}
