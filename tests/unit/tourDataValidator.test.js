import { describe, expect, test } from "vitest";
import {
  approximateSurfaceDistanceMeters,
  buildRelativeControlOffset,
  DEFAULT_RELATIVE_CURVE_RATIO,
} from "../../src/arrowControlOffset.js";
import {
  getLocationBySlug,
  shipyardLocations,
  toPointLabel,
} from "../../src/shipyardLocations.js";
import {
  DEFAULT_SHIPYARD_HEADING_DEGREES,
  processFlowArrows,
  tourStops,
} from "../../src/tourStops.js";
import {
  validateShipyardLocations,
  validateTourStops,
} from "../../src/tourDataValidator.js";

// These tests verify the app starts from valid KML-derived source records and
// valid tour-stop data rather than placeholder-only coordinates.
describe("tour data validation", () => {
  test("accepts the KML-derived and curated shipyard locations", () => {
    expect(validateShipyardLocations(shipyardLocations)).toEqual([]);
    expect(shipyardLocations).toHaveLength(14);
  });

  test("includes expected KML source placemarks", () => {
    const names = shipyardLocations.map((location) => location.name);
    const blockAssembly = shipyardLocations.find(
      (location) => location.slug === "grand-block-shop",
    );

    expect(names).toContain("Steel Storage Area");
    expect(names).toContain("Large Panel Line");
    expect(names).toContain("Section Asembly Shop");
    expect(blockAssembly.name).toBe("Grand Block Shop");
    expect(blockAssembly.displayName).toBe("Block Assembly Shop");
    expect(names).toContain("Building Dock");
    expect(names).toContain("Outfitting Dock");
  });

  test("places the curated Cutting Area 40 yards north of the Web Shop", () => {
    const cuttingArea = getLocationBySlug("cutting-area");
    const webShop = getLocationBySlug("web-shop");

    expect(cuttingArea.name).toBe("Cutting Area");
    expect(cuttingArea.source).toBe("curated");
    expect(cuttingArea.point.lon).toBeCloseTo(webShop.point.lon);
    expect(cuttingArea.point.lat).toBeGreaterThan(webShop.point.lat);
    expect(
      approximateSurfaceDistanceMeters(webShop.point, cuttingArea.point),
    ).toBeCloseTo(40 * 0.9144, 2);
  });

  test("moves the Curved Panel Shop presentation point 30 yards north of its source KML point", () => {
    const curvedPanel = getLocationBySlug("curved-panel-shop");

    expect(curvedPanel.sourcePoint.lon).toBeCloseTo(curvedPanel.point.lon);
    expect(curvedPanel.point.lat).toBeGreaterThan(curvedPanel.sourcePoint.lat);
    expect(
      approximateSurfaceDistanceMeters(
        curvedPanel.sourcePoint,
        curvedPanel.point,
      ),
    ).toBeCloseTo(30 * 0.9144, 2);
  });

  test("moves the Bulkhead Shop presentation point 10 yards north of its source KML point", () => {
    const bulkheadShop = getLocationBySlug("bulkhead-shop");

    expect(bulkheadShop.sourcePoint.lon).toBeCloseTo(bulkheadShop.point.lon);
    expect(bulkheadShop.point.lat).toBeGreaterThan(
      bulkheadShop.sourcePoint.lat,
    );
    expect(
      approximateSurfaceDistanceMeters(
        bulkheadShop.sourcePoint,
        bulkheadShop.point,
      ),
    ).toBeCloseTo(10 * 0.9144, 2);
  });

  test("moves the Outfitting Shop presentation point 70 yards south and 5 yards west of its source KML point", () => {
    const outfittingShop = getLocationBySlug("outfitting-shop");
    const southOnlyPoint = {
      ...outfittingShop.sourcePoint,
      lat: outfittingShop.point.lat,
    };
    const westOnlyPoint = {
      ...outfittingShop.sourcePoint,
      lon: outfittingShop.point.lon,
    };

    expect(outfittingShop.point.lat).toBeLessThan(
      outfittingShop.sourcePoint.lat,
    );
    expect(outfittingShop.point.lon).toBeLessThan(
      outfittingShop.sourcePoint.lon,
    );
    expect(
      approximateSurfaceDistanceMeters(
        outfittingShop.sourcePoint,
        southOnlyPoint,
      ),
    ).toBeCloseTo(70 * 0.9144, 2);
    expect(
      approximateSurfaceDistanceMeters(
        outfittingShop.sourcePoint,
        westOnlyPoint,
      ),
    ).toBeCloseTo(5 * 0.9144, 2);
  });

  test("accepts the initial narrated tour stops", () => {
    expect(validateTourStops(tourStops)).toEqual([]);
    expect(tourStops.map((stop) => stop.title)).toEqual([
      "Shipyard Overview",
      "Steel Storage Yard",
      "Cutting Shop",
      "Panel Production Shops",
      "Section Assembly Shop",
      "Outfitting Shop",
      "Block Assembly Shop",
      "Painting Shop",
      "Grand Block Assembly Area",
      "Building Dock",
      "Outfitting Dock",
    ]);
    expect(tourStops[0].stats).toEqual([]);
    expect(tourStops[3].photos).toHaveLength(5);
    expect(tourStops[3].photos.map((photo) => photo.label)).toEqual([
      "Web Shop",
      "Large Panel Shop",
      "Double Bottom Shop",
      "Bulkhead Shop",
      "Curved Panel Shop",
    ]);
  });

  test("uses the published-layout camera heading for every current stop", () => {
    const modes = tourStops.map((stop) => stop.cameraMode);
    const headings = tourStops.map((stop) => stop.view.headingDeg);

    expect(new Set(modes)).toEqual(new Set(["targetCentered"]));
    expect(new Set(headings)).toEqual(
      new Set([DEFAULT_SHIPYARD_HEADING_DEGREES]),
    );
  });

  test("keeps shaded polygon highlights out of the default presentation sequence", () => {
    // The large-group presentation should identify shops with labels and arrows
    // without drawing filled rectangles that obscure the satellite context.
    const polygonCounts = tourStops.map((stop) => (stop.polygons ?? []).length);

    expect(new Set(polygonCounts)).toEqual(new Set([0]));
  });

  test("keeps default shop callout anchors on the rendered map surface", () => {
    // CalloutManager handles the terrain/3D-Tiles clamping; the authored data
    // should not add fixed aerial offsets that make shop dots float above roofs.
    const calloutHeights = tourStops
      .flatMap((stop) => stop.callouts ?? [])
      .map((callout) => callout.height);

    expect(new Set(calloutHeights)).toEqual(new Set([0]));
  });

  test("defines low persistent blue production-flow arrows", () => {
    const arrowIds = processFlowArrows.map((arrow) => arrow.id);

    expect(processFlowArrows).toHaveLength(17);
    expect(new Set(processFlowArrows.map((arrow) => arrow.color))).toEqual(
      new Set(["#53d8ff"]),
    );
    expect(
      new Set(processFlowArrows.map((arrow) => arrow.activeColor)),
    ).toEqual(new Set(["#35f27a"]));
    expect(
      new Set(processFlowArrows.map((arrow) => arrow.activeWidth)),
    ).toEqual(new Set([8]));
    expect(
      processFlowArrows.every(
        (arrow) => arrow.startCalloutId && arrow.endCalloutId,
      ),
    ).toBe(true);
    expect(processFlowArrows.every((arrow) => !arrow.coordinates)).toBe(true);
    expect(processFlowArrows.every((arrow) => !arrow.controlOffset)).toBe(true);
    expect(processFlowArrows.every((arrow) => arrow.controlCurve?.side)).toBe(
      true,
    );
    expect(
      new Set(processFlowArrows.map((arrow) => arrow.controlCurve.ratio)),
    ).toEqual(
      new Set([DEFAULT_RELATIVE_CURVE_RATIO, DEFAULT_RELATIVE_CURVE_RATIO / 2]),
    );
    expect(
      processFlowArrows.some((arrow) =>
        [arrow.startCalloutId, arrow.endCalloutId].includes(
          "cutting-area-label",
        ),
      ),
    ).toBe(true);
    expect(
      Math.max(...processFlowArrows.map((arrow) => arrow.controlCurve.heightM)),
    ).toBeLessThanOrEqual(4);
    expect(arrowIds).toContain("flow-steel-storage-to-cutting-area");
    expect(arrowIds).toContain("flow-cutting-area-to-web-shop");
    expect(arrowIds).toContain("flow-cutting-area-to-large-panel");
    expect(arrowIds).toContain("flow-cutting-area-to-double-bottom");
    expect(arrowIds).toContain("flow-cutting-area-to-bulkhead");
    expect(arrowIds).toContain("flow-cutting-area-to-curved-panel");
    expect(arrowIds).toContain("flow-web-to-section-assembly");
    expect(arrowIds).toContain("flow-large-panel-to-section-assembly");
    expect(arrowIds).toContain("flow-double-bottom-to-section-assembly");
    expect(arrowIds).toContain("flow-bulkhead-to-section-assembly");
    expect(arrowIds).toContain("flow-curved-panel-to-section-assembly");
    expect(arrowIds).toContain("flow-section-to-outfitting-shop");
    expect(arrowIds).toContain("flow-outfitting-shop-to-block-assembly-shop");
    expect(arrowIds).toContain("flow-block-assembly-shop-to-painting-shop");
  });

  test("uses original bend sides with reduced offsets on congested production-flow arrows", () => {
    const reducedOffsetArrowSides = new Map([
      ["flow-cutting-area-to-double-bottom", "left"],
      ["flow-web-to-section-assembly", "right"],
      ["flow-large-panel-to-section-assembly", "right"],
      ["flow-double-bottom-to-section-assembly", "right"],
      ["flow-bulkhead-to-section-assembly", "right"],
      ["flow-curved-panel-to-section-assembly", "right"],
    ]);

    for (const [arrowId, expectedSide] of reducedOffsetArrowSides) {
      const arrow = processFlowArrows.find(
        (candidate) => candidate.id === arrowId,
      );

      expect(arrow.controlCurve.side).toBe(expectedSide);
      expect(arrow.controlCurve.ratio).toBe(DEFAULT_RELATIVE_CURVE_RATIO / 2);
    }

    const reducedArrowIds = new Set(reducedOffsetArrowSides.keys());
    const ordinaryArrows = processFlowArrows.filter(
      (arrow) => !reducedArrowIds.has(arrow.id),
    );

    expect(
      ordinaryArrows.every(
        (arrow) => arrow.controlCurve.ratio === DEFAULT_RELATIVE_CURVE_RATIO,
      ),
    ).toBe(true);
  });

  test("bends panel-production convergence arrows south before Section Assembly with reduced offsets", () => {
    const calloutsById = new Map(
      shipyardLocations
        .map((location) => toPointLabel(location))
        .map((callout) => [callout.id, callout]),
    );
    const sectionAssemblyArrows = processFlowArrows.filter(
      (arrow) => arrow.endCalloutId === "section-asembly-shop-label",
    );
    const sectionAssemblyOffsets = sectionAssemblyArrows.map((arrow) =>
      buildRelativeControlOffset(
        calloutsById.get(arrow.startCalloutId),
        calloutsById.get(arrow.endCalloutId),
        arrow.controlCurve,
      ),
    );

    expect(sectionAssemblyArrows).toHaveLength(5);
    expect(
      sectionAssemblyArrows.every(
        (arrow) => arrow.controlCurve.side === "right",
      ),
    ).toBe(true);
    expect(
      sectionAssemblyArrows.every(
        (arrow) =>
          arrow.controlCurve.ratio === DEFAULT_RELATIVE_CURVE_RATIO / 2,
      ),
    ).toBe(true);
    expect(sectionAssemblyOffsets.every((offset) => offset.latDeg < 0)).toBe(
      true,
    );
    expect(sectionAssemblyOffsets.every((offset) => offset.offsetM > 0)).toBe(
      true,
    );
    expect(sectionAssemblyOffsets.at(-1).offsetM).toBeLessThan(
      sectionAssemblyOffsets[0].offsetM,
    );
  });

  test("highlights only the active stop labels instead of context labels", () => {
    const activeIdsByStop = new Map(
      tourStops.map((stop) => [stop.id, stop.activeCalloutIds ?? []]),
    );

    expect(activeIdsByStop.get("overview")).toEqual([]);
    expect(activeIdsByStop.get("steel-storage-yard")).toEqual([
      "steel-storage-area-label",
    ]);
    expect(activeIdsByStop.get("cutting-shop")).toEqual(["cutting-area-label"]);
    expect(activeIdsByStop.get("section-assembly-shop")).toEqual([
      "section-asembly-shop-label",
    ]);
    expect(activeIdsByStop.get("outfitting-shop")).toEqual([
      "outfitting-shop-label",
    ]);
    expect(activeIdsByStop.get("grand-block-shop")).toEqual([
      "grand-block-shop-label",
    ]);
    expect(activeIdsByStop.get("paint-shop")).toEqual(["paint-shop-label"]);
    expect(activeIdsByStop.get("grand-block-assembly-area")).toEqual([
      "grand-block-assembly-area-label",
    ]);
    expect(activeIdsByStop.get("building-dock")).toEqual([
      "building-dock-label",
    ]);
    expect(activeIdsByStop.get("outfitting-dock")).toEqual([
      "outfitting-dock-label",
    ]);
    expect(activeIdsByStop.get("panel-production")).toEqual([
      "web-shop-label",
      "large-panel-line-label",
      "double-bottom-line-label",
      "bulkhead-shop-label",
      "curved-panel-shop-label",
    ]);
  });

  test("highlights the active production route leading into each narrated stop", () => {
    const activeArrowsByStop = new Map(
      tourStops.map((stop) => [stop.id, stop.activeArrowIds ?? []]),
    );

    expect(activeArrowsByStop.get("overview")).toEqual([]);
    expect(activeArrowsByStop.get("steel-storage-yard")).toEqual([]);
    expect(activeArrowsByStop.get("cutting-shop")).toEqual([
      "flow-steel-storage-to-cutting-area",
    ]);
    expect(activeArrowsByStop.get("panel-production")).toEqual([
      "flow-cutting-area-to-web-shop",
      "flow-cutting-area-to-large-panel",
      "flow-cutting-area-to-double-bottom",
      "flow-cutting-area-to-bulkhead",
      "flow-cutting-area-to-curved-panel",
    ]);
    expect(activeArrowsByStop.get("section-assembly-shop")).toEqual([
      "flow-web-to-section-assembly",
      "flow-large-panel-to-section-assembly",
      "flow-double-bottom-to-section-assembly",
      "flow-bulkhead-to-section-assembly",
      "flow-curved-panel-to-section-assembly",
    ]);
    expect(activeArrowsByStop.get("outfitting-shop")).toEqual([
      "flow-section-to-outfitting-shop",
    ]);
    expect(activeArrowsByStop.get("grand-block-shop")).toEqual([
      "flow-outfitting-shop-to-block-assembly-shop",
    ]);
    expect(activeArrowsByStop.get("paint-shop")).toEqual([
      "flow-block-assembly-shop-to-painting-shop",
    ]);
    expect(activeArrowsByStop.get("grand-block-assembly-area")).toEqual([
      "flow-painting-shop-to-grand-block-area",
    ]);
    expect(activeArrowsByStop.get("building-dock")).toEqual([
      "flow-grand-block-area-to-building-dock",
    ]);
    expect(activeArrowsByStop.get("outfitting-dock")).toEqual([
      "flow-building-dock-to-outfitting-dock",
    ]);
  });

  test("uses the curated Cutting Area point for the Cutting Shop stop", () => {
    const cuttingStop = tourStops.find((stop) => stop.id === "cutting-shop");
    const cuttingCalloutIds = cuttingStop.callouts.map((callout) => callout.id);
    const cuttingArea = getLocationBySlug("cutting-area");

    expect(cuttingStop.target.lonDeg).toBeCloseTo(cuttingArea.point.lon);
    expect(cuttingStop.target.latDeg).toBeCloseTo(cuttingArea.point.lat);
    expect(cuttingCalloutIds).toContain("cutting-area-label");
    expect(cuttingCalloutIds).toContain("web-shop-label");
    expect(cuttingCalloutIds).not.toContain("cutting-shop-label");
  });

  test("accepts explicit absolutePose camera stops for cinematic exceptions", () => {
    const absolutePoseStop = {
      ...tourStops[0],
      id: "absolute-pose-example",
      cameraMode: "absolutePose",
      camera: {
        destination: { lonDeg: -75.19, latDeg: 39.89, heightM: 800 },
        orientation: {
          headingDeg: DEFAULT_SHIPYARD_HEADING_DEGREES,
          pitchDeg: -42,
          rollDeg: 0,
        },
        durationSec: 4,
      },
    };
    delete absolutePoseStop.target;
    delete absolutePoseStop.view;

    expect(validateTourStops([absolutePoseStop])).toEqual([]);
  });

  test("rejects old camera-only stops that are not explicit absolute poses", () => {
    const oldCameraStop = {
      ...tourStops[0],
      target: undefined,
      view: undefined,
      camera: {
        lon: -75,
        lat: 39,
        height: 100,
        heading: DEFAULT_SHIPYARD_HEADING_DEGREES,
        pitch: -45,
        duration: 3,
      },
    };

    const errors = validateTourStops([oldCameraStop]);

    expect(errors.some((error) => error.includes(".target is required"))).toBe(
      true,
    );
    expect(errors.some((error) => error.includes(".view is required"))).toBe(
      true,
    );
  });

  test("detects duplicate stop ids and invalid arrows", () => {
    const invalidStops = [
      {
        ...tourStops[0],
        id: "duplicate",
        arrows: [{ id: "bad-arrow", coordinates: [[-75, 39, 10]] }],
      },
      { ...tourStops[1], id: "duplicate" },
    ];

    const errors = validateTourStops(invalidStops);

    expect(errors.some((error) => error.includes("duplicated"))).toBe(true);
    expect(errors.some((error) => error.includes("at least three"))).toBe(true);
  });
});
