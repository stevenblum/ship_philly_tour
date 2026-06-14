import { DEFAULT_RELATIVE_CURVE_RATIO } from "./arrowControlOffset.js";
import {
  getLocationBySlug,
  shipyardLocations,
  toPointLabel,
} from "./shipyardLocations.js";

const steelStorage = getLocationBySlug("steel-storage-area");
const webShop = getLocationBySlug("web-shop");
const cuttingArea = getLocationBySlug("cutting-area");
const largePanel = getLocationBySlug("large-panel-line");
const doubleBottom = getLocationBySlug("double-bottom-line");
const bulkhead = getLocationBySlug("bulkhead-shop");
const curvedPanel = getLocationBySlug("curved-panel-shop");
const sectionAssembly = getLocationBySlug("section-asembly-shop");
const grandBlock = getLocationBySlug("grand-block-shop");
const outfittingShop = getLocationBySlug("outfitting-shop");
const paintShop = getLocationBySlug("paint-shop");
const grandBlockAssembly = getLocationBySlug("grand-block-assembly-area");
const buildingDock = getLocationBySlug("building-dock");
const outfittingDock = getLocationBySlug("outfitting-dock");

// FLOW_ARROW_COLOR keeps the production-flow route visually distinct from
// active green route and point labels while satisfying the blue-arrow
// presentation rule.
const FLOW_ARROW_COLOR = "#53d8ff";

// ACTIVE_FLOW_ARROW_COLOR marks the narrated route segment that leads into the
// currently active shop or group of shops.
const ACTIVE_FLOW_ARROW_COLOR = "#35f27a";

// ACTIVE_FLOW_ARROW_WIDTH makes active route segments visually stronger without
// hiding the always-visible blue process-flow context.
const ACTIVE_FLOW_ARROW_WIDTH = 8;

// Low control height keeps the directional route close to the satellite imagery
// instead of creating tall 3D arcs that distract from the yard layout.
const FLOW_ARROW_CONTROL_HEIGHT_M = 4;

// REDUCED_FLOW_ARROW_CURVE_RATIO trims congested shop-to-section routes while
// preserving the original bend direction. This is used where full bow offsets
// made arrow crossings harder to read.
const REDUCED_FLOW_ARROW_CURVE_RATIO = DEFAULT_RELATIVE_CURVE_RATIO / 2;

// DEFAULT_SHIPYARD_HEADING_DEGREES aligns current tour cameras with the
// published shipyard-layout viewing convention. Cesium receives radians later,
// but keeping degrees here makes camera authoring easier for layout matching.
export const DEFAULT_SHIPYARD_HEADING_DEGREES = 85;

// FLOW_ARROW_IDS centralizes route ids used by both persistent arrow
// definitions and stop-level active-route highlighting.
const FLOW_ARROW_IDS = {
  steelToCutting: "flow-steel-storage-to-cutting-area",
  cuttingToWeb: "flow-cutting-area-to-web-shop",
  cuttingToLargePanel: "flow-cutting-area-to-large-panel",
  cuttingToDoubleBottom: "flow-cutting-area-to-double-bottom",
  cuttingToBulkhead: "flow-cutting-area-to-bulkhead",
  cuttingToCurvedPanel: "flow-cutting-area-to-curved-panel",
  webToSectionAssembly: "flow-web-to-section-assembly",
  largePanelToSectionAssembly: "flow-large-panel-to-section-assembly",
  doubleBottomToSectionAssembly: "flow-double-bottom-to-section-assembly",
  bulkheadToSectionAssembly: "flow-bulkhead-to-section-assembly",
  curvedPanelToSectionAssembly: "flow-curved-panel-to-section-assembly",
  sectionToOutfitting: "flow-section-to-outfitting-shop",
  outfittingToBlock: "flow-outfitting-shop-to-block-assembly-shop",
  blockToPainting: "flow-block-assembly-shop-to-painting-shop",
  paintingToGrandBlockArea: "flow-painting-shop-to-grand-block-area",
  grandBlockAreaToBuildingDock: "flow-grand-block-area-to-building-dock",
  buildingDockToOutfittingDock: "flow-building-dock-to-outfitting-dock",
};

// targetFromLocation turns a KML-derived placemark into the target-centered
// camera schema so the point remains centered while pitch and range define the
// audience-facing view.
function targetFromLocation(location, radiusM = 70) {
  return {
    lonDeg: location.point.lon,
    latDeg: location.point.lat,
    heightM: location.point.height,
    radiusM,
  };
}

// targetView keeps the current shipyard heading consistent while allowing each
// stop to tune pitch, range, and duration for its local context.
function targetView({ pitchDeg = -40, rangeM = 420, durationSec = 3 } = {}) {
  return {
    headingDeg: DEFAULT_SHIPYARD_HEADING_DEGREES,
    pitchDeg,
    rangeM,
    durationSec,
  };
}

// shopCallouts keeps single-location stops compact and consistent with the
// imported placemark label style.
function shopCallouts(...locations) {
  return locations.map(toPointLabel);
}

// labelId mirrors toPointLabel's id convention so tour stops can distinguish
// visible context callouts from the one location that should be active green.
function labelId(location) {
  return `${location.slug}-label`;
}

// flowArrow builds persistent directional callouts that resolve endpoints from
// visible point labels and calculate midpoint bows proportionally to route
// length. `curveSide` is relative to travel from start shop to end shop.
function flowArrow(id, startLocation, endLocation, options = {}) {
  return {
    id,
    type: "curved-arrow-3d",
    color: FLOW_ARROW_COLOR,
    activeColor: ACTIVE_FLOW_ARROW_COLOR,
    width: options.width ?? 5,
    activeWidth: options.activeWidth ?? ACTIVE_FLOW_ARROW_WIDTH,
    sampleCount: 64,
    startCalloutId: labelId(startLocation),
    endCalloutId: labelId(endLocation),
    controlCurve: {
      side: options.curveSide ?? "left",
      ratio: options.curveRatio ?? DEFAULT_RELATIVE_CURVE_RATIO,
      heightM: options.heightM ?? FLOW_ARROW_CONTROL_HEIGHT_M,
    },
  };
}

// processFlowArrows is the always-visible blue production route. It follows the
// slide sequence, with fan-out arrows from Cutting Area to the five panel shops
// and convergence arrows from all panel shops into Section Assembly Shop.
export const processFlowArrows = [
  flowArrow(FLOW_ARROW_IDS.steelToCutting, steelStorage, cuttingArea, {
    curveSide: "left",
  }),
  flowArrow(FLOW_ARROW_IDS.cuttingToWeb, cuttingArea, webShop, {
    curveSide: "left",
  }),
  flowArrow(FLOW_ARROW_IDS.cuttingToLargePanel, cuttingArea, largePanel, {
    curveSide: "right",
  }),
  flowArrow(FLOW_ARROW_IDS.cuttingToDoubleBottom, cuttingArea, doubleBottom, {
    curveSide: "left",
    curveRatio: REDUCED_FLOW_ARROW_CURVE_RATIO,
  }),
  flowArrow(FLOW_ARROW_IDS.cuttingToBulkhead, cuttingArea, bulkhead, {
    curveSide: "left",
  }),
  flowArrow(FLOW_ARROW_IDS.cuttingToCurvedPanel, cuttingArea, curvedPanel, {
    curveSide: "left",
  }),
  flowArrow(FLOW_ARROW_IDS.webToSectionAssembly, webShop, sectionAssembly, {
    curveSide: "right",
    curveRatio: REDUCED_FLOW_ARROW_CURVE_RATIO,
  }),
  flowArrow(
    FLOW_ARROW_IDS.largePanelToSectionAssembly,
    largePanel,
    sectionAssembly,
    { curveSide: "right", curveRatio: REDUCED_FLOW_ARROW_CURVE_RATIO },
  ),
  flowArrow(
    FLOW_ARROW_IDS.doubleBottomToSectionAssembly,
    doubleBottom,
    sectionAssembly,
    { curveSide: "right", curveRatio: REDUCED_FLOW_ARROW_CURVE_RATIO },
  ),
  flowArrow(
    FLOW_ARROW_IDS.bulkheadToSectionAssembly,
    bulkhead,
    sectionAssembly,
    { curveSide: "right", curveRatio: REDUCED_FLOW_ARROW_CURVE_RATIO },
  ),
  flowArrow(
    FLOW_ARROW_IDS.curvedPanelToSectionAssembly,
    curvedPanel,
    sectionAssembly,
    { curveSide: "right", curveRatio: REDUCED_FLOW_ARROW_CURVE_RATIO },
  ),
  flowArrow(
    FLOW_ARROW_IDS.sectionToOutfitting,
    sectionAssembly,
    outfittingShop,
    { curveSide: "left" },
  ),
  flowArrow(FLOW_ARROW_IDS.outfittingToBlock, outfittingShop, grandBlock, {
    curveSide: "left",
  }),
  flowArrow(FLOW_ARROW_IDS.blockToPainting, grandBlock, paintShop, {
    curveSide: "left",
  }),
  flowArrow(
    FLOW_ARROW_IDS.paintingToGrandBlockArea,
    paintShop,
    grandBlockAssembly,
    { curveSide: "left" },
  ),
  flowArrow(
    FLOW_ARROW_IDS.grandBlockAreaToBuildingDock,
    grandBlockAssembly,
    buildingDock,
    { curveSide: "right" },
  ),
  flowArrow(
    FLOW_ARROW_IDS.buildingDockToOutfittingDock,
    buildingDock,
    outfittingDock,
    { curveSide: "left" },
  ),
];

// These stops create a presentation-oriented production-flow path. The content
// avoids internal build/source status and focuses on layout, organization, and
// the overall shipbuilding process for a large-group talk.
export const tourStops = [
  {
    id: "overview",
    title: "Shipyard Overview",
    text: "A wide view of the yard layout: steel enters at storage, flows through cutting and panel production, then moves into assembly, painting, block work, and the waterfront docks.",
    cameraMode: "targetCentered",
    target: {
      lonDeg: -75.1903,
      latDeg: 39.8886,
      heightM: 25,
      radiusM: 430,
    },
    view: targetView({ pitchDeg: -48, rangeM: 1400, durationSec: 4 }),
    photo: null,
    stats: [],
    callouts: shipyardLocations.map(toPointLabel),
    activeCalloutIds: [],
    activeArrowIds: [],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "steel-storage-yard",
    title: "Steel Storage Yard",
    text: "The production flow begins with incoming steel staged at the yard before it moves into cutting and the panel-production shops.",
    cameraMode: "targetCentered",
    target: targetFromLocation(steelStorage, 95),
    view: targetView({ pitchDeg: -40, rangeM: 390 }),
    photo: null,
    stats: [],
    callouts: shopCallouts(steelStorage, cuttingArea),
    activeCalloutIds: [labelId(steelStorage)],
    activeArrowIds: [],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "cutting-shop",
    title: "Cutting Shop",
    text: "Cutting converts stored plate into prepared parts that feed the panel-production shops.",
    cameraMode: "targetCentered",
    target: targetFromLocation(cuttingArea, 75),
    view: targetView({ pitchDeg: -40, rangeM: 360 }),
    photo: null,
    stats: [],
    callouts: shopCallouts(cuttingArea, steelStorage, webShop),
    activeCalloutIds: [labelId(cuttingArea)],
    activeArrowIds: [FLOW_ARROW_IDS.steelToCutting],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "panel-production",
    title: "Panel Production Shops",
    text: "Panel production is a major organizing layer in the yard: flat panels, double bottoms, bulkheads, and curved panels move from specialized shop work toward larger assemblies.",
    cameraMode: "targetCentered",
    target: {
      lonDeg: -75.18972,
      latDeg: 39.89031,
      heightM: 22,
      radiusM: 170,
    },
    view: targetView({ pitchDeg: -38, rangeM: 470 }),
    photos: [
      { label: "Web Shop", src: null },
      { label: "Large Panel Shop", src: largePanel.photo },
      { label: "Double Bottom Shop", src: null },
      { label: "Bulkhead Shop", src: null },
      { label: "Curved Panel Shop", src: curvedPanel.photo },
    ],
    stats: [],
    callouts: shopCallouts(
      webShop,
      largePanel,
      doubleBottom,
      bulkhead,
      curvedPanel,
    ),
    activeCalloutIds: [
      labelId(webShop),
      labelId(largePanel),
      labelId(doubleBottom),
      labelId(bulkhead),
      labelId(curvedPanel),
    ],
    activeArrowIds: [
      FLOW_ARROW_IDS.cuttingToWeb,
      FLOW_ARROW_IDS.cuttingToLargePanel,
      FLOW_ARROW_IDS.cuttingToDoubleBottom,
      FLOW_ARROW_IDS.cuttingToBulkhead,
      FLOW_ARROW_IDS.cuttingToCurvedPanel,
    ],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "section-assembly-shop",
    title: "Section Assembly Shop",
    text: "Section assembly combines shop output into larger pieces, creating the transition from component fabrication to blocks that can move through the yard.",
    cameraMode: "targetCentered",
    target: targetFromLocation(sectionAssembly, 80),
    view: targetView({ pitchDeg: -39, rangeM: 390 }),
    photo: null,
    stats: [],
    callouts: shopCallouts(sectionAssembly, curvedPanel),
    activeCalloutIds: [labelId(sectionAssembly)],
    activeArrowIds: [
      FLOW_ARROW_IDS.webToSectionAssembly,
      FLOW_ARROW_IDS.largePanelToSectionAssembly,
      FLOW_ARROW_IDS.doubleBottomToSectionAssembly,
      FLOW_ARROW_IDS.bulkheadToSectionAssembly,
      FLOW_ARROW_IDS.curvedPanelToSectionAssembly,
    ],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "outfitting-shop",
    title: "Outfitting Shop",
    text: "Outfitting work brings systems, equipment, and production detail into the flow before blocks move through later-stage assembly and painting.",
    cameraMode: "targetCentered",
    target: targetFromLocation(outfittingShop, 80),
    view: targetView({ pitchDeg: -39, rangeM: 380 }),
    photo: null,
    stats: [],
    callouts: shopCallouts(outfittingShop, bulkhead),
    activeCalloutIds: [labelId(outfittingShop)],
    activeArrowIds: [FLOW_ARROW_IDS.sectionToOutfitting],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "grand-block-shop",
    title: "Block Assembly Shop",
    text: "Block assembly links shop output and outfitting work to the large-scale ship sections that later move toward open assembly areas and the docks.",
    cameraMode: "targetCentered",
    target: targetFromLocation(grandBlock, 110),
    view: targetView({ pitchDeg: -42, rangeM: 500 }),
    photo: grandBlock.photo,
    stats: [],
    callouts: shopCallouts(grandBlock, outfittingShop, grandBlockAssembly),
    activeCalloutIds: [labelId(grandBlock)],
    activeArrowIds: [FLOW_ARROW_IDS.outfittingToBlock],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "paint-shop",
    title: "Painting Shop",
    text: "Painting is an important production boundary: work moves from structural assembly toward protective coatings and later-stage completion.",
    cameraMode: "targetCentered",
    target: targetFromLocation(paintShop, 100),
    view: targetView({ pitchDeg: -42, rangeM: 430 }),
    photo: null,
    stats: [],
    callouts: shopCallouts(paintShop, grandBlock),
    activeCalloutIds: [labelId(paintShop)],
    activeArrowIds: [FLOW_ARROW_IDS.blockToPainting],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "grand-block-assembly-area",
    title: "Grand Block Assembly Area",
    text: "The grand block assembly area is where larger assemblies are organized before moving into the final ship construction sequence.",
    cameraMode: "targetCentered",
    target: targetFromLocation(grandBlockAssembly, 130),
    view: targetView({ pitchDeg: -42, rangeM: 560 }),
    photo: grandBlockAssembly.photo,
    stats: [],
    callouts: shopCallouts(grandBlockAssembly, grandBlock, buildingDock),
    activeCalloutIds: [labelId(grandBlockAssembly)],
    activeArrowIds: [FLOW_ARROW_IDS.paintingToGrandBlockArea],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "building-dock",
    title: "Building Dock",
    text: "The building dock is the major downstream destination where large assemblies become the ship structure seen at yard scale.",
    cameraMode: "targetCentered",
    target: targetFromLocation(buildingDock, 150),
    view: targetView({ pitchDeg: -42, rangeM: 560 }),
    photo: null,
    stats: [],
    callouts: shopCallouts(buildingDock, grandBlockAssembly),
    activeCalloutIds: [labelId(buildingDock)],
    activeArrowIds: [FLOW_ARROW_IDS.grandBlockAreaToBuildingDock],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "outfitting-dock",
    title: "Outfitting Dock",
    text: "The outfitting dock represents the final waterfront stage in this layout view, where the ship moves from major construction toward completion activities.",
    cameraMode: "targetCentered",
    target: targetFromLocation(outfittingDock, 150),
    view: targetView({ pitchDeg: -42, rangeM: 580 }),
    photo: null,
    stats: [],
    callouts: shopCallouts(outfittingDock, buildingDock),
    activeCalloutIds: [labelId(outfittingDock)],
    activeArrowIds: [FLOW_ARROW_IDS.buildingDockToOutfittingDock],
    polygons: [],
    arrows: [],
    polylines: [],
  },
];
