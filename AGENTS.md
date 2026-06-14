# Agent Guide

## Purpose

Build and maintain a CesiumJS click-through tour of the Philadelphia Shipyard using KML-derived shipyard locations, lightweight default scene mode, intentional photorealistic demo mode, and presentation-style overlays.

## App Root

The app root is:

```text
/home/scblum/Projects/ship_philly_tour
```

Do not create a nested child app such as `philly-shipyard-tour/`.

## Runtime Entry Points

- `index.html`: HTML shell and overlay root elements.
- `src/main.js`: app startup, validation, scene setup, tour manager initialization.
- `src/sceneMode.js`: lightweight/demo mode parsing for env variables and URL overrides.
- `src/sceneSetup.js`: Cesium viewer creation, standard `cesium-navigation-es6` compass/navigation widget setup, lightweight default scene, Google Photorealistic 3D Tiles demo loading, default-globe fallback.
- `src/shipyardLocations.js`: structured KML-derived shop and yard placemarks.
- `public/data/philly-tour.kml`: canonical browser-accessible KML source copy.
- `src/tourStops.js`: narrated tour sequence and slide-specific graphics.
- `src/arrowControlOffset.js`: proportional arrow curve offset calculation and left/right route-side control.
- `src/flowChevronLayer.js`: standalone repeated-chevron overlay that follows sampled production-flow arrow paths and can be toggled independently.
- `src/cameraUtils.js`: target-centered and absolute-pose Cesium camera helpers.
- `src/tourManager.js`: navigation, overlay updates, keyboard controls, progress dots.
- `src/calloutManager.js`: point labels, highlighted polygons, curved arrows, fallback/debug polylines.
- `src/coordinateAuthoring.js`: authoring-mode coordinate capture.
- `src/tourDataValidator.js`: tour and KML-derived location validation.
- `src/logger.js`: level-based logging and authoring diagnostics.
- `vite.config.js`: Vite base path and Cesium static asset configuration.
- `.github/workflows/ci.yml`: GitHub Actions install, test, build, browser smoke, and dead-code checks.
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

Use `.env.local` for local development secrets and `.env.production.local` for local production-build secrets. Do not commit real Cesium ion tokens.

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
