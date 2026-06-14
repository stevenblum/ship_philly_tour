# Philadelphia Shipyard Cesium Tour

Browser-based CesiumJS tour of the Philadelphia Shipyard. The app starts in a low-usage lightweight Cesium scene with standard aerial/satellite imagery by default, supports an intentional Google Photorealistic 3D Tiles demo mode, and uses KML-derived shop and yard placemarks as the tour foundation.

## Setup

Install dependencies from the repository root:

```bash
npm install
npx playwright install chromium
```

Create `.env.local` for local development:

```text
VITE_APP_BASE_PATH=/
VITE_SCENE_MODE=lightweight
VITE_ENABLE_GOOGLE_PHOTOREALISTIC=false
VITE_CESIUM_ION_TOKEN=replace_with_cesium_ion_token
VITE_ENABLE_FLOW_CHEVRONS=true
VITE_ENABLE_AUTHORING=true
VITE_LOG_LEVEL=info
```

Create `.env.production.local` for production builds with a restricted token:

```text
VITE_SCENE_MODE=lightweight
VITE_ENABLE_GOOGLE_PHOTOREALISTIC=false
VITE_CESIUM_ION_TOKEN=replace_with_restricted_production_cesium_ion_token
VITE_ENABLE_FLOW_CHEVRONS=true
VITE_ENABLE_AUTHORING=false
VITE_LOG_LEVEL=warn
```

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

`build:github` sets `VITE_APP_BASE_PATH=/ship_philly_tour/` so Vite assets and Cesium static files resolve correctly on a GitHub Pages project site.

The Cesium ion token is read by Vite at build time from ignored local env files. For GitHub Actions-based Pages deployment, configure `VITE_CESIUM_ION_TOKEN` as a repository secret or build environment variable before running `npm run build:github`.

## Scene Modes

Use lightweight mode for normal development, tests, content editing, and most rehearsals. This mode should show standard aerial/satellite imagery, currently through Cesium's ArcGIS satellite basemap integration, but it should not load Google Photorealistic 3D Tiles:

```text
http://localhost:5173/
```

Use photorealistic demo mode only for actual presentations, final rehearsal, or polished video capture:

```text
http://localhost:5173/?mode=demo
http://localhost:5173/?photorealistic=true
```

`npm run dev` starts in lightweight mode by default. `npm run dev:demo` starts a demo-mode dev server, but the URL override is usually clearer for one-off checks.

Avoid repeated page refreshes in photorealistic mode. Keep the viewer session open during live demos when possible, and restrict the Cesium ion token to `localhost` plus the GitHub Pages deployment URL.

Scene mode is logged for developer confirmation, but the default presentation UI does not show internal Vite/Cesium status badges to the audience.

## Navigation Widget

The Cesium viewer initializes `cesium-navigation-es6` with its standard compass, zoom controls, distance legend, and compass outer ring. This provides a visual north/rotation reference without adding a custom compass, custom HUD, or camera-debug panel.

## Tour Data

The original KML source is preserved as `Phillly Tour.kml` and normalized for app use at `public/data/philly-tour.kml`. The initial structured data lives in `src/shipyardLocations.js`, and the narrated tour sequence lives in `src/tourStops.js`.

Tour stops should use `cameraMode: "targetCentered"` by default. In that mode, `target.lonDeg`, `target.latDeg`, and `target.heightM` define what stays centered, while `view.headingDeg`, `view.pitchDeg`, and `view.rangeM` define the camera offset around that target. Use `cameraMode: "absolutePose"` only for special shots where the exact camera location matters.

Shop point-label callouts are authored at `height: 0` and clamped to the rendered surface. In lightweight mode they sit on the globe/terrain surface; in photorealistic demo mode Cesium clamps them to the Google Photorealistic 3D Tiles surface when the tileset is loaded with collision enabled.

The KML-derived shop and yard point labels stay visible throughout the tour for layout context, along with a curated Cutting Area point placed 40 yards north of the Web Shop. Only the current stop's active label set switches to a green, larger, bold style; visible context labels from previous or next production areas stay in the standard cyan/white style. For the Panel Production Shops stop, the five panel-production shop labels are active together.

The blue production-flow arrows also stay visible throughout the tour. They resolve their start and end points from the same persistent point-label records used for shop markers, so adjusting a shop point also adjusts connected arrow endpoints. Arrow curve controls use `controlCurve.side` as `"left"` or `"right"` relative to travel from start shop to end shop, and the offset distance is calculated proportionally from the distance between those two points. Congested panel-production and Section Assembly routes can use a reduced curve ratio to keep bends readable without reversing their original side. The route runs from Steel Storage Yard to Cutting Area for the Cutting Shop step; the panel-production area then fans out from Cutting Area to Web Shop and the other four panel shops, and all five panel shops route into Section Assembly Shop.

Repeated chevrons are rendered by `src/flowChevronLayer.js` as a standalone billboard overlay on those same sampled arrow paths. They are spaced from sampled Cesium path length at roughly one chevron every 6 yards, so longer arrows automatically get more chevrons and shorter arrows get fewer. They are enabled by default for clearer flow direction, active routes turn green with a subtle wave effect, and the layer can be disabled with `VITE_ENABLE_FLOW_CHEVRONS=false` or `?chevrons=false`.

The current presentation sequence is: Shipyard Overview, Steel Storage Yard, Cutting Shop, Panel Production Shops, Section Assembly Shop, Outfitting Shop, Block Assembly Shop, Painting Shop, Grand Block Assembly Area, Building Dock, and Outfitting Dock. The Panel Production Shops stop shows Web Shop, Large Panel Shop, Double Bottom Shop, Bulkhead Shop, and Curved Panel Shop together.

To add locations, add placemarks to the KML, then add corresponding structured records and tests. Preserve source placemark ids and names; add separate display labels when a source typo needs a curated label.

## Authoring

When `VITE_ENABLE_AUTHORING=true`, clicking in the Cesium scene logs a copy-ready stop template through `src/logger.js`. Use those values to refine cameras, labels, polygons, and curved arrows.

## Testing

The project uses three testing levels:

- Vitest unit tests for data validation, navigation, base paths, and curved-arrow generation.
- Playwright browser smoke tests for the presentation flow.
- Build/deployment tests for local and GitHub Pages output.

Run the full suite before handoff:

```bash
npm run test:all
```

## Repository Hygiene

Commit source, public assets, tests, requirements, `package-lock.json`, `.env.example`, `.gitattributes`, `.gitignore`, and `.github/workflows/ci.yml`. Do not commit local env files, `node_modules/`, `dist/`, Playwright reports, test output, `.venv/`, or `initial_photos/`; the app uses the normalized image copies in `public/photos/`.

## Troubleshooting

If photorealistic tiles do not load after opening `?mode=demo`, verify the Cesium ion token has Google Photorealistic 3D Tiles permissions and is allowed for the current URL. The app should log a warning and fall back to the lightweight Cesium scene.

If Cesium workers or widgets fail to load, verify `dist/cesiumStatic` exists after build and that `VITE_APP_BASE_PATH` matches the deployment path.
