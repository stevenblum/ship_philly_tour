#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SOURCE_KML = resolve(REPO_ROOT, "WIP_Tour.kml");
const OUTPUT_PATH = resolve(
  REPO_ROOT,
  "public/data/shipyard-layout-registration.json",
);
const EARTH_RADIUS_M = 6_371_008.8;
const IMAGE_WIDTH_PX = 3359;
const IMAGE_HEIGHT_PX = 2106;
const IMAGE_SRC = "/photos/philly-shipyard-layout.png";
const SURFACE_HEIGHT_M = 6;
const SECTION_ANCHOR_PIXEL = { x: 1445, y: 659 };
const BUILDING_DOCK_ANCHOR_PIXEL = { x: 3181, y: 1373 };
const CANONICAL_SECTION_ANCHOR = "Section_Assembly_NE_Corner";
const SECTION_ANCHOR_ALIASES = [
  CANONICAL_SECTION_ANCHOR,
  "Secetion_Assembly_NE_Corner",
];
const BUILDING_DOCK_ANCHOR = "Building_Dock_SW_Corner";

// decodeXmlText handles KML placemark names without pulling in a full XML
// parser for the small, controlled point-extraction job this converter performs.
function decodeXmlText(value = "") {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

// toRadians/toDegrees keep the layout-registration math free of Cesium runtime
// dependencies so the converter can run in plain Node during GitHub Pages prep.
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

// roundNumber keeps generated JSON stable across tiny floating-point variations
// while preserving more precision than the visual overlay needs.
function roundNumber(value, decimals = 12) {
  return Number(value.toFixed(decimals));
}

// extractPlacemarks collects names and raw placemark XML. The converter accepts
// the current misspelled KML anchor as an alias but writes canonical metadata.
export function extractPlacemarks(kmlText) {
  return (kmlText.match(/<Placemark\b[\s\S]*?<\/Placemark>/g) ?? []).map(
    (placemarkText) => ({
      name: decodeXmlText(placemarkText.match(/<name>([\s\S]*?)<\/name>/)?.[1]),
      placemarkText,
    }),
  );
}

// findPlacemarkByNames lets the app tolerate the current
// Secetion_Assembly_NE_Corner typo without making that typo canonical.
export function findPlacemarkByNames(kmlText, names) {
  const placemarks = extractPlacemarks(kmlText);

  return placemarks.find((placemark) => names.includes(placemark.name));
}

// extractPointCoordinate requires a Point placemark so old LineString route data
// cannot accidentally be used as a layout-registration anchor.
export function extractPointCoordinate(placemarkText) {
  if (!/<Point\b/.test(placemarkText)) {
    throw new Error("Layout reference placemark must contain a Point.");
  }

  const coordinateText = placemarkText
    .match(/<coordinates>([\s\S]*?)<\/coordinates>/)?.[1]
    ?.trim()
    .split(/\s+/)
    .at(0);

  if (!coordinateText) {
    throw new Error("Layout reference point has no coordinates.");
  }

  const [lonDeg, latDeg, heightM = 0] = coordinateText.split(",").map(Number);

  if (
    !Number.isFinite(lonDeg) ||
    !Number.isFinite(latDeg) ||
    !Number.isFinite(heightM)
  ) {
    throw new Error(`Invalid layout reference coordinate: ${coordinateText}`);
  }

  return { lonDeg, latDeg, heightM };
}

// localMetersFromAnchor projects small yard-scale lon/lat differences into a
// local east/north plane around the Section Assembly reference point.
function localMetersFromAnchor(coordinate, origin) {
  return {
    eastM:
      toRadians(coordinate.lonDeg - origin.lonDeg) *
      EARTH_RADIUS_M *
      Math.cos(toRadians(origin.latDeg)),
    northM: toRadians(coordinate.latDeg - origin.latDeg) * EARTH_RADIUS_M,
  };
}

// coordinateFromLocalMeters converts local east/north offsets back to lon/lat
// for generated Cesium quad corners.
function coordinateFromLocalMeters(localMeters, origin, heightM = SURFACE_HEIGHT_M) {
  return {
    lonDeg: roundNumber(
      origin.lonDeg +
        toDegrees(
          localMeters.eastM /
            (EARTH_RADIUS_M * Math.cos(toRadians(origin.latDeg))),
        ),
    ),
    latDeg: roundNumber(
      origin.latDeg + toDegrees(localMeters.northM / EARTH_RADIUS_M),
    ),
    heightM,
  };
}

// buildLayoutTransform solves the two-point uniform scale and rotation. Image
// y is converted from top-down pixels to a y-up local image plane first.
export function buildLayoutTransform(sectionAnchor, buildingDockAnchor) {
  const sectionPixel = SECTION_ANCHOR_PIXEL;
  const buildingDockPixel = BUILDING_DOCK_ANCHOR_PIXEL;
  const dockLocalMeters = localMetersFromAnchor(
    buildingDockAnchor.coordinate,
    sectionAnchor.coordinate,
  );
  const imageVector = {
    x: buildingDockPixel.x - sectionPixel.x,
    yUp: -(buildingDockPixel.y - sectionPixel.y),
  };
  const pixelDistance = Math.hypot(imageVector.x, imageVector.yUp);
  const groundDistanceM = Math.hypot(
    dockLocalMeters.eastM,
    dockLocalMeters.northM,
  );
  const scaleMPerPixel = groundDistanceM / pixelDistance;
  const imageVectorAngleRad = Math.atan2(imageVector.yUp, imageVector.x);
  const groundVectorAngleRad = Math.atan2(
    dockLocalMeters.northM,
    dockLocalMeters.eastM,
  );
  const rotationRad = groundVectorAngleRad - imageVectorAngleRad;
  const imageRightHeadingDeg =
    (90 - toDegrees(rotationRad) + 360) % 360;
  const imageTopHeadingDeg = (imageRightHeadingDeg - 90 + 360) % 360;

  return {
    sectionPixel,
    buildingDockPixel,
    scaleMPerPixel,
    rotationRad,
    imageRightHeadingDeg,
    imageTopHeadingDeg,
    widthM: IMAGE_WIDTH_PX * scaleMPerPixel,
    heightM: IMAGE_HEIGHT_PX * scaleMPerPixel,
    diagonalM:
      Math.hypot(IMAGE_WIDTH_PX * scaleMPerPixel, IMAGE_HEIGHT_PX * scaleMPerPixel),
    groundDistanceM,
    pixelDistance,
  };
}

// pixelToLocalMeters applies the solved transform to any PNG pixel coordinate.
// Pixel y starts at the top of the image, matching the user's authoring model.
export function pixelToLocalMeters(pixel, sectionAnchor, transform) {
  const dx = pixel.x - transform.sectionPixel.x;
  const dyUp = -(pixel.y - transform.sectionPixel.y);
  const cosRotation = Math.cos(transform.rotationRad);
  const sinRotation = Math.sin(transform.rotationRad);

  return {
    eastM:
      transform.scaleMPerPixel * (cosRotation * dx - sinRotation * dyUp),
    northM:
      transform.scaleMPerPixel * (sinRotation * dx + cosRotation * dyUp),
  };
}

// pixelToCoordinate is exported for tests so the anchor round-trip requirement
// is covered without depending on Cesium.
export function pixelToCoordinate(pixel, sectionAnchor, transform) {
  return coordinateFromLocalMeters(
    pixelToLocalMeters(pixel, sectionAnchor, transform),
    sectionAnchor.coordinate,
  );
}

// buildCornerRecords writes the four explicit quad corners in image order. The
// runtime module uses this order with matching texture coordinates.
function buildCornerRecords(sectionAnchor, transform) {
  return [
    { id: "topLeft", pixel: { x: 0, y: 0 } },
    { id: "topRight", pixel: { x: IMAGE_WIDTH_PX, y: 0 } },
    { id: "bottomRight", pixel: { x: IMAGE_WIDTH_PX, y: IMAGE_HEIGHT_PX } },
    { id: "bottomLeft", pixel: { x: 0, y: IMAGE_HEIGHT_PX } },
  ].map((corner) => ({
    ...corner,
    coordinate: pixelToCoordinate(corner.pixel, sectionAnchor, transform),
  }));
}

// buildShipyardLayoutRegistrationData is the converter's core contract from KML
// anchors plus image pixels to a static, browser-loadable overlay manifest.
export function buildShipyardLayoutRegistrationData(kmlText) {
  const sectionPlacemark = findPlacemarkByNames(kmlText, SECTION_ANCHOR_ALIASES);
  const buildingDockPlacemark = findPlacemarkByNames(kmlText, [
    BUILDING_DOCK_ANCHOR,
  ]);

  if (!sectionPlacemark) {
    throw new Error(`Could not find ${CANONICAL_SECTION_ANCHOR} placemark.`);
  }

  if (!buildingDockPlacemark) {
    throw new Error(`Could not find ${BUILDING_DOCK_ANCHOR} placemark.`);
  }

  const sectionAnchor = {
    id: "sectionAssemblyNE",
    canonicalName: CANONICAL_SECTION_ANCHOR,
    matchedName: sectionPlacemark.name,
    pixel: SECTION_ANCHOR_PIXEL,
    coordinate: extractPointCoordinate(sectionPlacemark.placemarkText),
  };
  const buildingDockAnchor = {
    id: "buildingDockSW",
    canonicalName: BUILDING_DOCK_ANCHOR,
    matchedName: buildingDockPlacemark.name,
    pixel: BUILDING_DOCK_ANCHOR_PIXEL,
    coordinate: extractPointCoordinate(buildingDockPlacemark.placemarkText),
  };
  const transform = buildLayoutTransform(sectionAnchor, buildingDockAnchor);
  const center = pixelToCoordinate(
    { x: IMAGE_WIDTH_PX / 2, y: IMAGE_HEIGHT_PX / 2 },
    sectionAnchor,
    transform,
  );
  const corners = buildCornerRecords(sectionAnchor, transform);
  const cameraHeightM = transform.diagonalM;

  return {
    version: 1,
    source: {
      file: "WIP_Tour.kml",
      acceptedSectionAnchorNames: SECTION_ANCHOR_ALIASES,
      anchors: {
        sectionAssemblyNE: sectionAnchor,
        buildingDockSW: buildingDockAnchor,
      },
    },
    image: {
      src: IMAGE_SRC,
      widthPx: IMAGE_WIDTH_PX,
      heightPx: IMAGE_HEIGHT_PX,
    },
    transform: {
      scaleMPerPixel: roundNumber(transform.scaleMPerPixel),
      rotationRad: roundNumber(transform.rotationRad),
      imageRightHeadingDeg: roundNumber(transform.imageRightHeadingDeg),
      imageTopHeadingDeg: roundNumber(transform.imageTopHeadingDeg),
      widthM: roundNumber(transform.widthM),
      heightM: roundNumber(transform.heightM),
      diagonalM: roundNumber(transform.diagonalM),
      groundDistanceM: roundNumber(transform.groundDistanceM),
      pixelDistance: roundNumber(transform.pixelDistance),
      surfaceHeightM: SURFACE_HEIGHT_M,
    },
    corners,
    center,
    camera: {
      lonDeg: center.lonDeg,
      latDeg: center.latDeg,
      heightM: roundNumber(cameraHeightM, 6),
      headingDeg: roundNumber(transform.imageTopHeadingDeg),
      pitchDeg: -90,
      rollDeg: 0,
      durationSec: 3,
    },
  };
}

// convertShipyardLayoutKml writes the static registration asset consumed by the
// browser overlay so GitHub Pages does not need to parse KML at runtime.
export function convertShipyardLayoutKml() {
  const data = buildShipyardLayoutRegistrationData(
    readFileSync(SOURCE_KML, "utf8"),
  );

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// isDirectRun keeps the converter importable by Vitest without writing files.
function isDirectRun() {
  return process.argv[1]
    ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isDirectRun()) {
  convertShipyardLayoutKml();
}
