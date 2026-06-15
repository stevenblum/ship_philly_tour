import * as Cesium from "cesium";
import { normalizeBasePath } from "./basePath.js";
import { logger } from "./logger.js";

const DEFAULT_PATH_SOURCE = "data/wip-tour-path.json";
const DEFAULT_DURATION_SEC = 60;
const DEFAULT_ALTITUDE_OFFSET_M = 15;
const DEFAULT_LOOK_AHEAD_SEC = 1.5;
const DEFAULT_ROLL_RAD = 0;
const CAMERA_DIRECTION_EPSILON = 0.001;

// readRuntimeBasePath mirrors other static-asset loaders so WIP path JSON works
// at localhost root and at the GitHub Pages project-site base path.
function readRuntimeBasePath() {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env.BASE_URL ?? import.meta.env.VITE_APP_BASE_PATH ?? "/";
  }

  if (typeof process !== "undefined" && process.env) {
    return process.env.VITE_APP_BASE_PATH ?? "/";
  }

  return "/";
}

// buildWipFlightPathUrl resolves the public JSON path without allowing an
// absolute URL, keeping the flight asset bundled with this static app.
export function buildWipFlightPathUrl(
  source = DEFAULT_PATH_SOURCE,
  basePath = readRuntimeBasePath(),
) {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedSource = source.startsWith("/")
    ? source.slice(1)
    : source;

  return `${normalizedBasePath}${normalizedSource}`;
}

// resolvePathFlightConfig merges stop-level settings with generated path
// metadata so the slide can tune duration/look-ahead without rewriting JSON.
function resolvePathFlightConfig(stopConfig = {}, pathData = {}) {
  return {
    source: stopConfig.source ?? DEFAULT_PATH_SOURCE,
    durationSec:
      stopConfig.durationSec ?? pathData.durationSec ?? DEFAULT_DURATION_SEC,
    altitudeOffsetM:
      stopConfig.altitudeOffsetM ??
      (Number.isFinite(stopConfig.altitudeOffsetFt)
        ? stopConfig.altitudeOffsetFt * 0.3048
        : undefined) ??
      pathData.altitudeOffsetM ??
      DEFAULT_ALTITUDE_OFFSET_M,
    lookAheadSec: stopConfig.lookAheadSec ?? DEFAULT_LOOK_AHEAD_SEC,
    pitchDeg: stopConfig.pitchDeg ?? pathData.pitchDeg,
  };
}

// resolveCoordinateElapsedSeconds allocates time by cumulative path distance so
// the camera moves steadily even when KML coordinate spacing is uneven.
function resolveCoordinateElapsedSeconds(
  coordinate,
  routeLengthM,
  durationSec,
) {
  if (!Number.isFinite(routeLengthM) || routeLengthM <= 0) return 0;

  return (coordinate.cumulativeDistanceM / routeLengthM) * durationSec;
}

// buildPathSampleSchedule converts generated route coordinates into elapsed
// seconds. This stays independent of Cesium time objects for straightforward
// unit testing.
export function buildPathSampleSchedule(pathData, durationSec) {
  const routeLengthM =
    pathData.routeLengthM ?? pathData.coordinates.at(-1)?.cumulativeDistanceM;

  return pathData.coordinates.map((coordinate) => ({
    ...coordinate,
    elapsedSec: resolveCoordinateElapsedSeconds(
      coordinate,
      routeLengthM,
      durationSec,
    ),
  }));
}

// sampleRenderedSurfaceHeight asks Cesium for the currently available surface
// at one WIP route coordinate. 3D Tiles sampling only knows loaded/rendered
// content, so the controller falls back cleanly when a future point is not ready.
function sampleRenderedSurfaceHeight(scene, coordinate) {
  if (!scene) return undefined;

  const cartographic = Cesium.Cartographic.fromDegrees(
    coordinate.lonDeg,
    coordinate.latDeg,
    coordinate.heightM ?? 0,
  );

  if (
    scene.sampleHeightSupported !== false &&
    typeof scene.sampleHeight === "function"
  ) {
    try {
      const sampledHeight = scene.sampleHeight(cartographic);

      if (Number.isFinite(sampledHeight)) return sampledHeight;
    } catch (error) {
      logger.debug("WIP flight sampleHeight failed.", error);
    }
  }

  if (
    scene.clampToHeightSupported !== false &&
    typeof scene.clampToHeight === "function"
  ) {
    try {
      const clampedPosition = scene.clampToHeight(
        Cesium.Cartesian3.fromDegrees(
          coordinate.lonDeg,
          coordinate.latDeg,
          coordinate.heightM ?? 0,
        ),
      );

      if (clampedPosition) {
        return Cesium.Cartographic.fromCartesian(clampedPosition).height;
      }
    } catch (error) {
      logger.debug("WIP flight clampToHeight failed.", error);
    }
  }

  if (typeof scene.globe?.getHeight === "function") {
    try {
      const globeHeight = scene.globe.getHeight(cartographic);

      if (Number.isFinite(globeHeight)) return globeHeight;
    } catch (error) {
      logger.debug("WIP flight globe height lookup failed.", error);
    }
  }

  return undefined;
}

// resolveFlightHeightM keeps the camera at the configured offset above the
// current surface when Cesium can provide it, and otherwise falls back to the
// KML height plus that offset.
export function resolveFlightHeightM(scene, coordinate, altitudeOffsetM) {
  const surfaceHeight =
    sampleRenderedSurfaceHeight(scene, coordinate) ?? coordinate.heightM ?? 0;

  return surfaceHeight + altitudeOffsetM;
}

// applyHermiteInterpolation gives the sampled camera path smooth interpolation
// while keeping the KML control points as the authoritative route.
function applyHermiteInterpolation(positionProperty) {
  positionProperty.setInterpolationOptions({
    interpolationDegree: 2,
    interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
  });
}

// createFlightPositionProperty creates the invisible moving entity's position
// property and records the exact sampled positions for tests/debugging.
export function createFlightPositionProperty(viewer, pathData, options = {}) {
  const config = resolvePathFlightConfig(options, pathData);
  const startTime = options.startTime ?? Cesium.JulianDate.now();
  const positionProperty = new Cesium.SampledPositionProperty();
  const schedule = buildPathSampleSchedule(pathData, config.durationSec);
  const samples = schedule.map((sample) => {
    const time = Cesium.JulianDate.addSeconds(
      startTime,
      sample.elapsedSec,
      new Cesium.JulianDate(),
    );
    const heightM = resolveFlightHeightM(
      viewer.scene,
      sample,
      config.altitudeOffsetM,
    );
    const position = Cesium.Cartesian3.fromDegrees(
      sample.lonDeg,
      sample.latDeg,
      heightM,
    );

    positionProperty.addSample(time, position);

    return { ...sample, time, heightM, position };
  });

  applyHermiteInterpolation(positionProperty);

  return {
    positionProperty,
    samples,
    startTime,
    stopTime: Cesium.JulianDate.addSeconds(
      startTime,
      config.durationSec,
      new Cesium.JulianDate(),
    ),
    config,
  };
}

// buildForwardCameraOrientation converts the path tangent into Cesium heading,
// pitch, and roll. Heading is measured clockwise from local north in the
// east-north-up frame; an explicit pitchDeg lets the WIP flight look forward
// along the route while maintaining a presenter-authored downward angle.
export function buildForwardCameraOrientation(
  currentPosition,
  aheadPosition,
  options = {},
) {
  const direction = Cesium.Cartesian3.subtract(
    aheadPosition,
    currentPosition,
    new Cesium.Cartesian3(),
  );

  if (Cesium.Cartesian3.magnitude(direction) < CAMERA_DIRECTION_EPSILON) {
    return undefined;
  }

  Cesium.Cartesian3.normalize(direction, direction);
  const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(
    currentPosition,
  );
  const inverseEnu = Cesium.Matrix4.inverseTransformation(
    enuTransform,
    new Cesium.Matrix4(),
  );
  const localDirection = Cesium.Matrix4.multiplyByPointAsVector(
    inverseEnu,
    direction,
    new Cesium.Cartesian3(),
  );

  const tangentPitch = Math.asin(
    Math.max(-1, Math.min(1, localDirection.z)),
  );
  const pitch = Number.isFinite(options.pitchDeg)
    ? Cesium.Math.toRadians(options.pitchDeg)
    : tangentPitch;

  return {
    heading: Math.atan2(localDirection.x, localDirection.y),
    pitch,
    roll: DEFAULT_ROLL_RAD,
  };
}

// WipFlightController owns the path-flight lifecycle so TourManager can treat
// the WIP slide as one special camera mode without knowing the sampling details.
export class WipFlightController {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.fetchJson =
      options.fetchJson ??
      (async (url) => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
          );
        }

        return response.json();
      });
    this.basePath = options.basePath;
    this.clockSnapshot = undefined;
    this.entity = undefined;
    this.flight = undefined;
    this.runId = 0;
    this.boundUpdateCamera = (clock) => this.updateCamera(clock.currentTime);
  }

  // loadPathData fetches the generated route JSON through the app base path.
  async loadPathData(pathFlightConfig = {}) {
    const url = buildWipFlightPathUrl(
      pathFlightConfig.source,
      this.basePath,
    );

    return this.fetchJson(url);
  }

  // start begins the one-minute flight and installs a clock tick camera update.
  async start(pathFlightConfig = {}) {
    this.stop();
    const runId = ++this.runId;

    const pathData = await this.loadPathData(pathFlightConfig);
    if (runId !== this.runId) return;

    this.flight = createFlightPositionProperty(this.viewer, pathData, {
      ...pathFlightConfig,
      startTime: Cesium.JulianDate.now(),
    });
    this.entity = this.viewer.entities.add({
      id: "wip-flight-camera-rig",
      availability: new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({
          start: this.flight.startTime,
          stop: this.flight.stopTime,
        }),
      ]),
      position: this.flight.positionProperty,
      show: false,
    });
    this.clockSnapshot = this.snapshotClock();
    this.configureClock();
    this.viewer.clock.onTick.addEventListener(this.boundUpdateCamera);
    this.updateCamera(this.flight.startTime);
    logger.info("WIP flight started.", {
      coordinateCount: pathData.coordinateCount,
      durationSec: this.flight.config.durationSec,
    });
  }

  // snapshotClock preserves app clock state so leaving the WIP slide does not
  // leave the rest of the presentation clamped to the route interval.
  snapshotClock() {
    return {
      startTime: Cesium.JulianDate.clone(this.viewer.clock.startTime),
      stopTime: Cesium.JulianDate.clone(this.viewer.clock.stopTime),
      currentTime: Cesium.JulianDate.clone(this.viewer.clock.currentTime),
      multiplier: this.viewer.clock.multiplier,
      clockRange: this.viewer.clock.clockRange,
      shouldAnimate: this.viewer.clock.shouldAnimate,
    };
  }

  // configureClock drives the flight at one real second per route second.
  configureClock() {
    this.viewer.clock.startTime = Cesium.JulianDate.clone(
      this.flight.startTime,
    );
    this.viewer.clock.stopTime = Cesium.JulianDate.clone(this.flight.stopTime);
    this.viewer.clock.currentTime = Cesium.JulianDate.clone(
      this.flight.startTime,
    );
    this.viewer.clock.multiplier = 1;
    this.viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
    this.viewer.clock.shouldAnimate = true;
  }

  // restoreClock returns the Cesium clock to its pre-flight state.
  restoreClock() {
    if (!this.clockSnapshot) return;

    this.viewer.clock.startTime = this.clockSnapshot.startTime;
    this.viewer.clock.stopTime = this.clockSnapshot.stopTime;
    this.viewer.clock.currentTime = this.clockSnapshot.currentTime;
    this.viewer.clock.multiplier = this.clockSnapshot.multiplier;
    this.viewer.clock.clockRange = this.clockSnapshot.clockRange;
    this.viewer.clock.shouldAnimate = this.clockSnapshot.shouldAnimate;
    this.clockSnapshot = undefined;
  }

  // updateCamera follows the invisible sampled entity and looks ahead on the
  // same path so the viewer faces the direction of travel.
  updateCamera(currentTime) {
    if (!this.flight) return;

    const clampedTime = Cesium.JulianDate.lessThan(
      currentTime,
      this.flight.stopTime,
    )
      ? currentTime
      : this.flight.stopTime;
    const currentPosition =
      this.flight.positionProperty.getValue(clampedTime);
    const lookAheadTime = Cesium.JulianDate.addSeconds(
      clampedTime,
      this.flight.config.lookAheadSec,
      new Cesium.JulianDate(),
    );
    const clampedLookAheadTime = Cesium.JulianDate.lessThan(
      lookAheadTime,
      this.flight.stopTime,
    )
      ? lookAheadTime
      : this.flight.stopTime;
    const aheadPosition =
      this.flight.positionProperty.getValue(clampedLookAheadTime) ??
      this.flight.samples.at(-1)?.position;

    if (!currentPosition || !aheadPosition) return;

    const orientation = buildForwardCameraOrientation(
      currentPosition,
      aheadPosition,
      { pitchDeg: this.flight.config.pitchDeg },
    );

    if (orientation) {
      this.viewer.camera.setView({
        destination: currentPosition,
        orientation,
      });
    }

    if (!Cesium.JulianDate.lessThan(currentTime, this.flight.stopTime)) {
      this.viewer.clock.shouldAnimate = false;
    }
  }

  // stop tears down all flight-only state without drawing or preserving the
  // path entity after the presenter leaves the slide.
  stop() {
    this.runId += 1;

    if (this.viewer.clock?.onTick?.removeEventListener) {
      this.viewer.clock.onTick.removeEventListener(this.boundUpdateCamera);
    }

    if (this.entity) {
      this.viewer.entities.remove(this.entity);
      this.entity = undefined;
    }

    this.flight = undefined;
    this.restoreClock();
  }
}
