import { describe, expect, test } from "vitest";
import { formatSceneModeStatus, resolveSceneMode } from "../../src/sceneMode.js";

// resolveSceneMode tests protect the quota-conservation requirement without
// loading Cesium or creating a WebGL context.
describe("resolveSceneMode", () => {
  test("defaults to lightweight mode without photorealistic tiles", () => {
    const result = resolveSceneMode({ env: {}, search: "" });

    expect(result).toEqual({
      sceneMode: "lightweight",
      usePhotorealistic: false,
      source: "default",
    });
  });

  test("keeps documented env defaults in lightweight mode", () => {
    const result = resolveSceneMode({
      env: {
        VITE_SCENE_MODE: "lightweight",
        VITE_ENABLE_GOOGLE_PHOTOREALISTIC: "false",
      },
      search: "",
    });

    expect(result.sceneMode).toBe("lightweight");
    expect(result.usePhotorealistic).toBe(false);
  });

  test("enables photorealistic mode through the presenter URL mode", () => {
    const result = resolveSceneMode({ env: {}, search: "?mode=demo" });

    expect(result.sceneMode).toBe("demo");
    expect(result.usePhotorealistic).toBe(true);
    expect(result.source).toBe("url:mode");
  });

  test("enables photorealistic mode through the explicit URL boolean", () => {
    const result = resolveSceneMode({ env: {}, search: "?photorealistic=true" });

    expect(result.sceneMode).toBe("demo");
    expect(result.usePhotorealistic).toBe(true);
    expect(result.source).toBe("url:photorealistic");
  });

  test("lets a URL disable photorealistic mode over an enabled env session", () => {
    const result = resolveSceneMode({
      env: { VITE_ENABLE_GOOGLE_PHOTOREALISTIC: "true" },
      search: "?photorealistic=false",
    });

    expect(result.sceneMode).toBe("lightweight");
    expect(result.usePhotorealistic).toBe(false);
  });

  test("enables photorealistic mode through env configuration", () => {
    const result = resolveSceneMode({
      env: { VITE_SCENE_MODE: "photorealistic" },
      search: "",
    });

    expect(result.sceneMode).toBe("photorealistic");
    expect(result.usePhotorealistic).toBe(true);
  });

  test("degrades invalid scene mode values to lightweight", () => {
    const result = resolveSceneMode({ env: { VITE_SCENE_MODE: "expensive" }, search: "" });

    expect(result.sceneMode).toBe("lightweight");
    expect(result.usePhotorealistic).toBe(false);
  });
});

// formatSceneModeStatus tests the exact wording used by the visible badge and
// logger so presenters get a clear mode signal.
describe("formatSceneModeStatus", () => {
  test("reports disabled photorealistic tiles for lightweight mode", () => {
    expect(formatSceneModeStatus({ sceneMode: "lightweight", photorealisticEnabled: false })).toBe(
      "Scene mode: lightweight | Google Photorealistic 3D Tiles: disabled",
    );
  });
});
