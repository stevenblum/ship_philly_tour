import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  approximateSurfaceDistanceMeters,
  buildRelativeControlOffset,
  DEFAULT_ARROW_CONTROL_HEIGHT_M,
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

const PUBLIC_ROOT = new URL("../../public/", import.meta.url);

// publicPhotoExists verifies that authored `/photos/...` paths correspond to
// real static assets that Vite will serve from the public directory.
function publicPhotoExists(src) {
  return existsSync(new URL(`.${src}`, PUBLIC_ROOT));
}

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
      "Shipyard Layout",
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
      "WIP Flight",
      "MES Network",
    ]);
    expect(tourStops[0].slideNumber).toBe(0);
    expect(tourStops[1].slideNumber).toBe(1);
    expect(tourStops[1].stats).toEqual([]);
    const panelStop = tourStops.find((stop) => stop.id === "panel-production");
    expect(panelStop.photos).toHaveLength(4);
    expect(panelStop.photos.map((photo) => photo.label)).toEqual([
      "Large Panel Shop",
      "Double Bottom Shop",
      "Bulkhead Shop",
      "Curved Panel Shop",
    ]);
  });

  test("maps initial photos to the correct shops and keeps requested shops photo-free", () => {
    const expectedLocationPhotos = new Map([
      ["cutting-area", "/photos/philly-cutting-area.jpg"],
      ["large-panel-line", "/photos/philly-large-panel.jpg"],
      ["double-bottom-line", "/photos/philly-double-bottom.jpg"],
      ["bulkhead-shop", "/photos/philly-bulkhead-line.jpg"],
      ["curved-panel-shop", "/photos/philly-curved-panel.jpg"],
      ["grand-block-shop", "/photos/philly-grand-block.jpg"],
      ["paint-shop", "/photos/philly-paint-shop.png"],
      ["grand-block-assembly-area", "/photos/philly-block-transport.png"],
      ["building-dock", "/photos/philly-building-dock.jpg"],
    ]);
    const locationsWithoutPhotos = [
      "steel-storage-area",
      "web-shop",
      "section-asembly-shop",
      "outfitting-shop",
      "outfitting-dock",
    ];
    const panelStop = tourStops.find((stop) => stop.id === "panel-production");

    for (const [slug, expectedPhoto] of expectedLocationPhotos) {
      const location = getLocationBySlug(slug);

      expect(location.photo).toBe(expectedPhoto);
      expect(publicPhotoExists(expectedPhoto)).toBe(true);
    }

    for (const slug of locationsWithoutPhotos) {
      expect(getLocationBySlug(slug).photo).toBeUndefined();
    }

    expect(tourStops.find((stop) => stop.id === "overview").photo).toBeNull();
    expect(tourStops.find((stop) => stop.id === "shipyard-layout").photo).toBeNull();
    expect(publicPhotoExists("/photos/philly-shipyard-layout.png")).toBe(true);
    expect(tourStops.find((stop) => stop.id === "cutting-shop").photo).toBe(
      "/photos/philly-cutting-area.jpg",
    );
    expect(tourStops.find((stop) => stop.id === "paint-shop").photo).toBe(
      "/photos/philly-paint-shop.png",
    );
    expect(tourStops.find((stop) => stop.id === "building-dock").photo).toBe(
      "/photos/philly-building-dock.jpg",
    );
    expect(panelStop.photos).toEqual([
      { label: "Large Panel Shop", src: "/photos/philly-large-panel.jpg" },
      { label: "Double Bottom Shop", src: "/photos/philly-double-bottom.jpg" },
      { label: "Bulkhead Shop", src: "/photos/philly-bulkhead-line.jpg" },
      { label: "Curved Panel Shop", src: "/photos/philly-curved-panel.jpg" },
    ]);
  });

  test("uses the published-layout camera heading for authored stops", () => {
    const authoredCameraStops = tourStops.filter(
      (stop) => stop.cameraMode === "targetCentered",
    );
    const headings = authoredCameraStops.map((stop) => stop.view.headingDeg);

    expect(new Set(tourStops.map((stop) => stop.cameraMode))).toEqual(
      new Set(["layoutOverlay", "targetCentered", "pathFlight"]),
    );
    expect(headings.every((heading) => heading > 84 && heading < 86)).toBe(
      true,
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
    ).toBeLessThanOrEqual(DEFAULT_ARROW_CONTROL_HEIGHT_M);
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

    expect(activeIdsByStop.get("shipyard-layout")).toEqual([]);
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
    expect(activeIdsByStop.get("wip-flight")).toEqual([]);
    expect(activeIdsByStop.get("manufacturing-equipment-and-roads")).toEqual(
      [],
    );
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

    expect(activeArrowsByStop.get("shipyard-layout")).toEqual([]);
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
    expect(activeArrowsByStop.get("wip-flight")).toEqual([]);
    expect(
      activeArrowsByStop.get("manufacturing-equipment-and-roads"),
    ).toEqual([]);
  });

  test("adds the WIP Flight path slide immediately before MES Network", () => {
    const wipStop = tourStops.at(-2);
    const finalStop = tourStops.at(-1);

    expect(wipStop.id).toBe("wip-flight");
    expect(wipStop.title).toBe("WIP Flight");
    expect(wipStop.cameraMode).toBe("pathFlight");
    expect(wipStop.pathFlight).toEqual({
      source: "data/wip-tour-path.json",
      durationSec: 60,
      altitudeOffsetM: 15,
      lookAheadSec: 1.5,
      pitchDeg: -15,
    });
    expect(wipStop.showBaseCallouts).toBe(false);
    expect(wipStop.showBaseArrows).toBe(false);
    expect(finalStop.title).toBe("MES Network");
  });

  test("adds slide 0 as a registered layout overlay before the satellite overview", () => {
    const layoutStop = tourStops[0];
    const overviewStop = tourStops[1];

    expect(layoutStop.id).toBe("shipyard-layout");
    expect(layoutStop.title).toBe("Shipyard Layout");
    expect(layoutStop.slideNumber).toBe(0);
    expect(layoutStop.cameraMode).toBe("layoutOverlay");
    expect(layoutStop.layoutOverlay).toEqual({
      source: "data/shipyard-layout-registration.json",
      fadeDurationSec: 1.5,
      durationSec: 3,
    });
    expect(layoutStop.showBaseCallouts).toBe(false);
    expect(layoutStop.showBaseArrows).toBe(false);
    expect(overviewStop.id).toBe("overview");
    expect(overviewStop.slideNumber).toBe(1);
  });

  test("uses the captured target-centered overview camera view", () => {
    const overviewStop = tourStops.find((stop) => stop.id === "overview");

    expect(overviewStop.cameraMode).toBe("targetCentered");
    expect(overviewStop.target.lonDeg).toBeCloseTo(-75.19079894);
    expect(overviewStop.target.latDeg).toBeCloseTo(39.88888721);
    expect(overviewStop.target.heightM).toBeCloseTo(-17.683);
    expect(overviewStop.target.radiusM).toBe(430);
    expect(overviewStop.view.headingDeg).toBeCloseTo(84.992974);
    expect(overviewStop.view.pitchDeg).toBeCloseTo(-48.0084);
    expect(overviewStop.view.rangeM).toBeCloseTo(722.82);
    expect(overviewStop.view.durationSec).toBe(4);
  });

  test("adds a final full GIS overlay slide after the production-flow sequence", () => {
    const finalStop = tourStops.at(-1);

    expect(finalStop.id).toBe("manufacturing-equipment-and-roads");
    expect(finalStop.title).toBe("MES Network");
    expect(finalStop.gisOverlay).toEqual({ show: true });
    expect(finalStop.showBaseCallouts).toBe(false);
    expect(finalStop.showBaseArrows).toBe(false);
    expect(finalStop.cameraMode).toBe("targetCentered");
    expect(finalStop.target.lonDeg).toBeCloseTo(-75.19040073);
    expect(finalStop.target.latDeg).toBeCloseTo(39.88899696);
    expect(finalStop.target.heightM).toBeCloseTo(-0.116);
    expect(finalStop.target.radiusM).toBe(520);
    expect(finalStop.view.headingDeg).toBeCloseTo(84.993007);
    expect(finalStop.view.pitchDeg).toBeCloseTo(-50.008353);
    expect(finalStop.view.rangeM).toBeCloseTo(767.741);
    expect(finalStop.view.durationSec).toBe(4);
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
      ...tourStops.find((stop) => stop.id === "overview"),
      target: undefined,
      view: undefined,
      cameraMode: "targetCentered",
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

  test("rejects malformed layoutOverlay stops", () => {
    const invalidLayoutStop = {
      ...tourStops[0],
      layoutOverlay: {
        source: "",
        fadeDurationSec: 0,
        durationSec: -1,
      },
    };

    const errors = validateTourStops([invalidLayoutStop]);

    expect(errors.some((error) => error.includes("layoutOverlay.source"))).toBe(
      true,
    );
    expect(
      errors.some((error) => error.includes("layoutOverlay.fadeDurationSec")),
    ).toBe(true);
    expect(
      errors.some((error) => error.includes("layoutOverlay.durationSec")),
    ).toBe(true);
  });

  test("rejects malformed pathFlight stops", () => {
    const invalidPathFlightStop = {
      ...tourStops[0],
      id: "bad-path-flight",
      cameraMode: "pathFlight",
      pathFlight: {
        source: "",
        durationSec: 0,
        altitudeOffsetFt: -1,
        altitudeOffsetM: -1,
        lookAheadSec: 0,
        pitchDeg: Number.NaN,
      },
    };
    delete invalidPathFlightStop.target;
    delete invalidPathFlightStop.view;

    const errors = validateTourStops([invalidPathFlightStop]);

    expect(errors.some((error) => error.includes("pathFlight.source"))).toBe(
      true,
    );
    expect(
      errors.some((error) => error.includes("pathFlight.durationSec")),
    ).toBe(true);
    expect(
      errors.some((error) => error.includes("pathFlight.altitudeOffsetFt")),
    ).toBe(true);
    expect(
      errors.some((error) => error.includes("pathFlight.altitudeOffsetM")),
    ).toBe(true);
    expect(
      errors.some((error) => error.includes("pathFlight.lookAheadSec")),
    ).toBe(true);
    expect(errors.some((error) => error.includes("pathFlight.pitchDeg"))).toBe(
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
