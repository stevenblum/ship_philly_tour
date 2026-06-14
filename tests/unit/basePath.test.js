import { describe, expect, test } from "vitest";
import { getCesiumBaseUrl, normalizeBasePath } from "../../src/basePath.js";

// These tests protect the GitHub Pages compatibility requirement where Vite's
// base path and Cesium's worker/static asset path must stay aligned.
describe("base path helpers", () => {
  test("normalizes local domain-root base path", () => {
    expect(normalizeBasePath("/")).toBe("/");
    expect(getCesiumBaseUrl("/")).toBe("/cesiumStatic");
  });

  test("normalizes GitHub Pages project-site base path", () => {
    expect(normalizeBasePath("/ship_philly_tour")).toBe("/ship_philly_tour/");
    expect(getCesiumBaseUrl("/ship_philly_tour/")).toBe("/ship_philly_tour/cesiumStatic");
  });
});
