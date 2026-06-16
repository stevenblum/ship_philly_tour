import * as Cesium from "cesium";
import { describe, expect, test, vi } from "vitest";
import {
  buildPointLabelEntityConfig,
  CalloutManager,
  resolvePointLabelHeightReference,
  resolveSurfaceAnchoredCoordinate,
} from "../../src/calloutManager.js";

// These tests protect the surface-anchored label behavior without starting a
// browser or waiting for real terrain and 3D Tiles to load.
describe("point-label callout graphics", () => {
  const callout = {
    id: "web-shop-label",
    type: "point-label",
    label: "Web Shop",
    lon: -75.18994035699241,
    lat: 39.89031406521822,
    height: 0,
  };

  // createFakeViewer captures the entity configs CalloutManager would send to
  // Cesium so persistent point and arrow lifecycle behavior can be tested
  // without a WebGL scene.
  function createFakeViewer(options = {}) {
    const addedEntities = [];
    const viewer = {
      scene: options.scene,
      entities: {
        add: vi.fn((config) => {
          const entity = {
            ...config,
            billboard: config.billboard ? { ...config.billboard } : undefined,
            label: config.label ? { ...config.label } : undefined,
            point: config.point ? { ...config.point } : undefined,
            polyline: config.polyline ? { ...config.polyline } : undefined,
          };
          addedEntities.push(entity);
          return entity;
        }),
        remove: vi.fn(),
      },
    };

    return { addedEntities, viewer };
  }

  // getArrowColor reads the generated Cesium arrow material so active-route
  // tests can verify the actual material color, not only the authored data.
  function getArrowColor(entity) {
    return entity.polyline.material.getValue(Cesium.JulianDate.now()).color;
  }

  test("clamps ordinary shop point labels to the active surface", () => {
    const config = buildPointLabelEntityConfig(callout);

    expect(config.point.heightReference).toBe(
      Cesium.HeightReference.CLAMP_TO_GROUND,
    );
    expect(config.label.heightReference).toBe(
      Cesium.HeightReference.CLAMP_TO_GROUND,
    );
  });

  test("allows explicit absolute-height callouts for rare authored exceptions", () => {
    const heightReference = resolvePointLabelHeightReference({
      ...callout,
      heightReference: "none",
      height: 120,
    });

    expect(heightReference).toBe(Cesium.HeightReference.NONE);
  });

  test("resolves clamped arrow endpoints from rendered scene height samples", () => {
    const viewer = {
      scene: {
        sampleHeightSupported: true,
        sampleHeight: vi.fn(() => 37),
      },
    };

    const coordinate = resolveSurfaceAnchoredCoordinate(viewer, callout);

    expect(coordinate).toEqual([callout.lon, callout.lat, 37]);
  });

  test("keeps base shop point labels visible while emphasizing only active labels", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const panelCallout = {
      ...callout,
      id: "large-panel-label",
      label: "Large Panel Shop",
      lon: -75.19075713256817,
      lat: 39.8900063674073,
    };
    const manager = new CalloutManager(viewer, {
      baseCallouts: [callout, panelCallout],
    });

    manager.showStopGraphics({
      callouts: [callout, panelCallout],
      activeCalloutIds: [panelCallout.id],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    const webEntity = addedEntities.find((entity) => entity.id === callout.id);
    const panelEntity = addedEntities.find(
      (entity) => entity.id === panelCallout.id,
    );

    expect(addedEntities).toHaveLength(2);
    expect(webEntity.point.pixelSize).toBe(12.5);
    expect(webEntity.label.font).toBe("18.75px sans-serif");
    expect(panelEntity.point.pixelSize).toBe(21.25);
    expect(panelEntity.label.font).toBe("bold 21.25px sans-serif");

    manager.showStopGraphics({
      callouts: [callout],
      activeCalloutIds: [callout.id],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    expect(addedEntities).toHaveLength(2);
    expect(viewer.entities.remove).not.toHaveBeenCalled();
    expect(webEntity.point.pixelSize).toBe(21.25);
    expect(webEntity.label.font).toBe("bold 21.25px sans-serif");
    expect(panelEntity.point.pixelSize).toBe(12.5);
    expect(panelEntity.label.font).toBe("18.75px sans-serif");
  });

  test("keeps every visible overview label inactive when activeCalloutIds is empty", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const panelCallout = {
      ...callout,
      id: "large-panel-label",
      label: "Large Panel Shop",
      lon: -75.19075713256817,
      lat: 39.8900063674073,
    };
    const manager = new CalloutManager(viewer, {
      baseCallouts: [callout, panelCallout],
    });

    manager.showStopGraphics({
      callouts: [callout, panelCallout],
      activeCalloutIds: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    for (const entity of addedEntities) {
      expect(entity.point.pixelSize).toBe(12.5);
      expect(entity.label.font).toBe("18.75px sans-serif");
    }
  });

  test("keeps base arrows visible without recreating them between stops", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const baseArrow = {
      id: "flow-test-arrow",
      type: "curved-arrow-3d",
      color: "#53d8ff",
      width: 5,
      sampleCount: 4,
      coordinates: [
        [-75.191, 39.89, 6],
        [-75.1905, 39.8902, 16],
        [-75.19, 39.8904, 6],
      ],
    };
    const manager = new CalloutManager(viewer, {
      baseArrows: [baseArrow],
      flowChevronOptions: { spacingMeters: 1_000_000 },
    });

    manager.showStopGraphics({
      callouts: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });
    manager.showStopGraphics({
      callouts: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    expect(
      addedEntities.filter((entity) => entity.id === baseArrow.id),
    ).toHaveLength(1);
    expect(addedEntities.filter((entity) => entity.billboard)).toHaveLength(1);
    expect(addedEntities[0].polyline.width).toBe(6.25);
    expect(viewer.entities.remove).not.toHaveBeenCalled();
  });

  test("can hide and restore persistent tour graphics for a full GIS slide", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const baseArrow = {
      id: "flow-test-arrow",
      type: "curved-arrow-3d",
      color: "#53d8ff",
      width: 5,
      sampleCount: 4,
      coordinates: [
        [-75.191, 39.89, 6],
        [-75.1905, 39.8902, 16],
        [-75.19, 39.8904, 6],
      ],
    };
    const manager = new CalloutManager(viewer, {
      baseArrows: [baseArrow],
      baseCallouts: [callout],
      flowChevronOptions: { spacingMeters: 1_000_000 },
    });

    manager.showStopGraphics({
      callouts: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    const labelEntity = addedEntities.find((entity) => entity.id === callout.id);
    const arrowEntity = addedEntities.find((entity) => entity.id === baseArrow.id);

    expect(labelEntity.show).toBe(true);
    expect(arrowEntity.show).toBeUndefined();

    manager.showStopGraphics({
      callouts: [],
      showBaseCallouts: false,
      showBaseArrows: false,
      polygons: [],
      arrows: [],
      polylines: [],
    });

    expect(labelEntity.show).toBe(false);
    expect(arrowEntity.show).toBe(false);

    manager.refreshSurfaceAnchoredArrows();

    expect(labelEntity.show).toBe(false);
    expect(arrowEntity.show).toBe(false);

    manager.showStopGraphics({
      callouts: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    expect(labelEntity.show).toBe(true);
    expect(arrowEntity.show).toBe(true);
  });

  test("can disable standalone flow chevrons without hiding base arrows", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const baseArrow = {
      id: "flow-test-arrow",
      type: "curved-arrow-3d",
      color: "#53d8ff",
      width: 5,
      sampleCount: 4,
      coordinates: [
        [-75.191, 39.89, 6],
        [-75.1905, 39.8902, 16],
        [-75.19, 39.8904, 6],
      ],
    };
    const manager = new CalloutManager(viewer, {
      baseArrows: [baseArrow],
      enableFlowChevrons: false,
    });

    manager.showStopGraphics({
      callouts: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    expect(
      addedEntities.filter((entity) => entity.id === baseArrow.id),
    ).toHaveLength(1);
    expect(addedEntities.filter((entity) => entity.billboard)).toHaveLength(0);
  });

  test("restyles base arrows for the active route and resets inactive routes", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const baseArrow = {
      id: "flow-test-arrow",
      type: "curved-arrow-3d",
      color: "#53d8ff",
      activeColor: "#35f27a",
      width: 5,
      activeWidth: 8,
      sampleCount: 4,
      coordinates: [
        [-75.191, 39.89, 6],
        [-75.1905, 39.8902, 16],
        [-75.19, 39.8904, 6],
      ],
    };
    const manager = new CalloutManager(viewer, { baseArrows: [baseArrow] });

    manager.showStopGraphics({
      callouts: [],
      activeArrowIds: [baseArrow.id],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    const arrowEntity = addedEntities.find(
      (entity) => entity.id === baseArrow.id,
    );
    expect(arrowEntity.polyline.width).toBe(10);
    expect(
      Cesium.Color.equals(
        getArrowColor(arrowEntity),
        Cesium.Color.fromCssColorString("#35f27a"),
      ),
    ).toBe(true);

    manager.showStopGraphics({
      callouts: [],
      activeArrowIds: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    expect(
      addedEntities.filter((entity) => entity.id === baseArrow.id),
    ).toHaveLength(1);
    expect(arrowEntity.polyline.width).toBe(6.25);
    expect(
      Cesium.Color.equals(
        getArrowColor(arrowEntity),
        Cesium.Color.fromCssColorString("#53d8ff"),
      ),
    ).toBe(true);
  });

  test("resolves referenced arrow endpoints from current point-label callouts", () => {
    const { addedEntities, viewer } = createFakeViewer();
    const panelCallout = {
      ...callout,
      id: "large-panel-label",
      label: "Large Panel Shop",
      lon: -75.19075713256817,
      lat: 39.8900063674073,
      height: 0,
    };
    const referencedArrow = {
      id: "flow-web-to-large-panel",
      type: "curved-arrow-3d",
      color: "#53d8ff",
      width: 5,
      sampleCount: 4,
      startCalloutId: callout.id,
      endCalloutId: panelCallout.id,
      controlOffset: { lonDeg: 0, latDeg: 0, heightM: 4 },
    };
    const manager = new CalloutManager(viewer, {
      baseArrows: [referencedArrow],
      baseCallouts: [callout, panelCallout],
      enableFlowChevrons: false,
    });

    manager.showStopGraphics({
      callouts: [],
      activeCalloutIds: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    const arrowEntity = addedEntities.find(
      (entity) => entity.id === referencedArrow.id,
    );
    const start = Cesium.Cartesian3.fromDegrees(
      callout.lon,
      callout.lat,
      callout.height,
    );
    const end = Cesium.Cartesian3.fromDegrees(
      panelCallout.lon,
      panelCallout.lat,
      panelCallout.height,
    );

    expect(
      Cesium.Cartesian3.equalsEpsilon(
        arrowEntity.polyline.positions[0],
        start,
        Cesium.Math.EPSILON7,
      ),
    ).toBe(true);
    expect(
      Cesium.Cartesian3.equalsEpsilon(
        arrowEntity.polyline.positions.at(-1),
        end,
        Cesium.Math.EPSILON7,
      ),
    ).toBe(true);

    panelCallout.lon = -75.19;
    manager.showStopGraphics({
      callouts: [],
      activeCalloutIds: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    const updatedEnd = Cesium.Cartesian3.fromDegrees(
      panelCallout.lon,
      panelCallout.lat,
      panelCallout.height,
    );
    expect(
      addedEntities.filter((entity) => entity.id === referencedArrow.id),
    ).toHaveLength(1);
    expect(
      Cesium.Cartesian3.equalsEpsilon(
        arrowEntity.polyline.positions.at(-1),
        updatedEnd,
        Cesium.Math.EPSILON7,
      ),
    ).toBe(true);
  });

  test("resamples referenced arrow endpoint heights from the rendered surface", () => {
    const panelCallout = {
      ...callout,
      id: "large-panel-label",
      label: "Large Panel Shop",
      lon: -75.19075713256817,
      lat: 39.8900063674073,
      height: 0,
    };
    const sampledHeightsByLon = new Map([
      [callout.lon.toFixed(6), 18],
      [panelCallout.lon.toFixed(6), 31],
    ]);
    const { addedEntities, viewer } = createFakeViewer({
      scene: {
        sampleHeightSupported: true,
        sampleHeight: vi.fn((cartographic) => {
          const lon = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
          return sampledHeightsByLon.get(lon);
        }),
      },
    });
    const referencedArrow = {
      id: "flow-web-to-large-panel",
      type: "curved-arrow-3d",
      color: "#53d8ff",
      width: 5,
      sampleCount: 3,
      startCalloutId: callout.id,
      endCalloutId: panelCallout.id,
      controlOffset: { lonDeg: 0, latDeg: 0, heightM: 4 },
    };
    const manager = new CalloutManager(viewer, {
      baseArrows: [referencedArrow],
      baseCallouts: [callout, panelCallout],
      enableFlowChevrons: false,
    });

    manager.showStopGraphics({
      callouts: [],
      activeCalloutIds: [],
      polygons: [],
      arrows: [],
      polylines: [],
    });

    const arrowEntity = addedEntities.find(
      (entity) => entity.id === referencedArrow.id,
    );
    const start = Cesium.Cartographic.fromCartesian(
      arrowEntity.polyline.positions[0],
    );
    const control = Cesium.Cartographic.fromCartesian(
      arrowEntity.polyline.positions[1],
    );
    const end = Cesium.Cartographic.fromCartesian(
      arrowEntity.polyline.positions.at(-1),
    );

    expect(start.height).toBeCloseTo(18, 2);
    expect(control.height).toBeCloseTo((18 + 31) / 2 + 4, 2);
    expect(end.height).toBeCloseTo(31, 2);
  });
});
