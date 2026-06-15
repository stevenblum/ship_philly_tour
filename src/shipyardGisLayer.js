import * as Cesium from "cesium";
import { normalizeBasePath } from "./basePath.js";
import { logger } from "./logger.js";

const SHIPYARD_GIS_ASSET_DIR = "data/shipyard-gis";
const SHIPYARD_GIS_SOURCE_FILES = [
  { key: "polygons", fileName: "polygons.geojson", geometryKind: "polygons" },
  { key: "lines", fileName: "lines.geojson", geometryKind: "lines" },
  { key: "points", fileName: "points.geojson", geometryKind: "points" },
];

// GIS_PRESENTATION_SCALE doubles the QGIS-authored line and point sizes only
// inside the Cesium presentation overlay. The generated styles remain faithful
// to the GeoPackage, while the final slide is easier to read from the audience.
const GIS_PRESENTATION_SCALE = 2;

const DEFAULT_STYLE_BY_GEOMETRY = {
  points: {
    label: "fallback point",
    qgisSymbolType: "marker",
    pointColor: { css: "rgba(83, 216, 255, 1)" },
    outlineColor: { css: "rgba(17, 24, 39, 1)" },
    outlineWidthPx: 1,
    pointSizePx: 9,
  },
  lines: {
    label: "fallback line",
    qgisSymbolType: "line",
    strokeColor: { css: "rgba(83, 216, 255, 1)" },
    strokeWidthPx: 2,
  },
  polygons: {
    label: "fallback polygon",
    qgisSymbolType: "fill",
    fillEnabled: true,
    fillColor: { css: "rgba(83, 216, 255, 0.14)" },
    outlineColor: { css: "rgba(83, 216, 255, 1)" },
    outlineWidthPx: 2,
  },
};

// readRuntimeBasePath uses Vite's BASE_URL in browser builds and falls back to
// VITE_APP_BASE_PATH for unit tests or direct module evaluation.
function readRuntimeBasePath() {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env.BASE_URL ?? import.meta.env.VITE_APP_BASE_PATH ?? "/";
  }

  if (typeof process !== "undefined" && process.env) {
    return process.env.VITE_APP_BASE_PATH ?? "/";
  }

  return "/";
}

// buildShipyardGisAssetUrls keeps the GeoJSON fetch paths compatible with both
// local root hosting and GitHub Pages project-site base paths.
export function buildShipyardGisAssetUrls(basePath = readRuntimeBasePath()) {
  const normalizedBasePath = normalizeBasePath(basePath);
  const assetBase = `${normalizedBasePath}${SHIPYARD_GIS_ASSET_DIR}`;

  return {
    styles: `${assetBase}/styles.json`,
    manifest: `${assetBase}/manifest.json`,
    sources: SHIPYARD_GIS_SOURCE_FILES.map((source) => ({
      ...source,
      url: `${assetBase}/${source.fileName}`,
    })),
  };
}

// normalizeGeometryKind accepts file-level names and GeoJSON geometry names so
// fallback styling still works if a future conversion includes Multi* features.
export function normalizeGeometryKind(geometryKind) {
  const normalized = String(geometryKind ?? "").toLowerCase();

  if (normalized.includes("point")) return "points";
  if (normalized.includes("line")) return "lines";
  if (normalized.includes("polygon")) return "polygons";

  return normalized || "unknown";
}

// readEntityProperty hides the difference between plain test objects and
// Cesium PropertyBag values created by GeoJsonDataSource.
function readEntityProperty(entity, propertyName) {
  const properties = entity?.properties;

  if (!properties) return undefined;

  if (typeof properties.getValue === "function") {
    return properties.getValue(Cesium.JulianDate.now())?.[propertyName];
  }

  const property = properties[propertyName];

  if (property && typeof property.getValue === "function") {
    return property.getValue(Cesium.JulianDate.now());
  }

  return property;
}

// resolveShipyardGisStyle maps a feature's styleClass to a generated style
// record. Unknown future style classes fall back by geometry kind and log once
// through the caller so the final slide still renders after schema additions.
export function resolveShipyardGisStyle(styles, properties, geometryKind) {
  const normalizedKind = normalizeGeometryKind(geometryKind);
  const styleClass = properties?.styleClass;
  const style = styleClass ? styles?.classes?.[styleClass] : undefined;

  return (
    style ??
    DEFAULT_STYLE_BY_GEOMETRY[normalizedKind] ??
    DEFAULT_STYLE_BY_GEOMETRY.points
  );
}

// styleColorToCesiumColor converts generated CSS/RGBA color records into Cesium
// Color values. It accepts strings too so tests and future hand-authored styles
// can use concise CSS colors.
export function styleColorToCesiumColor(styleColor, fallbackCss) {
  if (typeof styleColor === "string") {
    return Cesium.Color.fromCssColorString(styleColor);
  }

  if (styleColor?.css) {
    return Cesium.Color.fromCssColorString(styleColor.css);
  }

  if (Array.isArray(styleColor?.rgba)) {
    const [red = 255, green = 255, blue = 255, alpha = 255] = styleColor.rgba;
    return new Cesium.Color(red / 255, green / 255, blue / 255, alpha / 255);
  }

  return Cesium.Color.fromCssColorString(fallbackCss);
}

// readFeatureProperties resolves the subset of GeoPackage properties that drive
// styling and labels after GeoJsonDataSource converts them into Cesium entities.
function readFeatureProperties(entity) {
  return {
    canonical_id: readEntityProperty(entity, "canonical_id"),
    name: readEntityProperty(entity, "name"),
    visible_label: readEntityProperty(entity, "visible_label"),
    styleClass: readEntityProperty(entity, "styleClass"),
  };
}

// buildLabelText uses visible_label first because that is the GIS-authored
// presentation label; name is a fallback for future rows without labels.
function buildLabelText(properties) {
  return properties.visible_label || properties.name || properties.canonical_id;
}

// applyPointStyle replaces Cesium's default GeoJSON pin billboard with a simple
// clamped point and conservative label suited to the final overview slide.
function applyPointStyle(entity, style, properties) {
  const labelText = buildLabelText(properties);
  const pointSizePx =
    (style.pointSizePx ?? DEFAULT_STYLE_BY_GEOMETRY.points.pointSizePx) *
    GIS_PRESENTATION_SCALE;

  entity.billboard = undefined;
  entity.point = {
    pixelSize: pointSizePx,
    color: styleColorToCesiumColor(
      style.pointColor,
      DEFAULT_STYLE_BY_GEOMETRY.points.pointColor.css,
    ),
    outlineColor: styleColorToCesiumColor(
      style.outlineColor,
      DEFAULT_STYLE_BY_GEOMETRY.points.outlineColor.css,
    ),
    outlineWidth:
      style.outlineWidthPx ?? DEFAULT_STYLE_BY_GEOMETRY.points.outlineWidthPx,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };

  if (labelText) {
    entity.label = {
      text: labelText,
      font: "12px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -(pointSizePx + 6)),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    };
  }
}

// applyLineStyle uses the QGIS line color/width on the clamped GeoJSON line so
// roads, transfers, and process edges remain visually distinct in Cesium.
function applyLineStyle(entity, style) {
  if (!entity.polyline) return;

  entity.polyline.material = styleColorToCesiumColor(
    style.strokeColor,
    DEFAULT_STYLE_BY_GEOMETRY.lines.strokeColor.css,
  );
  entity.polyline.width =
    (style.strokeWidthPx ?? DEFAULT_STYLE_BY_GEOMETRY.lines.strokeWidthPx) *
    GIS_PRESENTATION_SCALE;
  entity.polyline.clampToGround = true;
  entity.polyline.disableDepthTestDistance = Number.POSITIVE_INFINITY;
}

// applyPolygonStyle keeps boundary fills subtle and outlines readable so the
// final slide can show shop, storage, and gantry areas over satellite/3D context.
function applyPolygonStyle(entity, style) {
  if (!entity.polygon) return;

  entity.polygon.material =
    style.fillEnabled === false
      ? Cesium.Color.TRANSPARENT
      : styleColorToCesiumColor(
          style.fillColor,
          DEFAULT_STYLE_BY_GEOMETRY.polygons.fillColor.css,
        );
  entity.polygon.outline = true;
  entity.polygon.outlineColor = styleColorToCesiumColor(
    style.outlineColor,
    DEFAULT_STYLE_BY_GEOMETRY.polygons.outlineColor.css,
  );
  entity.polygon.outlineWidth =
    (style.outlineWidthPx ??
      DEFAULT_STYLE_BY_GEOMETRY.polygons.outlineWidthPx) *
    GIS_PRESENTATION_SCALE;
  entity.polygon.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
}

// applyShipyardGisEntityStyle is exported for unit tests because it is the core
// behavior that turns generated styleClass records into Cesium graphics.
export function applyShipyardGisEntityStyle(
  entity,
  styles,
  geometryKind,
  options = {},
) {
  const properties = options.properties ?? readFeatureProperties(entity);
  const normalizedKind = normalizeGeometryKind(geometryKind);
  const style = resolveShipyardGisStyle(styles, properties, normalizedKind);

  if (normalizedKind === "points") {
    applyPointStyle(entity, style, properties);
    return style;
  }

  if (normalizedKind === "lines") {
    applyLineStyle(entity, style);
    return style;
  }

  applyPolygonStyle(entity, style);
  return style;
}

// ShipyardGisLayer owns the final-slide GIS overlay lifecycle. It loads once,
// then toggles DataSource visibility as the presenter enters or leaves the slide.
export class ShipyardGisLayer {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.assetUrls = options.assetUrls ?? buildShipyardGisAssetUrls();
    this.fetchJson =
      options.fetchJson ??
      (async (url) => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
          );
        }

        return response.json();
      });
    this.dataSources = [];
    this.styles = undefined;
    this.loadPromise = undefined;
    this.visible = false;
    this.missingStyleClasses = new Set();
  }

  // load fetches style metadata and GeoJSON data exactly once. Later slide
  // transitions only toggle show flags, avoiding repeated asset fetches.
  async load() {
    if (!this.loadPromise) {
      this.loadPromise = this.loadDataSources();
    }

    return this.loadPromise;
  }

  // loadDataSources applies generated QGIS-derived styling after Cesium creates
  // entities from each geometry-specific GeoJSON file.
  async loadDataSources() {
    this.styles = await this.fetchJson(this.assetUrls.styles);

    for (const source of this.assetUrls.sources) {
      const dataSource = await Cesium.GeoJsonDataSource.load(source.url, {
        clampToGround: true,
      });
      dataSource.name = `shipyard-gis-${source.key}`;
      dataSource.show = this.visible;

      for (const entity of dataSource.entities.values) {
        const properties = readFeatureProperties(entity);
        this.warnForMissingStyleClass(properties, source.geometryKind);
        applyShipyardGisEntityStyle(entity, this.styles, source.geometryKind, {
          properties,
        });
      }

      await this.viewer.dataSources.add(dataSource);
      this.dataSources.push(dataSource);
    }

    logger.info("Shipyard GIS overlay loaded.", {
      sources: this.assetUrls.sources.map((source) => source.fileName),
    });
  }

  // warnForMissingStyleClass makes future GeoPackage style drift visible during
  // development while still allowing fallback geometry styling to render.
  warnForMissingStyleClass(properties, geometryKind) {
    const styleClass = properties?.styleClass;

    if (
      !styleClass ||
      this.styles?.classes?.[styleClass] ||
      this.missingStyleClasses.has(styleClass)
    ) {
      return;
    }

    this.missingStyleClasses.add(styleClass);
    logger.warn("Shipyard GIS styleClass is missing; using fallback style.", {
      styleClass,
      geometryKind,
    });
  }

  // setVisible records desired state before async loading finishes. This
  // prevents a late GeoJSON load from re-showing the overlay after navigation.
  setVisible(visible) {
    this.visible = visible;

    for (const dataSource of this.dataSources) {
      dataSource.show = visible;
    }

    if (visible) {
      this.load().catch((error) => {
        logger.warn("Failed to load shipyard GIS overlay.", error);
        this.visible = false;
      });
    }
  }

  // show makes the full GIS overlay visible for the final presentation slide.
  show() {
    this.setVisible(true);
  }

  // hide removes the full GIS overlay from ordinary production-flow slides.
  hide() {
    this.setVisible(false);
  }
}
