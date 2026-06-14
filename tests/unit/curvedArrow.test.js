import * as Cesium from "cesium";
import { describe, expect, test } from "vitest";
import { buildCurvedArrowPolylineConfig, sampleCurvedArrowPositions } from "../../src/calloutManager.js";

const arrow = {
  id: "test-arrow",
  color: "#53d8ff",
  width: 7,
  sampleCount: 16,
  coordinates: [
    [-75.1858, 39.8898, 130],
    [-75.1861, 39.8895, 180],
    [-75.1864, 39.8892, 65],
  ],
};

// Curved arrow tests focus on our data-to-entity conversion and avoid testing
// Cesium's renderer or WebGL behavior.
describe("curved arrow generation", () => {
  test("samples a Catmull-Rom path with expected endpoints", () => {
    const positions = sampleCurvedArrowPositions(arrow);
    const start = Cesium.Cartesian3.fromDegrees(...arrow.coordinates[0]);
    const target = Cesium.Cartesian3.fromDegrees(...arrow.coordinates.at(-1));

    expect(positions).toHaveLength(arrow.sampleCount);
    expect(Cesium.Cartesian3.equalsEpsilon(positions[0], start, Cesium.Math.EPSILON7)).toBe(true);
    expect(Cesium.Cartesian3.equalsEpsilon(positions.at(-1), target, Cesium.Math.EPSILON7)).toBe(true);
  });

  test("uses Cesium arrow material instead of plain polyline material", () => {
    const config = buildCurvedArrowPolylineConfig(arrow);

    expect(config.material).toBeInstanceOf(Cesium.PolylineArrowMaterialProperty);
    expect(config.arcType).toBe(Cesium.ArcType.NONE);
  });
});
