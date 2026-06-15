#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SOURCE_KML = resolve(REPO_ROOT, "WIP_Tour.kml");
const OUTPUT_PATH = resolve(REPO_ROOT, "public/data/wip-tour-path.json");
const WIP_PLACEMARK_NAME = "WIP Tour";
const DEFAULT_DURATION_SEC = 60;
const ALTITUDE_OFFSET_M = 15;
const PITCH_DEG = -15;
const EARTH_RADIUS_M = 6_371_008.8;

// decodeXmlText handles the small entity set expected in KML placemark names.
function decodeXmlText(value = "") {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

// extractNamedPlacemark searches by exact placemark name so old shop point
// placemarks in WIP_Tour.kml are ignored by construction.
export function extractNamedPlacemark(kmlText, placemarkName) {
  const placemarks = kmlText.match(/<Placemark\b[\s\S]*?<\/Placemark>/g) ?? [];

  return placemarks.find((placemark) => {
    const name = placemark.match(/<name>([\s\S]*?)<\/name>/)?.[1];

    return decodeXmlText(name) === placemarkName;
  });
}

// parseKmlCoordinate turns KML lon,lat,height tuples into the explicit object
// shape the Cesium flight controller uses at runtime.
function parseKmlCoordinate(coordinateText) {
  const [lonDeg, latDeg, heightM = 0] = coordinateText.split(",").map(Number);

  if (
    !Number.isFinite(lonDeg) ||
    !Number.isFinite(latDeg) ||
    !Number.isFinite(heightM)
  ) {
    throw new Error(`Invalid WIP Tour coordinate: ${coordinateText}`);
  }

  return { lonDeg, latDeg, heightM };
}

// extractLineStringCoordinates intentionally requires a LineString; if the
// placemark becomes a point or polygon, the converter should fail loudly.
export function extractLineStringCoordinates(placemarkText) {
  if (!/<LineString\b/.test(placemarkText)) {
    throw new Error(`${WIP_PLACEMARK_NAME} placemark is not a LineString.`);
  }

  const coordinatesText = placemarkText.match(
    /<coordinates>([\s\S]*?)<\/coordinates>/,
  )?.[1];

  if (!coordinatesText) {
    throw new Error(`${WIP_PLACEMARK_NAME} LineString has no coordinates.`);
  }

  return coordinatesText
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseKmlCoordinate);
}

// approximateSurfaceDistanceMeters uses the haversine formula so conversion
// does not depend on Cesium or browser APIs.
export function approximateSurfaceDistanceMeters(start, end) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const startLat = toRadians(start.latDeg);
  const endLat = toRadians(end.latDeg);
  const deltaLat = toRadians(end.latDeg - start.latDeg);
  const deltaLon = toRadians(end.lonDeg - start.lonDeg);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
}

// addRouteMetrics records cumulative distance per coordinate so the runtime
// SampledPositionProperty can allocate times by distance and maintain a steadier
// apparent speed through uneven KML point spacing.
export function addRouteMetrics(coordinates) {
  let cumulativeDistanceM = 0;

  return coordinates.map((coordinate, index) => {
    if (index > 0) {
      cumulativeDistanceM += approximateSurfaceDistanceMeters(
        coordinates[index - 1],
        coordinate,
      );
    }

    return {
      ...coordinate,
      cumulativeDistanceM: Number(cumulativeDistanceM.toFixed(3)),
    };
  });
}

// buildBounds stores route extent for quick inspection and future camera setup.
function buildBounds(coordinates) {
  const lonValues = coordinates.map((coordinate) => coordinate.lonDeg);
  const latValues = coordinates.map((coordinate) => coordinate.latDeg);

  return {
    west: Math.min(...lonValues),
    south: Math.min(...latValues),
    east: Math.max(...lonValues),
    north: Math.max(...latValues),
  };
}

// buildWipTourPathData is exported for tests because it is the core conversion
// contract from KML LineString to static browser JSON.
export function buildWipTourPathData(kmlText) {
  const placemark = extractNamedPlacemark(kmlText, WIP_PLACEMARK_NAME);

  if (!placemark) {
    throw new Error(`Could not find ${WIP_PLACEMARK_NAME} placemark.`);
  }

  const coordinates = addRouteMetrics(extractLineStringCoordinates(placemark));
  const routeLengthM = coordinates.at(-1)?.cumulativeDistanceM ?? 0;

  return {
    version: 1,
    source: {
      file: "WIP_Tour.kml",
      placemarkName: WIP_PLACEMARK_NAME,
    },
    durationSec: DEFAULT_DURATION_SEC,
    altitudeOffsetM: ALTITUDE_OFFSET_M,
    pitchDeg: PITCH_DEG,
    coordinateCount: coordinates.length,
    routeLengthM,
    bounds: buildBounds(coordinates),
    coordinates,
  };
}

// convertWipTourKml writes the static JSON asset used by the Cesium flight
// controller, keeping GitHub Pages runtime free of KML parsing requirements.
export function convertWipTourKml() {
  const data = buildWipTourPathData(readFileSync(SOURCE_KML, "utf8"));

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// isDirectRun keeps this module importable from Vitest without writing files.
function isDirectRun() {
  return process.argv[1]
    ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isDirectRun()) {
  convertWipTourKml();
}
