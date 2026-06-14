import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const distDir = join(process.cwd(), "dist");

// readBuiltJavaScript returns bundled JS so build tests can verify Cesium's
// static asset base URL without relying on browser execution.
function readBuiltJavaScript() {
  const assetsDir = join(distDir, "assets");
  return readdirSync(assetsDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(join(assetsDir, file), "utf8"))
    .join("\n");
}

describe("local build output", () => {
  test("contains Vite and Cesium static output", () => {
    expect(existsSync(join(distDir, "index.html"))).toBe(true);
    expect(existsSync(join(distDir, "assets"))).toBe(true);
    expect(existsSync(join(distDir, "cesiumStatic", "Workers"))).toBe(true);
    expect(existsSync(join(distDir, "cesiumStatic", "ThirdParty"))).toBe(true);
    expect(existsSync(join(distDir, "cesiumStatic", "Assets"))).toBe(true);
    expect(existsSync(join(distDir, "cesiumStatic", "Widgets"))).toBe(true);
  });

  test("uses local Cesium static base URL", () => {
    expect(readBuiltJavaScript()).toContain("/cesiumStatic");
  });
});
