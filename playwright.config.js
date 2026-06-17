import { defineConfig } from "@playwright/test";

// Playwright runs against the Vite dev server so the smoke tests exercise the
// same HTML, CSS, module graph, and Cesium static asset handling used locally.
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "VITE_ENABLE_GOOGLE_PHOTOREALISTIC=false npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  workers: 1,
});
