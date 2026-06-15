// WGS84_MEAN_RADIUS_M supports small local placement offsets for curated
// presentation nodes without introducing a Cesium dependency into source data.
const WGS84_MEAN_RADIUS_M = 6371008.8;

// METERS_PER_YARD converts user-authored shipyard layout distances into the
// meter values used by geographic calculations.
const METERS_PER_YARD = 0.9144;

// WEB_SHOP_POINT is reused for both the KML-derived Web Shop and the curated
// Cutting Area point that is intentionally placed due north of it.
const WEB_SHOP_POINT = {
  lon: -75.18994035699241,
  lat: 39.89031406521822,
  height: 21.80799734858699,
};

// BULKHEAD_SHOP_SOURCE_POINT preserves the raw KML coordinate while the
// rendered tour point is adjusted north to improve panel-shop spacing.
const BULKHEAD_SHOP_SOURCE_POINT = {
  lon: -75.18958279608138,
  lat: 39.89035342797445,
  height: 22.26920616734652,
};

// OUTFITTING_SHOP_SOURCE_POINT preserves the raw KML coordinate while the
// rendered tour point is adjusted south and west for the presentation layout.
const OUTFITTING_SHOP_SOURCE_POINT = {
  lon: -75.18921521895085,
  lat: 39.89038817522921,
  height: 22.21015129931645,
};

// CURVED_PANEL_SHOP_SOURCE_POINT preserves the raw KML coordinate while the
// rendered tour point is adjusted north to better match the presentation layout.
const CURVED_PANEL_SHOP_SOURCE_POINT = {
  lon: -75.18882476074256,
  lat: 39.89041659861662,
  height: 28.81652363403335,
};

// GRAND_BLOCK_ASSEMBLY_AREA_SOURCE_POINT preserves the raw KML coordinate while
// the rendered tour point is shifted south/east to match the presentation layout.
const GRAND_BLOCK_ASSEMBLY_AREA_SOURCE_POINT = {
  lon: -75.19015505259583,
  lat: 39.8885150815882,
  height: 3.657371597748869,
};

// pointOffsetByMeters applies small local north/east offsets in WGS84 degrees.
// It uses the source latitude to scale longitude movement by cos(latitude),
// which is accurate enough for yard-scale presentation placement adjustments.
function pointOffsetByMeters(point, { northMeters = 0, eastMeters = 0 }) {
  return {
    lon:
      point.lon +
      (eastMeters /
        (WGS84_MEAN_RADIUS_M * Math.cos((point.lat * Math.PI) / 180))) *
        (180 / Math.PI),
    lat: point.lat + (northMeters / WGS84_MEAN_RADIUS_M) * (180 / Math.PI),
    height: point.height,
  };
}

// pointNorthOf keeps presentation placement offsets tied to their source point
// so future coordinate refinements move derived tour nodes with them.
function pointNorthOf(point, northMeters) {
  return pointOffsetByMeters(point, { northMeters });
}

// These location records are the normalized data equivalent of the source KML
// placemarks in public/data/philly-tour.kml plus curated presentation nodes.
// KML-derived records preserve their source ids/names.
export const shipyardLocations = [
  {
    id: "085D2C81123FF1442989",
    slug: "steel-storage-area",
    name: "Steel Storage Area",
    point: {
      lon: -75.19154635188589,
      lat: 39.8905216581939,
      height: 4.125336980968635,
    },
    lookAt: {
      lon: -75.19170682088567,
      lat: 39.89023939221137,
      altitude: 18.41812333387917,
      heading: 83.5962967117606,
      tilt: 65.08299910685058,
      range: 280.8364585369054,
    },
  },
  {
    id: "0CFFFCFBD13FF1449B6C",
    slug: "large-panel-line",
    name: "Large Panel Line",
    point: {
      lon: -75.19075713256817,
      lat: 39.8900063674073,
      height: 18.018204053712,
    },
    lookAt: {
      lon: -75.19061948308114,
      lat: 39.89038784872065,
      altitude: 3.594521041332244,
      heading: 83.59699404530926,
      tilt: 65.08328608071118,
      range: 316.0216072641924,
    },
    photo: "/photos/philly-large-panel.png",
  },
  {
    id: "040E46EF1D3FF144F958",
    slug: "double-bottom-line",
    name: "Double Bottom Line",
    point: {
      lon: -75.19077244420436,
      lat: 39.88969508567276,
      height: 21.20031016049998,
    },
    lookAt: {
      lon: -75.19061948308114,
      lat: 39.89038784872065,
      altitude: 3.594521041332244,
      heading: 83.59699404530926,
      tilt: 65.08328608071118,
      range: 316.0216072641924,
    },
  },
  {
    id: "0244E0A4203FF145FADC",
    slug: "web-shop",
    name: "Web Shop",
    point: WEB_SHOP_POINT,
    lookAt: {
      lon: -75.190143617625,
      lat: 39.89035093483132,
      altitude: 18.22370040128327,
      heading: 85.93534256747986,
      tilt: 70.4562449949444,
      range: 121.5090397843778,
    },
  },
  {
    id: "curated-cutting-area",
    slug: "cutting-area",
    name: "Cutting Area",
    source: "curated",
    point: pointNorthOf(WEB_SHOP_POINT, 40 * METERS_PER_YARD),
  },
  {
    id: "0CB222D0703FF146815F",
    slug: "bulkhead-shop",
    name: "Bulkhead Shop",
    sourcePoint: BULKHEAD_SHOP_SOURCE_POINT,
    point: pointNorthOf(BULKHEAD_SHOP_SOURCE_POINT, 10 * METERS_PER_YARD),
    lookAt: {
      lon: -75.18911941244316,
      lat: 39.89037891924588,
      altitude: 21.41760681466248,
      heading: 85.93648131957112,
      tilt: 70.45706675369664,
      range: 218.47191249959,
    },
  },
  {
    id: "046983499A3FF146D870",
    slug: "outfitting-shop",
    name: "Outfitting Shop",
    sourcePoint: OUTFITTING_SHOP_SOURCE_POINT,
    point: pointOffsetByMeters(OUTFITTING_SHOP_SOURCE_POINT, {
      northMeters: -70 * METERS_PER_YARD,
      eastMeters: -5 * METERS_PER_YARD,
    }),
    lookAt: {
      lon: -75.18911941244316,
      lat: 39.89037891924588,
      altitude: 21.41760681466248,
      heading: 85.93648131957112,
      tilt: 70.45706675369664,
      range: 218.47191249959,
    },
  },
  {
    id: "03F675CC2A3FF1470FE1",
    slug: "curved-panel-shop",
    name: "Curved Panel Shop",
    sourcePoint: CURVED_PANEL_SHOP_SOURCE_POINT,
    point: pointNorthOf(CURVED_PANEL_SHOP_SOURCE_POINT, 30 * METERS_PER_YARD),
    lookAt: {
      lon: -75.18911941244316,
      lat: 39.89037891924588,
      altitude: 21.41760681466248,
      heading: 85.93648131957112,
      tilt: 70.45706675369664,
      range: 218.47191249959,
    },
    photo: "/photos/philly-curved-panel.png",
  },
  {
    id: "032F13B6683FF1474741",
    slug: "section-asembly-shop",
    name: "Section Asembly Shop",
    displayName: "Section Assembly Shop",
    point: {
      lon: -75.18845859064652,
      lat: 39.89044519171701,
      height: 26.097376478271,
    },
    lookAt: {
      lon: -75.18911941244316,
      lat: 39.89037891924588,
      altitude: 21.41760681466248,
      heading: 85.93648131957112,
      tilt: 70.45706675369664,
      range: 218.47191249959,
    },
  },
  {
    id: "046472439C3FF14791FF",
    slug: "grand-block-shop",
    name: "Grand Block Shop",
    displayName: "Block Assembly Shop",
    point: {
      lon: -75.18882979024634,
      lat: 39.88872808015807,
      height: 9.567321138301356,
    },
    lookAt: {
      lon: -75.18921177550109,
      lat: 39.88872869345642,
      altitude: 27.21801956952427,
      heading: 85.93692913570371,
      tilt: 70.4574719099941,
      range: 266.2782838926433,
    },
    photo: "/photos/philly-grand-block.png",
  },
  {
    id: "00ECA6429F3FF147E080",
    slug: "paint-shop",
    name: "Paint Shop",
    point: {
      lon: -75.18871980613957,
      lat: 39.88731435526774,
      height: 33.4607997919598,
    },
    lookAt: {
      lon: -75.1875678824638,
      lat: 39.887096345015,
      altitude: 3.665761959449525,
      heading: 85.93798332248473,
      tilt: 70.45806864409444,
      range: 336.6882845749205,
    },
  },
  {
    id: "07E503C0223FF149AC3F",
    slug: "grand-block-assembly-area",
    name: "Grand Block Assembly Area",
    sourcePoint: GRAND_BLOCK_ASSEMBLY_AREA_SOURCE_POINT,
    point: pointOffsetByMeters(GRAND_BLOCK_ASSEMBLY_AREA_SOURCE_POINT, {
      northMeters: -150,
      eastMeters: 15,
    }),
    lookAt: {
      lon: -75.19072379288015,
      lat: 39.88745438483825,
      altitude: 2.390696842107527,
      heading: 82.22243877813446,
      tilt: 35.25338278344393,
      range: 833.1991889014898,
    },
    photo: "/photos/philly-block-transport.png",
  },
  {
    id: "07F9E3A8BA3FF14A1CE8",
    slug: "building-dock",
    name: "Building Dock",
    point: {
      lon: -75.19072072770476,
      lat: 39.88720122928942,
      height: 2.203360184659442,
    },
    lookAt: {
      lon: -75.19093303166754,
      lat: 39.8873327979846,
      altitude: 2.034355958635823,
      heading: 80.70559243309637,
      tilt: 49.1132067933727,
      range: 217.8160327929072,
    },
  },
  {
    id: "0A70A6840D3FF14A7A1F",
    slug: "outfitting-dock",
    name: "Outfitting Dock",
    point: {
      lon: -75.19217773074095,
      lat: 39.88656858703229,
      height: 1.034634275135133,
    },
    lookAt: {
      lon: -75.19160111430162,
      lat: 39.88669859016171,
      altitude: 2.497955475188101,
      heading: 80.70664814958967,
      tilt: 49.11524198538427,
      range: 517.1641849848675,
    },
  },
];

// getLocationBySlug keeps tour-stop definitions readable while preserving the
// original KML placemark ids as stable source identifiers.
export function getLocationBySlug(slug) {
  return shipyardLocations.find((location) => location.slug === slug);
}

// toPointLabel converts source placemarks into surface-anchored Cesium callouts
// so the overview can show the shipyard's major shops without floating marker
// dots above the satellite or 3D-tile surface.
export function toPointLabel(location) {
  return {
    id: `${location.slug}-label`,
    sourceId: location.id,
    type: "point-label",
    label: location.displayName ?? location.name,
    lon: location.point.lon,
    lat: location.point.lat,
    height: 0,
  };
}
