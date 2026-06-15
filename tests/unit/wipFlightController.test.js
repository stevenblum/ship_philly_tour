import { readFileSync } from "node:fs";
import * as Cesium from "cesium";
import { describe, expect, test, vi } from "vitest";
import {
  buildWipTourPathData,
  extractNamedPlacemark,
} from "../../scripts/convertWipTourKml.mjs";
import {
  buildForwardCameraOrientation,
  buildPathSampleSchedule,
  buildWipFlightPathUrl,
  createFlightPositionProperty,
  resolveFlightHeightM,
  WipFlightController,
} from "../../src/wipFlightController.js";

const WIP_KML = readFileSync(
  new URL("../../WIP_Tour.kml", import.meta.url),
  "utf8",
);

// createViewerStub supplies only the Cesium Viewer surface used by the WIP
// flight controller so unit tests do not need a browser or WebGL.
function createViewerStub(options = {}) {
  const entities = [];
  const listeners = new Set();

  return {
    camera: {
      setView: vi.fn(),
    },
    scene: {
      sampleHeightSupported: true,
      sampleHeight: options.sampleHeight,
      canvas: { clientWidth: 1200, clientHeight: 800 },
      globe: options.globe,
    },
    entities: {
      add: vi.fn((entity) => {
        entities.push(entity);
        return entity;
      }),
      remove: vi.fn((entity) => {
        const index = entities.indexOf(entity);

        if (index !== -1) entities.splice(index, 1);
      }),
    },
    clock: {
      startTime: Cesium.JulianDate.fromIso8601("2026-06-14T00:00:00Z"),
      stopTime: Cesium.JulianDate.fromIso8601("2026-06-14T00:01:00Z"),
      currentTime: Cesium.JulianDate.fromIso8601("2026-06-14T00:00:00Z"),
      multiplier: 1,
      clockRange: Cesium.ClockRange.UNBOUNDED,
      shouldAnimate: false,
      onTick: {
        addEventListener: vi.fn((listener) => listeners.add(listener)),
        removeEventListener: vi.fn((listener) => listeners.delete(listener)),
      },
    },
    testState: { entities, listeners },
  };
}

describe("WIP Tour KML conversion", () => {
  test("extracts only the WIP Tour LineString from the KML", () => {
    const data = buildWipTourPathData(WIP_KML);
    const stalePointPlacemark = extractNamedPlacemark(
      WIP_KML,
      "Steel Storage Area",
    );

    expect(data.source).toEqual({
      file: "WIP_Tour.kml",
      placemarkName: "WIP Tour",
    });
    expect(data.coordinateCount).toBe(81);
    expect(data.coordinates).toHaveLength(81);
    expect(data.durationSec).toBe(60);
    expect(data.altitudeOffsetM).toBe(15);
    expect(data.pitchDeg).toBe(-15);
    expect(data.routeLengthM).toBeGreaterThan(2500);
    expect(stalePointPlacemark).toContain("<Point>");
    expect(data.coordinates[0].lonDeg).toBeCloseTo(-75.19262950854174);
    expect(data.coordinates.at(-1).latDeg).toBeCloseTo(39.88629629792978);
  });
});

describe("WIP flight controller helpers", () => {
  test("builds base-path aware route URLs", () => {
    expect(buildWipFlightPathUrl("data/wip-tour-path.json", "/")).toBe(
      "/data/wip-tour-path.json",
    );
    expect(
      buildWipFlightPathUrl("data/wip-tour-path.json", "/ship_philly_tour"),
    ).toBe("/ship_philly_tour/data/wip-tour-path.json");
  });

  test("allocates sample times proportionally to route distance", () => {
    const schedule = buildPathSampleSchedule(
      {
        routeLengthM: 100,
        coordinates: [
          { lonDeg: -75, latDeg: 39, heightM: 0, cumulativeDistanceM: 0 },
          { lonDeg: -75, latDeg: 39.1, heightM: 0, cumulativeDistanceM: 25 },
          { lonDeg: -75, latDeg: 39.2, heightM: 0, cumulativeDistanceM: 100 },
        ],
      },
      60,
    );

    expect(schedule.map((sample) => sample.elapsedSec)).toEqual([0, 15, 60]);
  });

  test("adds the configured offset above sampled or fallback surface height", () => {
    const coordinate = { lonDeg: -75, latDeg: 39, heightM: 2 };

    expect(
      resolveFlightHeightM(
        { sampleHeightSupported: true, sampleHeight: () => 20 },
        coordinate,
        15,
      ),
    ).toBeCloseTo(35);
    expect(resolveFlightHeightM({}, coordinate, 15)).toBeCloseTo(17);
  });

  test("creates a Hermite-interpolated sampled position property", () => {
    const viewer = createViewerStub({
      sampleHeight: () => 10,
    });
    const startTime = Cesium.JulianDate.fromIso8601("2026-06-14T00:00:00Z");
    const flight = createFlightPositionProperty(
      viewer,
      {
        durationSec: 60,
        routeLengthM: 100,
        coordinates: [
          { lonDeg: -75, latDeg: 39, heightM: 0, cumulativeDistanceM: 0 },
          { lonDeg: -75, latDeg: 39.1, heightM: 0, cumulativeDistanceM: 100 },
        ],
      },
      { startTime, altitudeOffsetM: 15 },
    );

    expect(flight.samples).toHaveLength(2);
    expect(flight.samples[0].heightM).toBeCloseTo(25);
    expect(flight.positionProperty._property._interpolationDegree).toBe(2);
    expect(flight.positionProperty._property._interpolationAlgorithm).toBe(
      Cesium.HermitePolynomialApproximation,
    );
  });

  test("builds a forward-looking camera orientation", () => {
    const current = Cesium.Cartesian3.fromDegrees(-75, 39, 20);
    const ahead = Cesium.Cartesian3.fromDegrees(-74.999, 39, 20);
    const orientation = buildForwardCameraOrientation(current, ahead);

    expect(orientation.heading).toBeGreaterThan(0);
    expect(Number.isFinite(orientation.pitch)).toBe(true);
    expect(orientation.roll).toBe(0);
  });

  test("can force a constant downward camera pitch while following route heading", () => {
    const current = Cesium.Cartesian3.fromDegrees(-75, 39, 20);
    const ahead = Cesium.Cartesian3.fromDegrees(-74.999, 39, 20);
    const orientation = buildForwardCameraOrientation(current, ahead, {
      pitchDeg: -15,
    });

    expect(orientation.heading).toBeGreaterThan(0);
    expect(orientation.pitch).toBeCloseTo(Cesium.Math.toRadians(-15));
    expect(orientation.roll).toBe(0);
  });
});

describe("WipFlightController lifecycle", () => {
  test("starts a hidden camera rig and cleans it up on stop", async () => {
    const viewer = createViewerStub({ sampleHeight: () => 0 });
    const controller = new WipFlightController(viewer, {
      fetchJson: vi.fn(async () => ({
        durationSec: 60,
        altitudeOffsetM: 15,
        pitchDeg: -15,
        routeLengthM: 100,
        coordinates: [
          { lonDeg: -75, latDeg: 39, heightM: 0, cumulativeDistanceM: 0 },
          { lonDeg: -74.999, latDeg: 39, heightM: 0, cumulativeDistanceM: 100 },
        ],
      })),
    });

    await controller.start({
      source: "data/wip-tour-path.json",
      durationSec: 60,
      altitudeOffsetM: 15,
      lookAheadSec: 1.5,
      pitchDeg: -15,
    });

    const addedEntity = viewer.entities.add.mock.calls[0][0];
    expect(addedEntity.id).toBe("wip-flight-camera-rig");
    expect(addedEntity.show).toBe(false);
    expect(addedEntity.polyline).toBeUndefined();
    expect(addedEntity.path).toBeUndefined();
    expect(viewer.camera.setView.mock.calls[0][0].orientation.pitch).toBeCloseTo(
      Cesium.Math.toRadians(-15),
    );
    expect(viewer.clock.onTick.addEventListener).toHaveBeenCalledTimes(1);
    expect(viewer.camera.setView).toHaveBeenCalled();

    viewer.clock.onTick.removeEventListener.mockClear();
    viewer.entities.remove.mockClear();
    controller.stop();

    expect(viewer.entities.remove).toHaveBeenCalledTimes(1);
    expect(viewer.clock.onTick.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
