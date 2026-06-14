import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const distDir = join(process.cwd(), "dist");

// readBuiltJavaScript checks the generated assets after build:github overwrites
// dist with a GitHub Pages project-site base path.
function readBuiltJavaScript() {
  const assetsDir = join(distDir, "assets");
  return readdirSync(assetsDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(join(assetsDir, file), "utf8"))
    .join("\n");
}

describe("GitHub Pages build output", () => {
  test("contains Vite and Cesium static output", () => {
    expect(existsSync(join(distDir, "index.html"))).toBe(true);
    expect(existsSync(join(distDir, "assets"))).toBe(true);
    expect(existsSync(join(distDir, "cesiumStatic", "Workers"))).toBe(true);
    expect(existsSync(join(distDir, "cesiumStatic", "ThirdParty"))).toBe(true);
    expect(existsSync(join(distDir, "cesiumStatic", "Assets"))).toBe(true);
    expect(existsSync(join(distDir, "cesiumStatic", "Widgets"))).toBe(true);
  });

  test("uses GitHub Pages app and Cesium base URLs", () => {
    const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");

    expect(indexHtml).toContain("/ship_philly_tour/assets/");
    expect(readBuiltJavaScript()).toContain("/ship_philly_tour/cesiumStatic");
  });
});
