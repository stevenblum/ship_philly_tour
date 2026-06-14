import * as Cesium from "cesium";
import { describe, expect, test, vi } from "vitest";
import {
  buildChevronStyle,
  buildChevronSvgDataUrl,
  computeChevronCountForPathLength,
  buildPathMetrics,
  buildPathTangentPositions,
  FlowChevronLayer,
  interpolatePathPosition,
  resolveFlowChevronEnabled,
  resolveChevronSpacingMeters,
  screenTangentToBillboardRotation,
} from "../../src/flowChevronLayer.js";

// These tests protect the standalone chevron overlay without depending on a
// live WebGL scene. The overlay should follow already-sampled arrow paths and
// remain independently toggleable.
describe("flow chevron layer", () => {
  const positions = [
    Cesium.Cartesian3.fromDegrees(-75.191, 39.89, 0),
    Cesium.Cartesian3.fromDegrees(-75.1905, 39.8902, 4),
    Cesium.Cartesian3.fromDegrees(-75.19, 39.8904, 0),
  ];
  const thirtyYardPath = [
    new Cesium.Cartesian3(0, 0, 0),
    new Cesium.Cartesian3(30 * 0.9144, 0, 0),
  ];

  // createFakeViewer records billboard entities the chevron layer would add to
  // Cesium while exposing a minimal clock API for animation listener coverage.
  function createFakeViewer() {
    const addedEntities = [];
    const viewer = {
      clock: {
        onTick: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
      entities: {
        add: vi.fn((config) => {
          const entity = {
            ...config,
            billboard: config.billboard ? { ...config.billboard } : undefined,
          };
          addedEntities.push(entity);
          return entity;
        }),
        remove: vi.fn(),
      },
    };

    return { addedEntities, viewer };
  }

  test("builds a local SVG chevron billboard asset", () => {
    const dataUrl = buildChevronSvgDataUrl();

    expect(dataUrl.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(dataUrl)).toContain("<svg");
  });

  test("interpolates along the existing sampled arrow path by distance", () => {
    const metrics = buildPathMetrics(positions);
    const start = interpolatePathPosition(metrics, 0);
    const middle = interpolatePathPosition(metrics, 0.5);
    const end = interpolatePathPosition(metrics, 1);

    expect(
      Cesium.Cartesian3.equalsEpsilon(
        start,
        positions[0],
        Cesium.Math.EPSILON7,
      ),
    ).toBe(true);
    expect(Cesium.Cartesian3.equalsEpsilon(middle, positions[1], 25)).toBe(
      true,
    );
    expect(
      Cesium.Cartesian3.equalsEpsilon(
        end,
        positions.at(-1),
        Cesium.Math.EPSILON7,
      ),
    ).toBe(true);
  });

  test("uses stronger styling for active arrows while keeping distance-based spacing", () => {
    const inactiveStyle = buildChevronStyle({ active: false });
    const activeStyle = buildChevronStyle({ active: true });

    expect(activeStyle.spacingMeters).toBeCloseTo(inactiveStyle.spacingMeters);
    expect(activeStyle.scale).toBeGreaterThan(inactiveStyle.scale);
    expect(activeStyle.colorCss).toBe("#35f27a");
    expect(inactiveStyle.colorCss).toBe("#53d8ff");
  });

  test("derives chevron count from real path length using six-yard default spacing", () => {
    const spacingMeters = resolveChevronSpacingMeters();

    expect(spacingMeters).toBeCloseTo(6 * 0.9144);
    expect(computeChevronCountForPathLength(30 * 0.9144, spacingMeters)).toBe(
      5,
    );
    expect(computeChevronCountForPathLength(4 * 0.9144, spacingMeters)).toBe(1);
    expect(computeChevronCountForPathLength(0, spacingMeters)).toBe(0);
  });

  test("converts y-down screen tangents into Cesium billboard rotation", () => {
    expect(
      screenTangentToBillboardRotation({ x: 0, y: 0 }, { x: 10, y: 0 }),
    ).toBeCloseTo(0);
    expect(
      screenTangentToBillboardRotation({ x: 10, y: 0 }, { x: 0, y: 0 }),
    ).toBeCloseTo(Math.PI);
    expect(
      screenTangentToBillboardRotation({ x: 0, y: 10 }, { x: 0, y: 0 }),
    ).toBeCloseTo(Math.PI / 2);
    expect(
      screenTangentToBillboardRotation({ x: 0, y: 0 }, { x: 0, y: 10 }),
    ).toBeCloseTo(-Math.PI / 2);
    expect(
      screenTangentToBillboardRotation({ x: 0, y: 0 }, { x: 0, y: 0 }, 1.25),
    ).toBeCloseTo(1.25);
  });

  test("samples local path tangents at the start, middle, and end of an arrow", () => {
    const metrics = buildPathMetrics(positions);
    const startTangent = buildPathTangentPositions(metrics, 0, 0.1);
    const middleTangent = buildPathTangentPositions(metrics, 0.5, 0.1);
    const endTangent = buildPathTangentPositions(metrics, 1, 0.1);

    expect(
      Cesium.Cartesian3.equalsEpsilon(
        startTangent.from,
        positions[0],
        Cesium.Math.EPSILON7,
      ),
    ).toBe(true);
    expect(
      Cesium.Cartesian3.equalsEpsilon(
        middleTangent.from,
        middleTangent.to,
        Cesium.Math.EPSILON7,
      ),
    ).toBe(false);
    expect(
      Cesium.Cartesian3.equalsEpsilon(
        endTangent.to,
        positions.at(-1),
        Cesium.Math.EPSILON7,
      ),
    ).toBe(true);
  });

  test("creates, updates, and removes standalone chevron billboards", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const layer = new FlowChevronLayer(viewer);

    layer.syncArrow("flow-test-arrow", thirtyYardPath, { active: false });
    expect(
      addedEntities.filter((entity) =>
        entity.id.startsWith("flow-test-arrow-flow-chevron-"),
      ),
    ).toHaveLength(5);
    expect(viewer.clock.onTick.addEventListener).toHaveBeenCalledTimes(1);

    layer.syncArrow("flow-test-arrow", thirtyYardPath, { active: true });
    expect(
      addedEntities.filter((entity) =>
        entity.id.startsWith("flow-test-arrow-flow-chevron-"),
      ),
    ).toHaveLength(5);

    layer.removeArrow("flow-test-arrow");
    expect(viewer.entities.remove).toHaveBeenCalledTimes(5);
  });

  test("can re-enable remembered arrow paths after a runtime toggle", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const layer = new FlowChevronLayer(viewer);

    layer.syncArrow("flow-toggle-arrow", thirtyYardPath, { active: false });
    layer.setEnabled(false);
    layer.setEnabled(true);

    expect(viewer.entities.remove).toHaveBeenCalledTimes(5);
    expect(
      addedEntities.filter((entity) =>
        entity.id.startsWith("flow-toggle-arrow-flow-chevron-"),
      ),
    ).toHaveLength(10);
  });

  test("honors URL and environment toggles", () => {
    expect(
      resolveFlowChevronEnabled({
        search: "?chevrons=false",
        env: { VITE_ENABLE_FLOW_CHEVRONS: "true" },
      }),
    ).toBe(false);
    expect(
      resolveFlowChevronEnabled({
        search: "?flowChevrons=true",
        env: { VITE_ENABLE_FLOW_CHEVRONS: "false" },
      }),
    ).toBe(true);
    expect(
      resolveFlowChevronEnabled({
        search: "",
        env: { VITE_ENABLE_FLOW_CHEVRONS: "false" },
      }),
    ).toBe(false);
    expect(resolveFlowChevronEnabled({ search: "", env: {} })).toBe(true);
  });
});
