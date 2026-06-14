# CesiumJS Interactive Shipyard Tour — Coding Agent Specification

## 1. Purpose

Build a browser-based, click-to-advance interactive tour of the Philadelphia Shipyard using **CesiumJS**. The experience should feel like a PowerPoint presentation, but retain live 3D camera movement, flyovers, labels, animated overlays, and web delivery.

The final product should run in a normal browser without requiring Unreal Engine. Unreal can still be used separately for cinematic prototyping, but this project should be implemented as a standalone web application.

Development should be incremental, with the app kept runnable after each meaningful change. Earlier internal builds do not need backward compatibility; when a better data model, UI pattern, or implementation approach is needed, update the current app and documentation directly instead of preserving old behavior.

## 2. Target User Experience

The user opens a web page and sees a full-screen Cesium 3D scene. A presentation-style panel appears over the scene with a title, short explanatory text, and controls.

The interaction pattern is:

1. User opens the tour.
2. The camera starts at a wide shipyard overview.
3. User clicks **Next** or presses the right arrow / spacebar.
4. The camera smoothly flies to the next stop.
5. Text, photo cards, labels, callouts, and highlights update.
6. User can click **Back** to revisit earlier stops.
7. User can jump directly to a stop using progress dots.

The presentation should support:

- Full-screen browser presentation.
- Keyboard navigation.
- Click-to-advance controls.
- Camera flyovers between tour stops.
- Labels attached to geospatial positions.
- Directional curved arrows for callouts.
- Optional highlighted zones or polygons when a stop explicitly needs a shaded area.
- No shaded polygon rectangles under the default shop-location stops, so satellite imagery remains unobscured for presentation use.
- HTML/CSS overlay cards for photos, descriptions, charts, or MES-style status panels.
- Progress dots for current-stop status and direct navigation.
- A data-driven tour definition so the sequence can be edited without rewriting the app.

## 3. Recommended Technology Stack

Use the following stack:

- **CesiumJS** for the 3D globe, terrain, imagery, 3D Tiles, camera movement, and geospatial entities.
- **Vite** for local development and bundling.
- **Vanilla JavaScript** initially. Do not start with React unless the UI becomes complex.
- **HTML/CSS overlays** for PowerPoint-style slide panels and photo/stat cards.
- **Cesium ion** for hosted imagery, terrain, 3D Tiles, and intentionally enabled Google Photorealistic 3D Tiles demo mode.
- Optional later: Reveal.js, if a true slide-deck framework becomes useful.

Official references:

- [CesiumJS Quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/)
- [Configuring Vite or Webpack for CesiumJS](https://cesium.com/blog/2024/02/13/configuring-vite-or-webpack-for-cesiumjs/)
- [CesiumJS Camera guide](https://cesium.com/learn/cesiumjs-learn/cesiumjs-camera/)
- [CesiumJS Creating Entities guide](https://cesium.com/learn/cesiumjs-learn/cesiumjs-creating-entities/)
- [Cesium ion Access Tokens](https://cesium.com/learn/ion/cesium-ion-access-tokens/)
- [Photorealistic 3D Tiles in CesiumJS](https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/)

## 4. Development Environment Setup

### 4.1 Prerequisites

Install:

- Node.js LTS
- npm
- VS Code
- Git

Recommended VS Code extensions:

- ESLint
- Prettier
- Path Intellisense
- GitLens, optional

### 4.2 Create the project

The app must be scaffolded directly in:

```text
/home/scblum/Projects/ship_philly_tour
```

Do not create or use a nested child app directory such as:

```text
/home/scblum/Projects/ship_philly_tour/philly-shipyard-tour
```

Run the scaffold and install commands from `/home/scblum/Projects/ship_philly_tour` so `index.html`, `package.json`, `vite.config.js`, `public/`, `src/`, and `tests/` are created at the repository root.

```bash
npm create vite@latest . -- --template vanilla
npm install
npm install cesium vite-plugin-static-copy
npm install -D vitest jsdom @testing-library/dom @playwright/test knip eslint prettier
npx playwright install chromium
code .
```

### 4.3 Expected initial folder structure

```text
ship_philly_tour/
  AGENTS.md
  index.html
  package.json
  knip.json
  vite.config.js
  .env.example
  .env.local
  .env.production.local
  .gitignore
  public/
    photos/
    graphics/
    data/
  src/
    main.js
    style.css
    tourStops.js
    tourManager.js
    calloutManager.js
    cameraUtils.js
    coordinateAuthoring.js
    logger.js
    sceneSetup.js
    tourDataValidator.js
  tests/
    unit/
    e2e/
    build/
```

### 4.4 Expected package scripts

The app should expose these commands through `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "dev:demo": "VITE_SCENE_MODE=demo VITE_ENABLE_GOOGLE_PHOTOREALISTIC=true vite",
    "build": "vite build",
    "build:github": "VITE_APP_BASE_PATH=/ship_philly_tour/ vite build",
    "preview": "vite preview",
    "test": "npm run test:unit",
    "test:watch": "vitest",
    "test:unit": "vitest run --no-file-parallelism",
    "test:e2e": "playwright test --workers=1",
    "test:build": "npm run test:build:local && npm run test:build:github",
    "test:build:local": "npm run build && vitest run tests/build/local.test.js --no-file-parallelism",
    "test:build:github": "npm run build:github && vitest run tests/build/github.test.js --no-file-parallelism",
    "test:all": "npm run test:unit && npm run test:build && npm run test:e2e && npm run deadcode",
    "deadcode": "knip"
  }
}
```

Vitest runs tests inside a file sequentially by default. The `--no-file-parallelism` flag keeps test files sequential too.

### 4.5 Dead-code tooling

Use **Knip** as the dead-code detection tool because this is a JavaScript/Vite application. Add a `knip.json` configuration file at the project root and keep the `npm run deadcode` script wired to `knip`.

The Knip configuration should account for Vite entry points, browser test files, Playwright config files, and public/static assets so the tool reports useful unused files, exports, and dependencies without flagging expected framework entry points as dead code.

Dead-code cleanup requirements:

- Run `npm run deadcode` after major implementation changes and before final handoff.
- Review every Knip finding before deleting code.
- Remove confirmed unused files, exports, dependencies, and scripts.
- Do not remove code only because it is temporarily unused if a requirement in this document still depends on it.
- Report any removed dead code in the final implementation summary.

### 4.6 Logging and debug strategy

Implement `src/logger.js` as the central logging helper. Application code should use this logger instead of calling `console.log()` directly, except for unavoidable third-party diagnostics.

The logger should support these levels:

- `error` for failures that prevent part of the app from working.
- `warn` for recoverable problems such as missing optional photos, invalid authoring picks, or fallback scene behavior.
- `info` for normal lifecycle messages such as scene setup, tour data loading, and active tour stop changes.
- `debug` for detailed development traces.

Logging should be controlled by environment variables:

```text
VITE_LOG_LEVEL=info
VITE_ENABLE_AUTHORING=true
```

`VITE_LOG_LEVEL` controls the minimum emitted log level. `VITE_ENABLE_AUTHORING=true` enables verbose authoring-mode diagnostics, including coordinate capture, generated stop templates, clicked callout points, curved-arrow control points, and data-validation details. When `VITE_ENABLE_AUTHORING=false`, authoring logs and coordinate-capture UI should be disabled for production presentation builds.

### 4.7 Code commenting standards

Comments are required as part of the implementation, not as optional cleanup. Apply these standards throughout the codebase:

- Include comments for every class, method, function, and individual block of code.
- High-level comments should document the purpose of a module or behavior and include example uses where helpful.
- Comments should focus on why the code exists and how it creates a specific behavior, not merely restating what each line does.
- Comments should tie the code to functional requirements or application capabilities, such as tour navigation, Cesium scene setup, coordinate authoring, curved arrows, logging, data validation, or deployment behavior.
- Comments should clarify assumptions about execution environment and state dependencies, including Cesium viewer state, DOM element availability, environment variables, static asset paths, browser APIs, and production versus authoring mode.
- Comments on lower-level code elements should help a developer infer the higher-level features that depend on them.
- Comments should be updated when behavior changes so they remain accurate.

### 4.8 Testing stack

The project must include automated tests at three levels:

1. Unit tests with Vitest.
2. Browser smoke tests with Playwright.
3. Build and deployment tests for Vite output and GitHub Pages path behavior.

Do not attempt to deeply unit-test CesiumJS rendering internals or WebGL behavior. Mock Cesium where necessary and focus tests on this project's data, managers, UI behavior, coordinate utilities, curved-arrow generation, and deployment assumptions.

#### 4.8.1 Unit tests with Vitest

Unit tests should run without launching Cesium/WebGL. Use Vitest with `jsdom` and `@testing-library/dom` where DOM behavior needs to be tested.

Unit tests must cover:

- Tour stop schema validation.
- Required target-centered stop fields: `id`, `title`, `cameraMode`, `target.lonDeg`, `target.latDeg`, `view.headingDeg`, `view.pitchDeg`, and `view.rangeM`.
- Optional target-centered fields: `target.heightM`, `target.radiusM`, and `view.durationSec`.
- Explicit `absolutePose` stop fields: `camera.destination.lonDeg`, `camera.destination.latDeg`, `camera.destination.heightM`, `camera.orientation.headingDeg`, `camera.orientation.pitchDeg`, optional `camera.orientation.rollDeg`, and optional `camera.durationSec`.
- Valid coordinate ranges: longitude between `-180` and `180`, latitude between `-90` and `90`, positive target radius, positive view range, and positive camera duration when provided.
- Unique tour stop ids.
- KML-derived shipyard location records preserve placemark ids, names, coordinates, and optional `LookAt` camera hints.
- KML-derived shipyard location records include the expected initial placemarks from section 9.1.
- Referenced photo paths are valid static paths or are handled by the missing-asset fallback.
- Curved arrows have at least three coordinates.
- Tour navigation behavior: starts at stop `0`, `next()` advances one stop, `previous()` goes back one stop, navigation does not go below `0`, and navigation does not exceed the final stop unless explicit wraparound behavior is added.
- `goToStop(id)` or equivalent stop lookup finds the correct stop and fails gracefully for invalid ids.
- Base-path behavior: local/domain-root base path produces `/cesiumStatic`, GitHub Pages base path produces `/ship_philly_tour/cesiumStatic`, and Vite `base` and `CESIUM_BASE_URL` stay aligned.
- Scene-mode parsing: default configuration resolves to lightweight mode, `?mode=demo` or equivalent explicit config resolves to photorealistic/demo mode, and the parser can be tested without constructing a Cesium viewer.
- Camera-mode behavior: target-centered stops create a `Cesium.BoundingSphere` and `Cesium.HeadingPitchRange`, default missing `cameraMode` to `targetCentered`, and only use `camera.flyTo()` destinations for explicit `absolutePose` stops.
- Callout and arrow generation functions that convert tour data into Cesium entity configuration objects.
- Curved-arrow generation produces a sampled path, uses the expected sample count, preserves the first sampled point as the start coordinate, preserves the last sampled point as the target coordinate, uses `Cesium.PolylineArrowMaterialProperty`, and does not rely on plain polylines for arrow behavior.

#### 4.8.2 Browser smoke tests with Playwright

Browser smoke tests should verify the app loads and the presenter workflow functions at a high level. These tests should not assert low-level Cesium rendering details.

Playwright tests must cover:

- Homepage loads.
- `#cesiumContainer` exists and is visible.
- `#tourPanel` exists and is visible.
- Internal scene-mode status is logged, and the default presentation UI does not show Vite/Cesium status badges.
- Next and Back controls exist.
- Clicking Next changes the displayed slide title.
- Clicking Back changes the displayed slide title.
- Keyboard `ArrowRight` advances the tour.
- Keyboard `ArrowLeft` returns to the previous stop.
- Progress dots are visible and direct navigation works.
- Unexpected console errors fail the test.

#### 4.8.3 Build and deployment tests

Build and deployment tests must verify both the local/domain-root build and the GitHub Pages project-site build.

Required checks:

- `npm run build` succeeds.
- `npm run build:github` succeeds.
- `npm run test:build:local` verifies the local/domain-root build output.
- `npm run test:build:github` verifies the GitHub Pages project-site build output.
- `npm run test:build` runs both build/deployment checks sequentially.
- The build output includes `dist/index.html`.
- The build output includes `dist/assets/`.
- The build output includes `dist/cesiumStatic/Workers`, `dist/cesiumStatic/ThirdParty`, `dist/cesiumStatic/Assets`, and `dist/cesiumStatic/Widgets`.
- The local/domain-root build resolves Cesium static assets from `/cesiumStatic`.
- The GitHub Pages build resolves Cesium static assets from `/ship_philly_tour/cesiumStatic`.
- `CESIUM_BASE_URL` matches the deployed base path.

#### 4.8.4 Visual review tests

After real tour stops and assets are added, include optional Playwright screenshot capture for important states such as overview, drydock, block storage, and crane callout stops. These screenshots should be used as human-review artifacts rather than strict pixel-perfect tests because Cesium imagery, tiles, network timing, and GPU rendering can vary.

## 5. Cesium + Vite Configuration

Create or replace `vite.config.js` with the following:

```js
import { defineConfig, loadEnv } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appBasePath = env.VITE_APP_BASE_PATH || "/";
  const normalizedBasePath = appBasePath.endsWith("/")
    ? appBasePath
    : `${appBasePath}/`;
  const cesiumBaseUrl = `${normalizedBasePath}cesiumStatic`;

  return {
    base: normalizedBasePath,
    define: {
      CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl),
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
```

Reason: CesiumJS requires static runtime assets such as workers, widgets, assets, and third-party files to be available from the served web application. `vite-plugin-static-copy` copies those assets into `dist/cesiumStatic`. `VITE_APP_BASE_PATH` keeps Vite's `base` path and Cesium's `CESIUM_BASE_URL` aligned:

- Local/domain-root runtime URL: `/cesiumStatic`
- GitHub Pages project-site runtime URL: `/ship_philly_tour/cesiumStatic`

## 6. Environment Variables

Create committed `.env.example` with non-secret placeholder values:

```text
VITE_APP_BASE_PATH=/
VITE_SCENE_MODE=lightweight
VITE_ENABLE_GOOGLE_PHOTOREALISTIC=false
VITE_CESIUM_ION_TOKEN=
VITE_ENABLE_FLOW_CHEVRONS=true
VITE_ENABLE_AUTHORING=true
VITE_LOG_LEVEL=info
```

Create uncommitted `.env.local` for local development secrets:

```text
VITE_APP_BASE_PATH=/
VITE_SCENE_MODE=lightweight
VITE_ENABLE_GOOGLE_PHOTOREALISTIC=false
VITE_CESIUM_ION_TOKEN=replace_with_cesium_ion_token
VITE_ENABLE_FLOW_CHEVRONS=true
VITE_ENABLE_AUTHORING=true
VITE_LOG_LEVEL=info
```

Create uncommitted `.env.production.local` for production-build secrets and production defaults:

```text
VITE_SCENE_MODE=lightweight
VITE_ENABLE_GOOGLE_PHOTOREALISTIC=false
VITE_CESIUM_ION_TOKEN=replace_with_restricted_production_cesium_ion_token
VITE_ENABLE_FLOW_CHEVRONS=true
VITE_ENABLE_AUTHORING=false
VITE_LOG_LEVEL=warn
```

For GitHub Pages project-site deployment, pass the base path at build time:

```bash
VITE_APP_BASE_PATH=/ship_philly_tour/ npm run build
```

Update `.gitignore`:

```text
node_modules/
dist/
.env
.env.local
.env.*.local
```

Important: any token used in frontend JavaScript is visible to users in the browser. Do not commit `.env.local`, `.env.production.local`, or any file containing a real Cesium ion token. For public deployment, use a Cesium ion token restricted to the necessary assets and URLs.

## 7. HTML Shell

Replace `index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Philadelphia Shipyard Interactive Tour</title>
  </head>
  <body>
    <div id="cesiumContainer"></div>

    <div id="tourPanel" class="tour-panel">
      <h1 id="slideTitle">Philadelphia Shipyard Tour</h1>
      <p id="slideText">Loading tour...</p>

      <div id="photoPanel" class="photo-panel"></div>
      <div id="statsPanel" class="stats-panel"></div>

      <div class="controls">
        <button id="prevBtn" type="button">Back</button>
        <button id="nextBtn" type="button">Next</button>
      </div>
    </div>

    <div id="progressDots" class="progress-dots"></div>

    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

## 8. Styling Requirements

Create `src/style.css`:

```css
@import "cesium/Build/Cesium/Widgets/widgets.css";

html,
body,
#cesiumContainer {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  font-family: Arial, sans-serif;
}

.tour-panel {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 380px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 20px;
  background: rgba(8, 28, 55, 0.9);
  color: white;
  border-radius: 14px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.35);
  z-index: 10;
}

.slide-number {
  font-size: 0.85rem;
  opacity: 0.75;
  margin-bottom: 8px;
}

#slideTitle {
  margin: 0 0 12px 0;
  font-size: 1.4rem;
}

#slideText {
  line-height: 1.45;
}

.photo-panel img {
  width: 100%;
  margin-top: 12px;
  border-radius: 10px;
}

.stats-panel {
  margin-top: 12px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  padding: 6px 0;
}

.controls {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}

button {
  background: #1f8fff;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
}

button:hover {
  background: #4aa6ff;
}

button:focus-visible {
  outline: 3px solid white;
  outline-offset: 2px;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.progress-dots {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 10;
}

.progress-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.75);
  cursor: pointer;
}

.progress-dot.active {
  background: #1f8fff;
}

.tour-panel.is-hidden,
.progress-dots.is-hidden {
  display: none;
}
```

## 9. Tour Stop Data Model

Create `src/tourStops.js`. The tour should be driven by data, not hard-coded UI logic.

### 9.1 Initial KML foundation

Use the shipyard location placemarks from the provided KML file as the foundation for the initial build. The user-provided file is intended to be `Philly Tour.kml`; the current workspace file is named `Phillly Tour.kml`, so implementation should either normalize the filename to `Philly Tour.kml` or document the exact source filename used.

The KML source includes placemarks for the largest shops and major yard areas. These should be converted into initial `tourStops`, `callouts`, or imported data records so the first app build starts from real shipyard locations instead of only placeholder coordinates.

Initial KML placemarks:

| Placemark                 |          Longitude |           Latitude |            Height |
| ------------------------- | -----------------: | -----------------: | ----------------: |
| Steel Storage Area        | -75.19154635188589 |   39.8905216581939 | 4.125336980968635 |
| Large Panel Line          | -75.19075713256817 |   39.8900063674073 |   18.018204053712 |
| Double Bottom Line        | -75.19077244420436 |  39.88969508567276 | 21.20031016049998 |
| Web Shop                  | -75.18994035699241 |  39.89031406521822 | 21.80799734858699 |
| Bulkhead Shop             | -75.18958279608138 |  39.89043566182851 | 22.26920616734652 |
| Outfitting Shop           | -75.18926880736132 |   39.8898125382508 | 22.21015129931645 |
| Curved Panel Shop         | -75.18882476074256 | 39.890663300178794 | 28.81652363403335 |
| Section Asembly Shop      | -75.18845859064652 |  39.89044519171701 |   26.097376478271 |
| Grand Block Shop          | -75.18882979024634 |  39.88872808015807 | 9.567321138301356 |
| Paint Shop                | -75.18871980613957 |  39.88731435526774 |  33.4607997919598 |
| Grand Block Assembly Area | -75.19015505259583 |   39.8885150815882 | 3.657371597748869 |
| Building Dock             | -75.19072072770476 |  39.88720122928942 | 2.203360184659442 |
| Outfitting Dock           | -75.19217773074095 |  39.88656858703229 | 1.034634275135133 |

KML import requirements:

- Preserve each placemark id, name, point coordinate, and available `LookAt` camera data.
- Convert placemark point coordinates into Cesium-compatible longitude, latitude, and height values.
- Use placemark names as initial labels unless a later curated display name is provided.
- Anchor shop-location callout points to the rendered map surface by default. KML-derived callouts should use `height: 0` plus Cesium height references rather than fixed aerial offsets.
- Preserve source names exactly in the imported data. For example, the source KML currently says `Section Asembly Shop`; a corrected display label can be added separately if needed.
- Use KML `LookAt` data as a camera-authoring hint, but tune final Cesium camera positions manually when needed because Google Earth `LookAt` range/tilt does not map one-to-one to the desired Cesium tour camera.
- Use a default tour camera heading of `85` degrees for current stops so the presentation matches the established published shipyard-layout viewing convention. Cesium uses radians internally, but authored tour data should store heading values in degrees and convert them at camera execution time.
- Include these KML-derived locations in the initial build as selectable or sequential tour stops, location callouts, or a shop-location layer.
- Add a curated `Cutting Area` shop node even though it is not part of the initial KML source. Place it 40 yards directly north of the Web Shop and use it as the active point for the Cutting Shop tour stop.
- Preserve the raw KML coordinate for Bulkhead Shop, but use a presentation point 10 yards directly north of that source point for labels, arrows, and tour graphics.
- Preserve the raw KML coordinate for Curved Panel Shop, but use a presentation point 30 yards directly north of that source point for labels, arrows, and tour graphics.
- Preserve the raw KML coordinate for Outfitting Shop, but use a presentation point 70 yards south and 5 yards west of that source point for labels, arrows, and tour graphics.
- Keep the KML-derived data structured so additional placemarks can be added later without rewriting tour rendering logic.
- Add tests that validate imported KML-derived records have unique ids, valid coordinates, labels, and optional camera hints.

Use this graphic-data convention:

- `callouts[]` = labels and points; default point labels are surface-clamped, with `height: 0` unless an explicit elevated authoring exception is needed.
- `polygons[]` = optional highlighted shipyard zones; keep this empty in the default presentation sequence unless a shaded area is intentionally needed.
- `arrows[]` = directional curved callouts. The default production-flow route should be implemented as persistent low blue arrows that remain visible across all tour stops.
- Repeated chevrons should be implemented as a standalone overlay that samples the exact same positions as the existing curved arrows. The chevron layer should be enabled by default, should derive chevron count from sampled path length at roughly one chevron every 6 yards, should support active green wave-like emphasis, and should be toggleable without removing or rewriting the underlying arrow entities.
- Production-flow arrow endpoints should reference point-label ids rather than duplicate endpoint coordinates, so adjusting a shop point also adjusts connected arrows.
- `polylines[]` = fallback/debug lines only.

### 9.2 Camera view authoring

Default all authored tour stops to `cameraMode: "targetCentered"`. In this mode, the tour stop coordinate is the point that should appear at the center of the view, not the camera destination.

Target-centered interpretation:

- `target.lonDeg`, `target.latDeg`, and `target.heightM` define the object or yard location to center.
- `target.radiusM` defines the local area Cesium should frame around the target.
- `view.headingDeg` defines the direction around the target.
- `view.pitchDeg` defines the oblique viewing angle.
- `view.rangeM` defines the distance from the target to the camera.
- `view.durationSec` defines the flight duration.

Use Cesium's `BoundingSphere` plus `HeadingPitchRange` pattern for target-centered views:

```js
export function flyToTargetCentered(viewer, stop) {
  const target = Cesium.Cartesian3.fromDegrees(
    stop.target.lonDeg,
    stop.target.latDeg,
    stop.target.heightM ?? 0,
  );

  const boundingSphere = new Cesium.BoundingSphere(
    target,
    stop.target.radiusM ?? 25,
  );

  const offset = new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(stop.view.headingDeg),
    Cesium.Math.toRadians(stop.view.pitchDeg),
    stop.view.rangeM,
  );

  return new Promise((resolve, reject) => {
    viewer.camera.flyToBoundingSphere(boundingSphere, {
      offset,
      duration: stop.view.durationSec ?? 3,
      complete: resolve,
      cancel: () => reject(new Error("Camera flight cancelled")),
    });
  });
}
```

Keep `cameraMode: "absolutePose"` available for special cinematic cases where the exact camera location matters. Do not treat a tour stop coordinate as the camera destination unless `cameraMode` is explicitly `absolutePose`.

Absolute-pose interpretation:

```js
{
  cameraMode: "absolutePose",
  camera: {
    destination: {
      lonDeg: -75.1859,
      latDeg: 39.8901,
      heightM: 800,
    },
    orientation: {
      headingDeg: 145,
      pitchDeg: -42,
      rollDeg: 0,
    },
    durationSec: 4,
  },
}
```

```js
const DEFAULT_SHIPYARD_HEADING_DEGREES = 85;

export const tourStops = [
  {
    id: "overview",
    title: "Shipyard Overview",
    text: "A high-level view of the shipyard layout, major shop corridor, assembly areas, and dock sequence.",
    cameraMode: "targetCentered",
    target: {
      lonDeg: -75.1862,
      latDeg: 39.8902,
      heightM: 25,
      radiusM: 250,
    },
    view: {
      headingDeg: DEFAULT_SHIPYARD_HEADING_DEGREES,
      pitchDeg: -45,
      rangeM: 900,
      durationSec: 4,
    },
    photo: null,
    stats: [],
    callouts: [
      {
        id: "web-shop-label",
        type: "point-label",
        label: "Web Shop",
        lon: -75.18994,
        lat: 39.89031,
        height: 0,
      },
      {
        id: "crane-zone-label",
        type: "point-label",
        label: "Crane Zone",
        lon: -75.1871,
        lat: 39.8898,
        height: 0,
      },
    ],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "steel-storage-yard",
    title: "Steel Storage Yard",
    text: "The tour begins with incoming steel staged before it moves into cutting and panel production.",
    cameraMode: "targetCentered",
    target: {
      lonDeg: -75.19155,
      latDeg: 39.89052,
      heightM: 25,
      radiusM: 75,
    },
    view: {
      headingDeg: DEFAULT_SHIPYARD_HEADING_DEGREES,
      pitchDeg: -35,
      rangeM: 450,
      durationSec: 3,
    },
    photo: null,
    stats: [],
    callouts: [
      {
        id: "steel-storage-area-label",
        type: "point-label",
        label: "Steel Storage Area",
        lon: -75.19155,
        lat: 39.89052,
        height: 0,
      },
    ],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "cutting-shop",
    title: "Cutting Shop",
    text: "Cutting converts stored plate into prepared parts that feed the panel-production shops.",
    cameraMode: "targetCentered",
    target: {
      lonDeg: -75.18994,
      latDeg: 39.89031,
      heightM: 25,
      radiusM: 75,
    },
    view: {
      headingDeg: DEFAULT_SHIPYARD_HEADING_DEGREES,
      pitchDeg: -35,
      rangeM: 450,
      durationSec: 3,
    },
    photo: null,
    stats: [],
    callouts: [
      {
        id: "web-shop-label",
        type: "point-label",
        label: "Web Shop",
        lon: -75.18994,
        lat: 39.89031,
        height: 0,
      },
    ],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "panel-production",
    title: "Panel Production Shops",
    text: "Panel production shows the large panel, double bottom, bulkhead, and curved panel shops together.",
    cameraMode: "targetCentered",
    target: {
      lonDeg: -75.18972,
      latDeg: 39.89031,
      heightM: 25,
      radiusM: 80,
    },
    view: {
      headingDeg: DEFAULT_SHIPYARD_HEADING_DEGREES,
      pitchDeg: -38,
      rangeM: 350,
      durationSec: 3,
    },
    photos: [
      { label: "Web Shop", src: null },
      { label: "Large Panel Shop", src: "/photos/philly-large-panel.png" },
      { label: "Double Bottom Shop", src: null },
      { label: "Bulkhead Shop", src: null },
      { label: "Curved Panel Shop", src: "/photos/philly-curved-panel.png" },
    ],
    callouts: [
      {
        id: "storage-label",
        type: "point-label",
        label: "Block staging area",
        lon: -75.1881,
        lat: 39.89,
        height: 0,
      },
    ],
    polygons: [],
    arrows: [],
    polylines: [],
  },
];
```

The coordinates above are placeholders. The agent should implement a coordinate-authoring workflow so the user can click in the Cesium scene and copy camera, callout, polygon, fallback/debug polyline, and curved-arrow coordinates into `tourStops.js`. For curved arrows, the middle coordinate should usually be an elevated control point that creates a bow or arc. The last coordinate is the target object, so the arrow should point there.

## 10. Main Application Entry Point

Create `src/main.js`:

```js
import * as Cesium from "cesium";
import "./style.css";
import { tourStops } from "./tourStops.js";
import { TourManager } from "./tourManager.js";

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const viewer = new Cesium.Viewer("cesiumContainer", {
  timeline: false,
  animation: false,
  sceneModePicker: false,
  baseLayerPicker: true,
  geocoder: true,
});

viewer.scene.globe.depthTestAgainstTerrain = true;

const tourManager = new TourManager(viewer, tourStops);
tourManager.initialize();

if (import.meta.env.VITE_ENABLE_AUTHORING === "true") {
  // Development helper: click the scene and print coordinates/camera orientation.
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((event) => {
    const pickedPosition = viewer.scene.pickPosition(event.position);
    const pickRay = viewer.camera.getPickRay(event.position);
    const globePosition = pickRay
      ? viewer.scene.globe.pick(pickRay, viewer.scene)
      : undefined;
    const cartesian = Cesium.defined(pickedPosition)
      ? pickedPosition
      : globePosition;

    if (!Cesium.defined(cartesian)) return;

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const height = cartographic.height;

    console.info("Picked position and current camera:", {
      lon,
      lat,
      height,
      cameraHeading: Cesium.Math.toDegrees(viewer.camera.heading),
      cameraPitch: Cesium.Math.toDegrees(viewer.camera.pitch),
      cameraRoll: Cesium.Math.toDegrees(viewer.camera.roll),
      cameraHeight: viewer.camera.positionCartographic.height,
    });
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}
```

## 11. Tour Manager

Create `src/tourManager.js`:

```js
import * as Cesium from "cesium";
import { CalloutManager } from "./calloutManager.js";

export class TourManager {
  constructor(viewer, tourStops) {
    this.viewer = viewer;
    this.tourStops = tourStops;
    this.currentIndex = 0;
    this.calloutManager = new CalloutManager(viewer);
    this.isChromeHidden = false;

    this.tourPanel = document.getElementById("tourPanel");
    this.slideTitle = document.getElementById("slideTitle");
    this.slideText = document.getElementById("slideText");
    this.photoPanel = document.getElementById("photoPanel");
    this.statsPanel = document.getElementById("statsPanel");
    this.progressDots = document.getElementById("progressDots");
    this.nextBtn = document.getElementById("nextBtn");
    this.prevBtn = document.getElementById("prevBtn");
  }

  initialize() {
    this.createProgressDots();
    this.attachEventListeners();
    this.goToStop(0, { instant: true });
    this.updateControls();
  }

  attachEventListeners() {
    this.nextBtn.addEventListener("click", () => this.next());
    this.prevBtn.addEventListener("click", () => this.previous());

    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        this.next();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.previous();
      }
      if (event.key === "Home") {
        event.preventDefault();
        this.goToStop(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        this.goToStop(this.tourStops.length - 1);
      }
      if (event.key.toLowerCase() === "f") {
        this.toggleFullscreen();
      }
      if (event.key.toLowerCase() === "h") {
        this.togglePresentationChrome();
      }
    });
  }

  createProgressDots() {
    this.progressDots.innerHTML = "";

    this.tourStops.forEach((stop, index) => {
      const dot = document.createElement("button");
      dot.className = "progress-dot";
      dot.title = stop.title;
      dot.type = "button";
      dot.setAttribute("aria-label", `Go to stop ${index + 1}: ${stop.title}`);
      dot.addEventListener("click", () => this.goToStop(index));
      this.progressDots.appendChild(dot);
    });
  }

  updateProgressDots() {
    const dots = Array.from(
      this.progressDots.querySelectorAll(".progress-dot"),
    );
    dots.forEach((dot, index) => {
      dot.classList.toggle("active", index === this.currentIndex);
      dot.setAttribute(
        "aria-current",
        index === this.currentIndex ? "step" : "false",
      );
    });
  }

  updateControls() {
    this.prevBtn.disabled = this.currentIndex === 0;
    this.nextBtn.disabled = this.currentIndex === this.tourStops.length - 1;
  }

  next() {
    const nextIndex = Math.min(
      this.currentIndex + 1,
      this.tourStops.length - 1,
    );
    this.goToStop(nextIndex);
  }

  previous() {
    const previousIndex = Math.max(this.currentIndex - 1, 0);
    this.goToStop(previousIndex);
  }

  goToStop(index, options = {}) {
    this.currentIndex = Math.max(0, Math.min(index, this.tourStops.length - 1));
    const stop = this.tourStops[this.currentIndex];

    this.updateOverlay(stop);
    this.updateProgressDots();
    this.updateControls();
    this.calloutManager.showStopGraphics(stop);
    this.flyCamera(stop, options);
  }

  async toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }

    await document.exitFullscreen();
  }

  togglePresentationChrome() {
    this.isChromeHidden = !this.isChromeHidden;
    this.tourPanel.classList.toggle("is-hidden", this.isChromeHidden);
    this.progressDots.classList.toggle("is-hidden", this.isChromeHidden);
  }

  updateOverlay(stop) {
    this.slideTitle.textContent = stop.title;
    this.slideText.textContent = stop.text;

    this.photoPanel.innerHTML = "";
    if (stop.photo) {
      const img = document.createElement("img");
      img.src = stop.photo;
      img.alt = stop.title;
      this.photoPanel.appendChild(img);
    }

    this.statsPanel.innerHTML = "";
    for (const stat of stop.stats ?? []) {
      const row = document.createElement("div");
      row.className = "stat-row";
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = stat.label;
      value.textContent = stat.value;
      row.append(label, value);
      this.statsPanel.appendChild(row);
    }
  }

  flyCamera(stop, options = {}) {
    if (options.instant) {
      setViewForStop(this.viewer, stop);
      return;
    }

    flyToStopCamera(this.viewer, stop).catch((error) => {
      logger.debug("Camera flight did not complete.", error);
    });
  }
}
```

## 12. Callout Manager

Create `src/calloutManager.js`:

Curved arrows should be implemented as Cesium `PolylineGraphics` paths with many sampled positions. Use `Cesium.CatmullRomSpline` to interpolate smoothly through the arrow control points, `Cesium.PolylineArrowMaterialProperty` for the directional arrow material, and `arcType: Cesium.ArcType.NONE` so Cesium renders the sampled 3D curve directly instead of reinterpreting it as a geodesic arc. The last coordinate is the target object, so the arrow direction should terminate there.

The production-flow arrows should remain visible across all slides as a persistent blue route layer. Arrow start and end points should be resolved from the current point-label records by `startCalloutId` and `endCalloutId` rather than being copied into separate coordinate arrays. Keep the control-point height low so the arrows read as map-surface annotations rather than tall 3D arcs. The arrow route should run from Steel Storage Yard to Cutting Area for the Cutting Shop step, then from Cutting Area to Web Shop and the other four panel-production shops, all five panel-production shops to Section Assembly Shop, then onward through Outfitting Shop, Block Assembly Shop, Painting Shop, Grand Block Assembly Area, Building Dock, and Outfitting Dock.

Create `src/flowChevronLayer.js` as a standalone directional-flow overlay. It should render repeated small chevrons as Cesium billboard entities on the exact sampled positions generated for each curved arrow, so existing arrow layout and offset controls remain authoritative. The chevron layer should be enabled by default, support `VITE_ENABLE_FLOW_CHEVRONS=false` and a URL override such as `?chevrons=false`, use quieter blue chevrons for inactive process context, and use larger green chevrons with a subtle wave/glow effect for the currently active route arrows. Chevron count should be calculated from sampled Cesium `Cartesian3` path length in meters, using approximately 6 yards between chevrons instead of a fixed number of chevrons per arrow. Chevron rotation should be calculated from a local screen-space tangent on the sampled path and converted into Cesium billboard rotation, accounting for Cesium window coordinates using y-down screen space while billboard rotation uses a y-up plane. Turning the layer off must leave the persistent blue/green `PolylineArrowMaterialProperty` arrows visible.

Point-label callouts should use `Cesium.HeightReference.CLAMP_TO_GROUND` for both `point` and `label` graphics by default. In lightweight mode this anchors the point to the globe/terrain surface. In photorealistic mode it can clamp to Google Photorealistic 3D Tiles when the active tileset has collision enabled. Use absolute-height labels only when a stop explicitly needs an elevated marker.

Production-flow arrows that reference point-label ids must resolve their start and end heights from the same rendered surface used by the shop labels when Cesium scene height sampling is available. This keeps arrows attached to shop nodes when Google Photorealistic 3D Tiles place labels on roofs or other elevated surfaces. The arrow midpoint/control height should be calculated relative to the average sampled endpoint height, not as a fixed absolute altitude. The current presentation default should use roughly `8m` of midpoint vertical lift unless an individual route explicitly overrides it.

KML-derived shop and yard point labels plus the curated Cutting Area point should remain visible across all stops as a persistent layout layer. The Cutting Shop stop should use and activate the Cutting Area point. Only the current stop's active point-label set should be emphasized by making the point green, increasing the point size, and using bold label text. Labels that are visible only for previous/next context should remain in the standard inactive style. For the Panel Production Shops stop, the five panel-production shop labels should be active together. Persistent production-flow arrows should remain visible across all stops. Stop-specific polygons and fallback/debug polylines remain transient and should clear between stops.

```js
import * as Cesium from "cesium";

export class CalloutManager {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.baseCallouts = options.baseCallouts ?? [];
    this.pointEntities = new Map();
    this.activeEntities = [];
  }

  clear() {
    for (const entity of this.activeEntities) {
      this.viewer.entities.remove(entity);
    }

    this.activeEntities = [];
  }

  showStopGraphics(stop) {
    this.clear();
    this.ensureBasePointLabels();

    const activePointIds = new Set(stop.activeCalloutIds ?? []);
    this.updatePointLabelStates(activePointIds);

    for (const polygon of stop.polygons ?? []) {
      this.addPolygon(polygon);
    }

    for (const arrow of stop.arrows ?? []) {
      this.addCurvedArrow(arrow);
    }

    for (const polyline of stop.polylines ?? []) {
      this.addPolyline(polyline);
    }
  }

  ensureBasePointLabels() {
    // Add all shop and yard labels once so the audience always has layout context.
  }

  updatePointLabelStates(activePointIds) {
    // Active labels should use a green point, larger point size, and bold text.
    // Inactive persistent labels should return to the standard cyan/white style.
  }

  addPolygon(polygon) {
    const flatCoordinates = polygon.coordinates.flat();
    const color = Cesium.Color.fromCssColorString(polygon.color ?? "cyan");

    const entity = this.viewer.entities.add({
      id: polygon.id,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoordinates),
        material: color.withAlpha(polygon.alpha ?? 0.3),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    });

    this.activeEntities.push(entity);
  }

  addPolyline(polyline) {
    const flatCoordinates = polyline.coordinates.flat();
    const color = Cesium.Color.fromCssColorString(polyline.color ?? "cyan");

    const entity = this.viewer.entities.add({
      id: polyline.id,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(flatCoordinates),
        width: polyline.width ?? 3,
        material: color,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    this.activeEntities.push(entity);
  }

  addCurvedArrow(arrow) {
    if ((arrow.coordinates?.length ?? 0) < 3) {
      console.warn(
        `Curved arrow ${arrow.id} needs at least three control points.`,
      );
      return;
    }

    const controlPoints = arrow.coordinates.map(([lon, lat, height = 0]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat, height),
    );

    const spline = new Cesium.CatmullRomSpline({
      times: controlPoints.map((_, index) => index),
      points: controlPoints,
    });

    const maxTime = controlPoints.length - 1;
    const sampleCount = Math.max(arrow.sampleCount ?? 64, 2);
    const positions = Array.from({ length: sampleCount }, (_, index) => {
      const time = (index / (sampleCount - 1)) * maxTime;
      return spline.evaluate(time);
    });

    const color = Cesium.Color.fromCssColorString(arrow.color ?? "#53d8ff");
    const entity = this.viewer.entities.add({
      id: arrow.id,
      polyline: {
        positions,
        width: arrow.width ?? 7,
        material: new Cesium.PolylineArrowMaterialProperty(color),
        arcType: Cesium.ArcType.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    this.activeEntities.push(entity);
  }
}
```

## 13. Scene Detail Modes and Photorealistic Tile Conservation

The app must support at least two scene/detail modes. The purpose of this requirement is to conserve Cesium ion and Google Photorealistic 3D Tiles usage during normal development while preserving a high-quality mode for actual demonstrations.

### 13.1 Lightweight or standard mode

Lightweight mode is the default mode for fresh developer runs, automated tests, content editing, ordinary rehearsals, and general coding.

Requirements:

- Default mode for `npm run dev`, `npm run build`, and GitHub Pages builds unless an explicit override is supplied.
- Must not call `Cesium.createGooglePhotorealistic3DTileset()`.
- Must still allow the tour, camera moves, labels, callouts, routes, curved arrows, overlays, progress dots, coordinate authoring, and other demo logic to run.
- Must provide at least standard aerial/satellite imagery, such as Cesium's ArcGIS satellite basemap integration, or equivalent low-cost geographic context so the shipyard is visually recognizable enough for development and rehearsal.
- May use simple placeholder geometry, local assets, or other low-cost visual context in addition to the standard imagery.
- Must degrade gracefully if a feature is visually less rich than in photorealistic mode.

### 13.2 Photorealistic or demo mode

Photorealistic mode is an explicitly enabled high-detail mode for actual demo presentation, final rehearsal, or polished video capture.

Requirements:

- Must load Google Photorealistic 3D Tiles through Cesium ion only after high-detail mode has been intentionally selected.
- Must create Google Photorealistic 3D Tiles with collision enabled so surface-clamped point labels rest on the rendered 3D Tiles surface at their latitude and longitude.
- Must keep required Cesium and Google credits/attribution visible.
- Must fall back to lightweight mode if the token is missing, token permissions are insufficient, the network fails, or tile loading fails.
- Must classify Cesium ion `401` or `403` responses during Google Photorealistic 3D Tiles loading as `access-forbidden` so token permission and URL restriction problems are distinguishable from generic tile-load failures.
- Must preserve tour controls and overlays when fallback occurs.

### 13.3 Configuration and overrides

Scene mode must be configurable without code edits.

Supported environment variables:

```text
VITE_SCENE_MODE=lightweight
VITE_ENABLE_GOOGLE_PHOTOREALISTIC=false
```

Supported URL overrides:

```text
http://localhost:5173/
http://localhost:5173/?mode=demo
http://localhost:5173/?mode=photorealistic
http://localhost:5173/?photorealistic=true
http://localhost:5173/?photorealistic=false
```

The default must always be low-usage lightweight mode. `?mode=demo`, `?mode=photorealistic`, `?photorealistic=true`, `VITE_SCENE_MODE=demo`, `VITE_SCENE_MODE=photorealistic`, or `VITE_ENABLE_GOOGLE_PHOTOREALISTIC=true` can intentionally enable photorealistic mode. `?photorealistic=false` should explicitly disable photorealistic mode for the current URL.

Implement mode parsing in an isolated module such as `src/sceneMode.js` so unit tests can verify the default behavior without creating a real Cesium viewer.

Example implementation intent:

```js
const params = new URLSearchParams(window.location.search);

const sceneMode =
  params.get("mode") ?? import.meta.env.VITE_SCENE_MODE ?? "lightweight";

const usePhotorealistic =
  sceneMode === "demo" ||
  sceneMode === "photorealistic" ||
  params.get("photorealistic") === "true" ||
  import.meta.env.VITE_ENABLE_GOOGLE_PHOTOREALISTIC === "true";

if (usePhotorealistic) {
  const tileset = await Cesium.createGooglePhotorealistic3DTileset(
    { onlyUsingWithGoogleGeocoder: true },
    { enableCollision: true },
  );
  viewer.scene.primitives.add(tileset);
} else {
  // Initialize lower-usage scene context.
  // Do not create Google Photorealistic 3D Tiles here.
}
```

### 13.4 Logged scene-mode status

The app must log the active scene mode so a developer or presenter can confirm whether the app is conserving quota or running in high-detail mode.

Example status:

```text
Scene mode: lightweight | Google Photorealistic 3D Tiles: disabled
```

The default presentation UI should not show internal Vite, Cesium, build, scene-mode, or slide-count status to the audience. If a future debug overlay is added, it should be gated behind authoring/debug configuration and disabled for presentation.

### 13.5 Runtime presentation toggle

The app must include a small upper-right checkbox labeled for Google 3D or equivalent wording. It should sit above the standard `cesium-navigation-es6` compass and zoom controls without customizing the plugin controls.

Requirements:

- The checkbox must start unchecked in default lightweight mode.
- The checkbox must start checked if the app is intentionally opened in photorealistic/demo mode and the tiles load successfully.
- Checking the box must enable Google Photorealistic 3D Tiles without a code edit.
- Unchecking the box must remove or disable Google Photorealistic 3D Tiles and restore the lightweight scene context.
- The control must not replace URL/environment scene-mode configuration; it is a runtime override for presenters and developers.
- If enabling tiles fails because of a missing token, permission problem, network failure, or tile-load failure, the checkbox must return to unchecked and leave the tour usable in lightweight mode.
- If enabling tiles fails because Cesium ion returns `access-forbidden`, the checkbox title or accessible label must explain that the token needs Google Photorealistic 3D Tiles asset permission and allowed URL access.
- The control may be hidden with the existing presentation-chrome hide shortcut if the presenter wants an unobstructed screenshot or video frame.
- The checkbox is allowed in the presentation UI because it is an operator control for quota management, not an internal Vite/Cesium status badge.

### 13.6 Intended workflow

Use lightweight mode for normal development, automated tests, content edits, and most rehearsals.

Use high-detail photorealistic mode only for actual demo presentation, final rehearsal, or polished video capture.

Avoid repeated page refreshes in high-detail mode. Keep the viewer session open during a live demo when possible. Restrict the Cesium ion token to `localhost` and the deployment URL.

Implement photorealistic scene setup as part of the first working app, but keep it intentionally gated so it is never loaded by default.

## 14. Authoring Workflow for Tour Stops

The coding agent should add a development-only coordinate capture mode.

Requirements:

1. When the user clicks on the Cesium scene, log the clicked longitude, latitude, and height.
2. Also log current camera heading, pitch, roll, and camera height.
3. Add a button or keyboard shortcut to copy the current camera as a new tour stop template.
4. Output a JSON/JS object that can be pasted into `tourStops.js`.

Example console output:

```js
{
  id: "new-stop",
  title: "New Tour Stop",
  text: "Describe this stop.",
  cameraMode: "targetCentered",
  target: {
    lonDeg: -75.1866,
    latDeg: 39.8894,
    heightM: 25,
    radiusM: 50
  },
  view: {
    headingDeg: 85,
    pitchDeg: -35,
    rangeM: 450,
    durationSec: 3
  },
  photo: null,
  stats: [],
  callouts: [],
  polygons: [],
  arrows: [],
  polylines: []
}
```

This is important because manually guessing camera coordinates is inefficient.

## 15. Presentation Controls

Implement the following controls:

- Next button.
- Back button.
- Right arrow = next.
- Spacebar = next.
- Left arrow = previous.
- Progress dots for direct navigation.
- `Home` key = first stop.
- `End` key = final stop.
- `F` key = toggle browser fullscreen.
- `H` key = hide/show overlay UI for unobstructed screenshots.
- Disabled or visually inactive Back/Next state when the user is already at the first or final stop.
- Accessible labels for icon-only or dot-style controls.

## 16. Asset Organization

Use `public/` for assets that should be served statically by Vite.

Recommended:

```text
public/
  photos/
    drydock-example.jpg
    block-storage-example.jpg
    crane-example.jpg
  graphics/
    shipyard-process-diagram.svg
    production-flow.svg
    crane-status.png
  data/
    philly-tour.kml
    tour-stops.json
```

Notes:

- Photos referenced as `/photos/example.jpg` will resolve from the `public/photos` folder.
- The KML source should be copied or normalized into `public/data/philly-tour.kml` for browser-accessible data loading if the app loads it at runtime.
- Tour stops may start in `src/tourStops.js`, but the app should be structured so the tour can move to `public/data/tour-stops.json` without rewriting rendering, camera, or control logic.
- Missing photos should render a deliberate fallback state instead of producing broken image UI.

## 17. Initial Working Build

The first working version should include:

1. Vite project running locally with `npm run dev`.
2. Cesium viewer fills the browser window.
3. Cesium ion token loaded from uncommitted `.env.local` during development.
4. Lightweight scene mode runs by default and does not call `Cesium.createGooglePhotorealistic3DTileset()`.
5. Lightweight scene mode shows standard aerial/satellite imagery or equivalent low-cost geographic context.
6. Google Photorealistic 3D Tiles load only when demo/photorealistic mode is explicitly selected and token permissions plus network access allow.
7. Lightweight fallback works when photorealistic tiles are disabled, unavailable, or fail to load.
8. KML-derived shop and yard placemarks from `Philly Tour.kml` / `public/data/philly-tour.kml` are used as the foundation for the initial tour data.
9. Eleven audience-facing tour stops in this order:
   - Shipyard Overview.
   - Steel Storage Yard.
   - Cutting Shop.
   - Panel Production Shops.
   - Section Assembly Shop.
   - Outfitting Shop.
   - Block Assembly Shop.
   - Painting Shop.
   - Grand Block Assembly Area.
   - Building Dock.
   - Outfitting Dock.
10. Next/back controls.
11. Keyboard controls.
12. Camera flyover transitions.
13. Target-centered camera mode is the default for authored tour stops.
14. Progress dots that show the active stop and allow direct navigation.
15. HTML overlay panel with title, text, optional single photo, and optional multi-photo grid.
16. Logged active scene-mode status without audience-facing internal status badges.
17. Fullscreen toggle and hide/show overlay shortcut for presentation use.
18. Home/End keyboard navigation.
19. At least one label/callout entity.
20. KML-derived and curated shop and yard point labels remain visible across all tour stops.
21. Only the current stop's active point-label set is green, larger, and bold while previous/next context labels stay in the standard style.
22. Default shop label points are surface-clamped instead of authored at fixed aerial heights.
23. Default presentation stops do not render shaded polygon rectangles under shop locations.
24. Persistent low blue production-flow arrows using point-label id endpoints.
25. Production-flow arrows include Cutting Area fan-out to Web Shop and the other four panel-production shops, plus convergence from all five panel-production shops to Section Assembly Shop.
26. Production-flow arrow curve offsets are calculated proportionally from the distance between the start and end shop points, with `controlCurve.side` specifying `"left"` or `"right"` relative to travel from arrow tail/start to arrow head/end.
27. Congested panel-production and Section Assembly arrows may use a reduced `controlCurve.ratio` to cut the offset in half while preserving their original bend side.
28. Standalone repeated-chevron flow overlay that follows the exact sampled curved-arrow paths and can be disabled without hiding the underlying arrows.
29. Cutting Shop is a tour stop that uses the curated Cutting Area point placed 40 yards directly north of Web Shop.
30. Coordinate capture helper in the console.
31. Graceful placeholder or fallback handling for missing photos.
32. `.env.example` documenting required and optional environment variables.
33. `src/logger.js` with level-based logging and authoring-mode diagnostics gated by `VITE_ENABLE_AUTHORING`.
34. Unit, browser smoke, and build/deployment test commands wired into `package.json`.
35. Knip dead-code detection configured through `knip.json` and wired to `npm run deadcode`.
36. Standard Cesium compass/navigation widget initialized through `cesium-navigation-es6` with the plugin defaults for compass, zoom controls, distance legend, and compass outer ring.
37. Upper-right runtime checkbox that enables/disables Google Photorealistic 3D Tiles without changing code.

## 18. Acceptance Criteria

The implementation is acceptable when:

- `npm install` and `npm run dev` work from a clean clone.
- The app opens in a browser without console errors.
- Missing optional assets show an intentional fallback state and log a useful warning.
- The Cesium scene loads.
- The Cesium viewer displays the standard `cesium-navigation-es6` compass/navigation widget as a visual north and rotation reference.
- A fresh developer run uses low-usage lightweight mode by default.
- Lightweight mode shows standard aerial/satellite imagery or equivalent low-cost geographic context.
- Google Photorealistic 3D Tiles are not loaded unless explicitly enabled.
- `?mode=demo`, `?mode=photorealistic`, `?photorealistic=true`, or equivalent environment configuration enables high-detail mode.
- The upper-right Google 3D checkbox is visible above the compass/zoom tools, starts unchecked in lightweight mode, and can enable high-detail mode at runtime.
- Unchecking the Google 3D checkbox returns the app to lightweight scene context without breaking the active tour state.
- If runtime photorealistic enabling fails, the Google 3D checkbox rolls back to unchecked and the app remains usable.
- The active scene mode is logged without showing internal scene/build status in the presentation UI by default.
- Successful photorealistic tile loading uses Google Photorealistic 3D Tiles as the high-detail demo scene context.
- Photorealistic tile failure falls back to the lightweight Cesium scene, logs a warning through `src/logger.js`, and leaves tour controls usable.
- The KML-derived shop and yard locations are present in the initial tour data, callout layer, or shop-location layer.
- KML-derived records preserve source placemark ids, names, coordinates, and available `LookAt` camera hints.
- KML-derived and curated shop and yard point labels remain visible when navigating between stops.
- The current stop's active point-label set is visually emphasized with green markers, larger point size, and bold label text.
- Visible previous/next context point labels remain in the standard inactive style.
- Low blue production-flow arrows remain visible when navigating between stops.
- Production-flow arrow endpoints resolve from shop point-label records instead of duplicated coordinates.
- Production-flow arrow endpoint heights resample the rendered terrain or 3D Tiles surface so arrows visually meet clamped shop point labels in lightweight and photorealistic modes.
- Production-flow arrow curve offsets scale proportionally with the current distance between endpoint point-label records.
- Congested production-flow arrows can use reduced proportional curve ratios without changing their authored left/right bend side.
- Production-flow arrow curve direction is authored with a left/right side argument relative to the arrow route direction.
- Production-flow arrows follow the slide sequence and include the Cutting Area fan-out to the five panel-production shops plus five-shop convergence into Section Assembly Shop.
- Repeated chevrons follow the same sampled curved-arrow paths, are spaced by sampled real path length at roughly one chevron every 6 yards, can be disabled with configuration, and active route chevrons use green wave-like emphasis.
- The Cutting Shop stop activates the curated Cutting Area point label.
- Shop-location point labels anchor to the map surface in lightweight mode and clamp to the rendered 3D Tiles surface in photorealistic mode when tiles load.
- Photorealistic 3D Tiles are created with collision enabled so Cesium height references can resolve surface-clamped labels against the tile geometry.
- The first tour stop appears automatically.
- The tour sequence follows the specified eleven-stop production-flow order.
- The overview stop does not show KML source or imported-location count rows.
- The panel-production stop shows five shop image slots for Web Shop, Large Panel Shop, Double Bottom Shop, Bulkhead Shop, and Curved Panel Shop.
- Clicking **Next** changes the text and flies the camera to the next stop.
- Clicking **Back** returns to the previous stop.
- Authored tour stops use `cameraMode: "targetCentered"` by default and keep `target` centered with `HeadingPitchRange`.
- `cameraMode: "absolutePose"` remains available only for explicit cinematic camera-location shots.
- Keyboard navigation works.
- Current stop progress is visible through progress dots.
- Clicking a progress dot jumps directly to that stop.
- `Home`, `End`, `F`, and `H` keyboard controls work.
- Back and Next controls communicate disabled/inactive state at the tour boundaries.
- Callouts clear and update correctly between stops.
- Polygon, curved-arrow, and fallback/debug polyline graphics do not accumulate incorrectly.
- Tour stop data can be edited in one place.
- Tour stop data is validated enough to catch missing ids, missing target/view data, malformed camera-mode data, duplicate ids, malformed coordinates, and curved arrows with fewer than three control points.
- Coordinate capture can output a usable stop template and has a fallback when `pickPosition()` returns undefined.
- Development-only authoring tools are gated so they can be disabled for production builds.
- `.env.local`, `.env.production.local`, and other local secret env files are not committed to Git.
- `.env.example` is committed and documents token and scene-mode flags.
- The app can be built with `npm run build`.
- The app can be built for GitHub Pages project-site deployment with `npm run build:github`.
- The app can be previewed with `npm run preview`.
- Unit tests run successfully.
- Browser smoke tests run sequentially with Playwright and verify the main presentation flow.
- Build/deployment tests verify local/domain-root and GitHub Pages builds.
- `npm run test:all` runs unit tests, build/deployment tests, browser smoke tests, and dead-code detection.
- The build output includes `dist/index.html`, `dist/assets/`, `dist/cesiumStatic/Workers`, `dist/cesiumStatic/ThirdParty`, `dist/cesiumStatic/Assets`, and `dist/cesiumStatic/Widgets`.
- Dead-code detection runs through Knip with `npm run deadcode`, and any removed code is reported.
- Runtime diagnostics use `src/logger.js` instead of scattered direct `console.log()` calls.
- `VITE_LOG_LEVEL` controls emitted log detail.
- `VITE_ENABLE_AUTHORING=true` enables coordinate and authoring diagnostics, and `VITE_ENABLE_AUTHORING=false` disables authoring UI/logs for production presentation builds.
- Code comments follow the code commenting standards in section 4.7.
- `AGENTS.md` exists and documents the current important project entry points for future coding agents.

## 19. Build and Preview

Run development server:

```bash
npm run dev
```

Build static site:

```bash
npm run build
```

Build static site for GitHub Pages project deployment:

```bash
npm run build:github
```

Preview production build:

```bash
npm run preview
```

Run unit tests:

```bash
npm run test:unit
```

Run browser smoke tests:

```bash
npm run test:e2e
```

Run build/deployment tests:

```bash
npm run test:build
```

Run build/deployment tests individually:

```bash
npm run test:build:local
npm run test:build:github
```

Run the full verification suite:

```bash
npm run test:all
```

Run dead-code detection:

```bash
npm run deadcode
```

The final `dist/` folder should be deployable as a static website.

## 20. Deployment Options

Possible deployment targets:

- GitHub Pages project site
- Netlify
- Vercel
- Internal lab web server
- Local machine running `npm run preview`

For GitHub Pages project-site deployment:

- Build with `npm run build:github`, which runs `VITE_APP_BASE_PATH=/ship_philly_tour/ vite build`.
- Vite should emit app asset URLs under `/ship_philly_tour/`.
- Cesium static files should still be copied into `dist/cesiumStatic`.
- Runtime Cesium asset URL should be `/ship_philly_tour/cesiumStatic`.
- Do not commit Cesium ion tokens; use `.env.production.local` for local production builds or deployment-provider secrets for automated builds.

For public deployment:

- Restrict the Cesium ion token by allowed domain if possible.
- Restrict the token to the required assets and permissions.
- Avoid embedding private or sensitive imagery.

## 21. Required Final App Capabilities

The following capabilities are part of the intended final application. They can be added incrementally, but they should be treated as requirements rather than separate product versions. The app should remain runnable as each capability is added, and backward compatibility with earlier internal builds is not required.

### 21.1 Richer slide content

- Multiple photos per stop.
- Collapsible photo cards.
- Small process diagrams.
- MES-style stats panels.
- Gantt chart or progress bar overlays using HTML/CSS or SVG.
- Structured slide content that can render text, photos, stats, diagrams, and status panels without custom code for every stop.

### 21.2 Animated overlays

- CSS transitions for panel fade-in/fade-out.
- Animated directional curved arrows.
- Delayed label reveals after camera flight completes.
- Pause camera movement before showing callouts.
- A clear timing model for whether overlays update before, during, or after camera movement.

### 21.3 Better authoring

- Save current camera as a tour stop.
- Save clicked points as callouts.
- Export the current tour JSON.
- Load tour stops from `public/data/tour-stops.json`.
- Validate authored data before rendering it.
- Provide copy-ready output for cameras, labels, polygons, curved arrows, and fallback/debug polylines.

### 21.4 Presentation and autoplay mode

- Add an autoplay button.
- Each stop waits a configured number of seconds.
- User can pause autoplay and resume manual mode.
- Add a linear presentation mode suitable for live narration or screen recording.
- Preserve manual navigation at all times so the presenter can recover from timing changes.

### 21.5 Backup movie mode

- Add a route or mode for linear autoplay.
- Use browser screen capture or external capture to create a backup MP4.
- Keep the web app as the primary interactive deliverable.

### 21.6 Accessibility and responsive behavior

- Provide visible focus states for all controls.
- Provide keyboard-only operation for the full tour.
- Respect reduced-motion preferences by shortening or disabling camera and overlay animations when requested.
- Ensure the overlay, controls, and progress dots fit on common classroom projector, laptop, tablet, and phone viewports.
- Keep labels, callouts, and overlay content readable against varied map imagery.

### 21.7 Logging, testing, and dead-code removal

- Follow the code commenting standards in section 4.7 for every class, method, function, and individual block of code.
- Implement `src/logger.js` with multiple levels, such as error, warn, info, and debug.
- Gate verbose authoring and coordinate-capture logs behind `VITE_ENABLE_AUTHORING=true`.
- Keep detailed authoring/debug logs separate from normal presentation logs so repeated coordinate or asset issues are easier to diagnose.
- Add unit tests for tour navigation, data validation, coordinate formatting, curved-arrow sampling, and callout lifecycle behavior.
- Add Playwright browser smoke tests for initial load, next/back navigation, progress-dot navigation, keyboard navigation, fullscreen/overlay shortcuts where browser automation allows, and missing-asset fallback.
- Add build/deployment tests that verify local/domain-root output, GitHub Pages output, Cesium static asset directories, and base-path alignment.
- Run tests sequentially so failures map clearly to the application capability being checked.
- Do not change tests merely to make them pass; fix the application behavior when tests expose a real defect.
- Add a `knip.json` configuration and Knip-based dead-code check, then remove unused code as part of regular testing and cleanup.

## 22. Possible Desktop Packaging

If a browser-only deployment is not desired, wrap the same web app in:

- Electron, or
- Tauri.

This would produce a desktop application while still using CesiumJS internally.

## 23. Possible Later Integration with Unreal

Do not try to directly export Unreal Blueprints or Sequencer into CesiumJS. Instead, if Unreal is used, use it as a design/prototyping tool:

- Prototype camera paths in Unreal/Cesium for Unreal.
- Export or manually record key viewpoints.
- Recreate the final tour stops in CesiumJS.
- Use Unreal only for optional pre-rendered cinematic clips if desired.

The production interactive tour should remain web-native.

## 24. Troubleshooting Notes

### Cesium scene is blank

Check:

- `.env.local` or `.env.production.local` has a valid `VITE_CESIUM_ION_TOKEN`.
- `Cesium.Ion.defaultAccessToken` is set before creating ion assets.
- Browser console does not show asset permission errors.
- Vite config is copying Cesium static folders.
- `VITE_APP_BASE_PATH` is correct for the deployment target.
- `CESIUM_BASE_URL` matches the served Cesium static URL: `/cesiumStatic` for local/domain-root deployments or `/ship_philly_tour/cesiumStatic` for GitHub Pages project-site deployments.

### Widgets or workers fail to load

Check:

- `vite.config.js` copies `Workers`, `ThirdParty`, `Assets`, and `Widgets`.
- CSS imports `cesium/Build/Cesium/Widgets/widgets.css`.
- Browser network tab shows `cesiumStatic` files being served from the expected base path.

### Camera flies underground or clips oddly

Check:

- `view.rangeM` is large enough for the target radius and pitch.
- `target.heightM` is not below the visible terrain/building context.
- `view.pitchDeg` is not too steep near terrain.
- Test a larger `view.rangeM` first.
- Use `viewBoundingSphere()` for the initial target-centered stop and `flyToBoundingSphere()` for transitions.
- Use `cameraMode: "absolutePose"` only when an exact camera destination is required.

### Labels disappear behind terrain or buildings

Use:

```js
disableDepthTestDistance: Number.POSITIVE_INFINITY;
```

for point and label graphics where appropriate.

### Click coordinate capture returns undefined

`viewer.scene.pickPosition()` depends on scene depth support and where the user clicks. Fall back to globe picking if necessary.

## 25. Agent Development Plan

The coding agent should proceed in this order:

1. Create Vite + CesiumJS project in the repository root.
2. Add Cesium static asset config.
3. Add `.env.local` and `.env.production.local` token support with committed `.env.example`.
4. Implement full-screen Cesium viewer.
5. Implement scene-mode parsing with lightweight mode as the default and URL/env overrides for demo mode.
6. Implement Google Photorealistic 3D Tiles setup only inside explicitly enabled demo mode.
7. Implement lightweight fallback for disabled or failed photorealistic tile loading.
8. Normalize or copy the provided KML source into `public/data/philly-tour.kml`.
9. Convert KML placemarks into initial shop and yard location data.
10. Implement presentation tour data using the KML-derived locations as the foundation.
11. Add tour data and KML-derived location validation.
12. Implement target-centered camera fly-to behavior with explicit absolute-pose support.
13. Implement overlay panel.
14. Implement next/back, keyboard navigation, Home/End, fullscreen, and hide/show overlay controls.
15. Implement progress dots.
16. Implement callout manager for labels, highlighted polygons, curved directional arrows, and fallback/debug polylines.
17. Implement coordinate capture helper behind a development flag.
18. Add placeholder photos and graceful missing-image handling.
19. Add logger with normal and verbose authoring/debug output levels.
20. Add unit tests, Playwright browser smoke tests, and build/deployment tests that run sequentially.
21. Add Knip dead-code detection.
22. Test `npm run dev`, `npm run dev:demo`, `npm run build`, `npm run build:github`, `npm run preview`, `npm run test:unit`, `npm run test:e2e`, `npm run test:build`, `npm run deadcode`, and `npm run test:all`.
23. Write a short `README.md` explaining setup, token configuration, scene modes, authoring, testing, and deployment.
24. Write and maintain `AGENTS.md` with important entry points and working guidance for future coding agents.

## 26. README Requirements

The agent should produce a `README.md` containing:

- Project purpose.
- Required software.
- Installation commands.
- How to create `.env.local` and `.env.production.local`.
- How to set `VITE_APP_BASE_PATH` for local/domain-root builds and GitHub Pages project-site builds.
- How lightweight mode and photorealistic demo mode work.
- How to enable demo mode with `?mode=demo`, `?photorealistic=true`, or `npm run dev:demo`.
- Guidance to avoid repeated refreshes in photorealistic mode and restrict the Cesium ion token to localhost and the deployment URL.
- How to run locally.
- How to edit tour stops.
- How target-centered camera mode works and when to use absolute-pose camera mode.
- How `Philly Tour.kml` / `public/data/philly-tour.kml` seeds the initial shop and yard locations.
- How to add more KML placemarks or convert them into tour stops.
- How to capture coordinates.
- How to build for local/domain-root deployment and GitHub Pages project-site deployment.
- How to run the three-level testing stack: unit tests, Playwright browser smoke tests, and build/deployment tests.
- How to run the full verification suite with `npm run test:all`.
- How to run dead-code detection.
- How logging levels and authoring mode work.
- Troubleshooting section.

## 27. AGENTS.md Requirements

The implementation must include an `AGENTS.md` file at the repository root. This file is for future coding agents working in the repo, so it should be concise, current, and oriented around where to make changes safely.

`AGENTS.md` should include:

- Project purpose in one or two sentences.
- Required app root: `/home/scblum/Projects/ship_philly_tour`.
- The warning not to create a nested `philly-shipyard-tour/` child app.
- Important runtime entry points:
  - `index.html` for the HTML shell.
  - `src/main.js` for app startup.
  - `src/sceneMode.js` for lightweight/demo mode parsing.
  - `src/sceneSetup.js` for Cesium viewer setup, lightweight default scene, Google Photorealistic 3D Tiles demo loading, and fallback behavior.
  - `src/tourStops.js` or `public/data/tour-stops.json` for tour data.
  - `src/flowChevronLayer.js` for the standalone repeated-chevron overlay on production-flow arrow paths.
  - `src/cameraUtils.js` for target-centered and absolute-pose Cesium camera helpers.
  - `public/data/philly-tour.kml` for the initial KML-derived shipyard shop and yard placemarks.
  - `src/tourManager.js` for navigation, overlay updates, keyboard controls, and progress dots.
  - `src/calloutManager.js` for labels, highlighted polygons, curved arrows, and fallback/debug polylines.
  - `src/coordinateAuthoring.js` for authoring-mode coordinate capture.
  - `src/tourDataValidator.js` for schema and coordinate validation.
  - `src/logger.js` for logging and authoring diagnostics.
  - `vite.config.js` for Vite base path and Cesium static asset configuration.
- Important test entry points:
  - `tests/unit/` for Vitest unit tests.
  - `tests/e2e/` for Playwright browser smoke tests.
  - `tests/build/` for build/deployment tests.
- Important commands:
  - `npm run dev`
  - `npm run dev:demo`
  - `npm run build`
  - `npm run build:github`
  - `npm run preview`
  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run test:build`
  - `npm run deadcode`
  - `npm run test:all`
- Environment guidance for `.env.local`, `.env.production.local`, `VITE_APP_BASE_PATH`, `VITE_SCENE_MODE`, `VITE_ENABLE_GOOGLE_PHOTOREALISTIC`, `VITE_CESIUM_ION_TOKEN`, `VITE_ENABLE_FLOW_CHEVRONS`, `VITE_ENABLE_AUTHORING`, and `VITE_LOG_LEVEL`.
- Reminder to run tests after major changes and to run Knip before final handoff.
- Reminder to update `AGENTS.md` whenever important files, commands, or architectural entry points are added, renamed, or removed.

## 28. Final Desired Outcome

The final result should be a codebase that allows the user to build a Philadelphia Shipyard tour that behaves like a slide deck but is rendered live in CesiumJS:

```text
Click Next
→ camera flies to the next shipyard location
→ labels and highlights update
→ photo/stat panel changes
→ user explains the stop
→ click Next again
```

This should be suitable for classroom use, project briefings, shipyard process explanation, and later integration with MES-style visual overlays.
