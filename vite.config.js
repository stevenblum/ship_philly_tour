import { defineConfig, loadEnv } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { getCesiumBaseUrl, normalizeBasePath } from "./src/basePath.js";

const cesiumSource = "node_modules/cesium/Build/Cesium";

// Vite needs to know both the app base URL and Cesium's worker/static asset URL
// before bundling so local, domain-root, and GitHub Pages builds resolve assets.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const normalizedBasePath = normalizeBasePath(env.VITE_APP_BASE_PATH || "/");

  return {
    base: normalizedBasePath,
    define: {
      CESIUM_BASE_URL: JSON.stringify(getCesiumBaseUrl(normalizedBasePath)),
    },
    plugins: [
      viteStaticCopy({
        targets: [
          { src: `${cesiumSource}/Workers`, dest: "cesiumStatic" },
          { src: `${cesiumSource}/ThirdParty`, dest: "cesiumStatic" },
          { src: `${cesiumSource}/Assets`, dest: "cesiumStatic" },
          { src: `${cesiumSource}/Widgets`, dest: "cesiumStatic" },
        ],
      }),
    ],
  };
});
