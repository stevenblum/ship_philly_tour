# Agent Guide

## Purpose

Build and maintain a CesiumJS click-through tour of the Philadelphia Shipyard using KML-derived shipyard locations, default Google Photorealistic 3D Tiles, optional lightweight satellite mode, and presentation-style overlays.

## App Root

The app root is:

```text
/home/scblum/Projects/ship_philly_tour
```

Do not create a nested child app such as `philly-shipyard-tour/`.

## Runtime Entry Points

- `index.html`: HTML shell and overlay root elements.
- `src/main.js`: app startup, validation, scene setup, tour manager initialization.
- `src/cameraViewClipboard.js`: upper-right camera-copy authoring button and clipboard payload generation.
- `src/sceneMode.js`: photorealistic/lightweight mode parsing for env variables and URL overrides.
- `src/sceneSetup.js`: Cesium viewer creation, standard `cesium-navigation-es6` compass/navigation widget setup, default Google Photorealistic 3D Tiles loading, lightweight satellite fallback.
- `src/photorealisticToggle.js`: upper-right presentation checkbox for enabling/disabling Google Photorealistic 3D Tiles at runtime.
- `src/photoLightbox.js`: reusable full-screen image expansion overlay for tour photos.
- `src/publicAssetUrl.js`: base-path-aware public asset URL helper for photos, layout images, and GitHub Pages project-site deployment.
- `src/shipyardLocations.js`: structured KML-derived shop and yard placemarks.
- `public/data/philly-tour.kml`: canonical browser-accessible KML source copy.
- `src/tourStops.js`: narrated tour sequence and slide-specific graphics.
- `src/shipyardLayoutOverlay.js`: slide-0 georeferenced PNG layout overlay drawn above the live Cesium scene, and overhead layout camera.
- `src/shipyardGisLayer.js`: final-slide GeoJSON overlay for manufacturing equipment, storage areas, shop boundaries, process edges, and roads.
- `src/wipFlightController.js`: hidden WIP Tour camera fly-through using generated KML route data.
- `src/arrowControlOffset.js`: proportional arrow curve offset calculation and left/right route-side control.
- `src/flowChevronLayer.js`: standalone repeated-chevron overlay that follows sampled production-flow arrow paths and can be toggled independently.
- `src/visualScale.js`: shared presentation scale for shop labels, markers, arrows, chevrons, and MES graph objects.
- `src/cameraUtils.js`: target-centered and absolute-pose Cesium camera helpers.
- `src/tourManager.js`: navigation, overlay updates, keyboard controls, progress dots.
- `src/calloutManager.js`: point labels, highlighted polygons, curved arrows, fallback/debug polylines.
- `src/coordinateAuthoring.js`: authoring-mode coordinate capture.
- `src/tourDataValidator.js`: tour and KML-derived location validation.
- `src/logger.js`: level-based logging and authoring diagnostics.
- `scripts/convertShipyardGpkg.mjs`: repeatable GeoPackage-to-GeoJSON/style/manifest conversion for `Philly_Shipyard.gpkg`.
- `scripts/convertShipyardLayoutKml.mjs`: repeatable `WIP_Tour.kml` anchor-to-layout-registration conversion for slide 0.
- `scripts/convertWipTourKml.mjs`: repeatable `WIP_Tour.kml` LineString-to-JSON conversion that ignores old shop placemarks.
- `public/data/shipyard-layout-registration.json`: generated registration for `public/photos/philly-shipyard-layout.png`.
- `public/data/shipyard-gis/`: generated static GeoJSON, style, and manifest assets used by the final GIS overlay slide.
- `public/data/wip-tour-path.json`: generated hidden camera route for the WIP Flight slide.
- `vite.config.js`: Vite base path and Cesium static asset configuration.
- `.github/workflows/ci.yml`: GitHub Actions install, test, build, browser smoke, and dead-code checks.
- `.github/workflows/pages.yml`: GitHub Actions build and deploy path for GitHub Pages.
- `.gitignore`: generated output, local secrets, dependency folders, and local staging artifacts excluded from commits.
- `.gitattributes`: line-ending and binary asset handling for Git.

## Test Entry Points

- `tests/unit/`: Vitest unit tests.
- `tests/e2e/`: Playwright browser smoke tests.
- `tests/build/`: local and GitHub Pages build/deployment tests.

## Commands

```bash
npm run dev
npm run dev:demo
npm run data:layout
npm run data:shipyard
npm run data:wip-tour
npm run build
npm run build:github
npm run preview
npm run test:unit
npm run test:e2e
npm run test:build
npm run deadcode
npm run test:all
```

## Environment

Use `.env.local` for local development secrets and `.env.production.local` for local production-build secrets. Do not add new committed secrets unless the user explicitly accepts that tradeoff.

The current GitHub Pages path also uses a committed `.env.production` file so
GitHub Actions can build the static site without a repository secret. Restrict
the embedded Cesium ion token to localhost and the Pages deployment URL.
If Google 3D loads only after changing Cesium ion **Allowed URLs** to **All
URLs**, the token restrictions were blocking the app. For deployment, prefer
explicit allowed URLs for localhost, `127.0.0.1`, and the GitHub Pages site.

Important variables:

- `VITE_APP_BASE_PATH`
- `VITE_SCENE_MODE`
- `VITE_ENABLE_GOOGLE_PHOTOREALISTIC`
- `VITE_CESIUM_ION_TOKEN`
- `VITE_ENABLE_FLOW_CHEVRONS`
- `VITE_ENABLE_AUTHORING`
- `VITE_LOG_LEVEL`

## Working Rules

Run relevant tests after major changes. Run `npm run deadcode` before final handoff. Update this file whenever important files, commands, or architecture entry points are added, renamed, or removed.
