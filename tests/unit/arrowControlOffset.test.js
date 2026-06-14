import { describe, expect, test } from "vitest";
import {
  approximateSurfaceDistanceMeters,
  buildRelativeControlOffset,
  DEFAULT_RELATIVE_CURVE_RATIO,
} from "../../src/arrowControlOffset.js";

// These tests protect the authoring contract for proportional curved arrows
// without constructing Cesium entities or sampling Catmull-Rom splines.
describe("relative arrow control offsets", () => {
  test("scales the control offset proportionally to route distance", () => {
    const shortOffset = buildRelativeControlOffset([0, 0, 0], [0.001, 0, 0], { side: "left" });
    const longOffset = buildRelativeControlOffset([0, 0, 0], [0.002, 0, 0], { side: "left" });
    const shortDistance = approximateSurfaceDistanceMeters([0, 0, 0], [0.001, 0, 0]);

    expect(shortDistance).toBeCloseTo(shortOffset.distanceM);
    expect(shortOffset.offsetM).toBeCloseTo(shortOffset.distanceM * DEFAULT_RELATIVE_CURVE_RATIO);
    expect(longOffset.offsetM).toBeCloseTo(longOffset.distanceM * DEFAULT_RELATIVE_CURVE_RATIO);
    expect(longOffset.offsetM).toBeCloseTo(shortOffset.offsetM * 2);
  });

  test("uses left and right relative to arrow travel direction", () => {
    const leftOffset = buildRelativeControlOffset([0, 0, 0], [0.001, 0, 0], { side: "left" });
    const rightOffset = buildRelativeControlOffset([0, 0, 0], [0.001, 0, 0], { side: "right" });

    expect(leftOffset.latDeg).toBeGreaterThan(0);
    expect(rightOffset.latDeg).toBeLessThan(0);
    expect(leftOffset.lonDeg).toBeCloseTo(0);
    expect(rightOffset.lonDeg).toBeCloseTo(0);
  });

  test("rejects unsupported side values so bad route data fails early", () => {
    expect(() => buildRelativeControlOffset([0, 0, 0], [0.001, 0, 0], { side: "north" })).toThrow(
      'Arrow control side must be "left" or "right"',
    );
  });
});
