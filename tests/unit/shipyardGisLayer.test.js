import { readFileSync } from "node:fs";
import * as Cesium from "cesium";
import { describe, expect, test } from "vitest";
import {
  applyShipyardGisEntityStyle,
  buildShipyardGisAssetUrls,
  normalizeGeometryKind,
  resolveShipyardGisStyle,
  styleColorToCesiumColor,
} from "../../src/shipyardGisLayer.js";
import {
  buildGeometryFilterSql,
  parseQgisColor,
} from "../../scripts/convertShipyardGpkg.mjs";

const DATA_DIR = new URL("../../public/data/shipyard-gis/", import.meta.url);

// readGeneratedJson loads checked-in generated GIS assets exactly as the Vite
// app serves them, making these tests a guardrail for future GeoPackage refreshes.
function readGeneratedJson(fileName) {
  return JSON.parse(readFileSync(new URL(fileName, DATA_DIR), "utf8"));
}

describe("shipyard GIS generated data", () => {
  test("exports the expected feature counts from the source GeoPackage", () => {
    const manifest = readGeneratedJson("manifest.json");

    expect(manifest.counts.sourceFeatures).toBe(193);
    expect(manifest.counts.exportedFeatures).toBe(192);
    expect(manifest.counts.skippedNullGeometry).toBe(1);
    expect(manifest.counts.byFile).toEqual({
      points: 69,
      lines: 92,
      polygons: 31,
    });
    expect(manifest.bounds.srsId).toBe(4326);
  });

  test("keeps important process graph properties in exported GeoJSON", () => {
    const lines = readGeneratedJson("lines.geojson");
    const processEdge = lines.features.find(
      (feature) => feature.properties?.feature_type === "process_edge",
    );

    expect(processEdge.geometry.type).toBe("LineString");
    expect(processEdge.properties).toMatchObject({
      layer_collection: "process_graph",
    });
    expect(processEdge.properties.source_canonical_id).toBeTruthy();
    expect(processEdge.properties.target_canonical_id).toBeTruthy();
    expect(processEdge.properties.styleClass).toMatch(/^linestring_/);
  });

  test("generates style records for current and future QGIS style classes", () => {
    const styles = readGeneratedJson("styles.json");

    expect(styles.classes.linestring_8108fd7c.label).toBe(
      "process edge - gantry crane",
    );
    expect(styles.classes.linestring_17c29e63.label).toBe("approach teal");
    expect(styles.classes.point_6cecac05.pointSizePx).toBe(10);
    expect(styles.classes.polygon_3a76f57d.fillEnabled).toBe(false);
  });
});

describe("shipyard GIS conversion helpers", () => {
  test("builds explicit geometry-filter SQL for GDAL conversion", () => {
    const sql = buildGeometryFilterSql(["LINESTRING", "MULTILINESTRING"]);

    expect(sql).toContain("SELECT");
    expect(sql).toContain('"canonical_id"');
    expect(sql).toContain("ST_GeometryType(geom) IN");
    expect(sql).toContain("'MULTILINESTRING'");
  });

  test("converts QGIS RGBA colors to Cesium-friendly CSS colors", () => {
    expect(parseQgisColor("249,115,22,255")).toEqual({
      rgba: [249, 115, 22, 255],
      css: "rgba(249, 115, 22, 1)",
    });
    expect(parseQgisColor("255,255,255,46").css).toBe(
      "rgba(255, 255, 255, 0.1804)",
    );
  });
});

describe("shipyard GIS Cesium layer styling", () => {
  test("builds GitHub Pages-compatible asset URLs", () => {
    const urls = buildShipyardGisAssetUrls("/ship_philly_tour");

    expect(urls.styles).toBe("/ship_philly_tour/data/shipyard-gis/styles.json");
    expect(urls.sources.map((source) => source.url)).toEqual([
      "/ship_philly_tour/data/shipyard-gis/polygons.geojson",
      "/ship_philly_tour/data/shipyard-gis/lines.geojson",
      "/ship_philly_tour/data/shipyard-gis/points.geojson",
    ]);
  });

  test("normalizes GeoJSON geometry names for fallback styling", () => {
    expect(normalizeGeometryKind("Point")).toBe("points");
    expect(normalizeGeometryKind("MultiLineString")).toBe("lines");
    expect(normalizeGeometryKind("MultiPolygon")).toBe("polygons");
  });

  test("resolves known style classes and falls back for unknown future classes", () => {
    const styles = readGeneratedJson("styles.json");
    const known = resolveShipyardGisStyle(
      styles,
      { styleClass: "linestring_8108fd7c" },
      "lines",
    );
    const fallback = resolveShipyardGisStyle(
      styles,
      { styleClass: "future_style" },
      "lines",
    );

    expect(known.label).toBe("process edge - gantry crane");
    expect(fallback.label).toBe("fallback line");
  });

  test("applies point labels and clamping from generated style classes", () => {
    const styles = readGeneratedJson("styles.json");
    const entity = {};

    const style = applyShipyardGisEntityStyle(entity, styles, "points", {
      properties: {
        canonical_id: "ShopWeb_PlateCNC",
        visible_label: "CNC Cutting",
        styleClass: "point_6cecac05",
      },
    });

    expect(style.label).toBe("delivery / pickup station");
    expect(entity.billboard).toBeUndefined();
    expect(entity.point.pixelSize).toBe(20);
    expect(entity.point.heightReference).toBe(
      Cesium.HeightReference.CLAMP_TO_GROUND,
    );
    expect(entity.label.text).toBe("CNC Cutting");
    expect(entity.label.pixelOffset.y).toBe(-26);
  });

  test("applies line and polygon styling from generated style classes", () => {
    const styles = readGeneratedJson("styles.json");
    const lineEntity = { polyline: {} };
    const polygonEntity = { polygon: {} };

    applyShipyardGisEntityStyle(lineEntity, styles, "lines", {
      properties: { styleClass: "linestring_7848c9c3" },
    });
    applyShipyardGisEntityStyle(polygonEntity, styles, "polygons", {
      properties: { styleClass: "polygon_3a76f57d" },
    });

    expect(lineEntity.polyline.width).toBe(4);
    expect(lineEntity.polyline.clampToGround).toBe(true);
    expect(
      Cesium.Color.equals(
        styleColorToCesiumColor("rgba(124, 58, 237, 1)", "#fff"),
        lineEntity.polyline.material,
      ),
    ).toBe(true);
    expect(polygonEntity.polygon.material).toBe(Cesium.Color.TRANSPARENT);
    expect(polygonEntity.polygon.outlineWidth).toBe(2);
    expect(polygonEntity.polygon.heightReference).toBe(
      Cesium.HeightReference.CLAMP_TO_GROUND,
    );
  });
});
