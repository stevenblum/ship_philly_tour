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

For the current GitHub Pages setup, the same production values are also committed
in `.env.production` so the deploy workflow can build without a GitHub Actions
secret. This embeds the Cesium ion token in the browser bundle; restrict that
token in Cesium ion to `localhost` and the GitHub Pages deployment URL.
Cesium ion's **Allowed URLs** setting must include every local/deployed origin
that will load Google Photorealistic 3D Tiles; using **All URLs** works for
quick troubleshooting but is less restrictive than the recommended deployment
setting.

## Commands

```bash
npm run dev
npm run dev:demo
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

`build:github` sets `VITE_APP_BASE_PATH=/ship_philly_tour/` so Vite assets and Cesium static files resolve correctly on a GitHub Pages project site.

The Cesium ion token is read by Vite at build time. Local builds can use ignored
local env files, while the GitHub Pages workflow currently reads the committed
`.env.production` file.

## GitHub Pages

This repository includes `.github/workflows/pages.yml`, which builds `dist/`
with `npm run build:github` and deploys it through GitHub Actions.

To enable it on GitHub:

1. Open the repository settings.
2. Go to **Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push `main` or run the **Deploy GitHub Pages** workflow manually.

The expected project-site URL is:

```text
https://stevenblum.github.io/ship_philly_tour/
```

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

Scene mode is logged for developer confirmation, but the default presentation UI does not show internal Vite/Cesium status badges to the audience. The upper-right **Google 3D** checkbox can enable or disable Google Photorealistic 3D Tiles at runtime; leave it unchecked for normal development and rehearsals to conserve tile usage.

## Navigation Widget

The Cesium viewer initializes `cesium-navigation-es6` with its standard compass, zoom controls, distance legend, and compass outer ring. This provides a visual north/rotation reference without adding a custom compass, custom HUD, or camera-debug panel.

## Tour Data

The original KML source is preserved as `Phillly Tour.kml` and normalized for app use at `public/data/philly-tour.kml`. The initial structured data lives in `src/shipyardLocations.js`, and the narrated tour sequence lives in `src/tourStops.js`.

The full manufacturing-equipment, storage-area, shop-boundary, process-edge, and roads overlay uses `Philly_Shipyard.gpkg` as the canonical GIS source. Run this after updating the GeoPackage:

```bash
npm run data:shipyard
```

That command regenerates `public/data/shipyard-gis/points.geojson`, `lines.geojson`, `polygons.geojson`, `styles.json`, and `manifest.json`. The generated files are committed so GitHub Pages can serve them as static assets without GDAL. The final tour slide loads those GeoJSON files with Cesium and applies QGIS-derived styles by `styleClass`.

The WIP flight slide uses `WIP_Tour.kml` as its source. That file contains older shop point placemarks that the app ignores; only the placemark named `WIP Tour` is converted:

```bash
npm run data:wip-tour
```

That command regenerates `public/data/wip-tour-path.json`. The WIP Flight slide uses the generated line as a hidden one-minute camera path 15 m above the sampled Cesium surface, with the camera pitched down 15 degrees; the route line itself is not drawn.

Tour stops should use `cameraMode: "targetCentered"` by default. In that mode, `target.lonDeg`, `target.latDeg`, and `target.heightM` define what stays centered, while `view.headingDeg`, `view.pitchDeg`, and `view.rangeM` define the camera offset around that target. Use `cameraMode: "absolutePose"` only for special shots where the exact camera location matters.

Shop point-label callouts are authored at `height: 0` when possible and clamped to the rendered surface. In lightweight mode they sit on the globe/terrain surface; in photorealistic demo mode Cesium clamps them to the Google Photorealistic 3D Tiles surface when the tileset is loaded with collision enabled. Production-flow arrow endpoints resample the rendered surface at their start and end shop labels so the arrows can meet roof-height or ground-height nodes after the Google tiles refine.

The KML-derived shop and yard point labels stay visible throughout the tour for layout context, along with a curated Cutting Area point placed 40 yards north of the Web Shop. Only the current stop's active label set switches to a green, larger, bold style; visible context labels from previous or next production areas stay in the standard cyan/white style. For the Panel Production Shops stop, the five panel-production shop labels are active together.

The blue production-flow arrows also stay visible throughout the tour. They resolve their start and end points from the same persistent point-label records used for shop markers, so adjusting a shop point also adjusts connected arrow endpoints. Arrow curve controls use `controlCurve.side` as `"left"` or `"right"` relative to travel from start shop to end shop, and the offset distance is calculated proportionally from the distance between those two points. Congested panel-production and Section Assembly routes can use a reduced curve ratio to keep bends readable without reversing their original side. The route runs from Steel Storage Yard to Cutting Area for the Cutting Shop step; the panel-production area then fans out from Cutting Area to Web Shop and the other four panel shops, and all five panel shops route into Section Assembly Shop.

Repeated chevrons are rendered by `src/flowChevronLayer.js` as a standalone billboard overlay on those same sampled arrow paths. They are spaced from sampled Cesium path length at roughly one chevron every 6 yards, so longer arrows automatically get more chevrons and shorter arrows get fewer. They are enabled by default for clearer flow direction, active routes turn green with a subtle wave effect, and the layer can be disabled with `VITE_ENABLE_FLOW_CHEVRONS=false` or `?chevrons=false`.

The current presentation sequence is: Shipyard Overview, Steel Storage Yard, Cutting Shop, Panel Production Shops, Section Assembly Shop, Outfitting Shop, Block Assembly Shop, Painting Shop, Grand Block Assembly Area, Building Dock, Outfitting Dock, WIP Flight, and MES Network. The Panel Production Shops stop shows Web Shop, Large Panel Shop, Double Bottom Shop, Bulkhead Shop, and Curved Panel Shop together. The WIP Flight stop hides ordinary production-flow graphics and runs the hidden camera path; the final MES Network stop hides the ordinary production-flow arrows and shows the generated GIS overlay.

To add locations, add placemarks to the KML, then add corresponding structured records and tests. Preserve source placemark ids and names; add separate display labels when a source typo needs a curated label.

## Authoring

When `VITE_ENABLE_AUTHORING=true`, clicking in the Cesium scene logs a copy-ready stop template through `src/logger.js`. Use those values to refine cameras, labels, polygons, and curved arrows.

The upper-right **Copy Camera** button is always visible during normal presentation mode. It copies the current camera view directly to the clipboard as JSON, including an exact `absolutePose` snippet and a target-centered approximation when Cesium can pick the center of the screen. The camera data is not displayed in the UI.

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

Commit source, public assets, tests, requirements, `package-lock.json`, `.env.example`, `.env.production`, `.gitattributes`, `.gitignore`, `.github/workflows/ci.yml`, and `.github/workflows/pages.yml`. Do not commit local env files, `node_modules/`, `dist/`, Playwright reports, test output, `.venv/`, or `initial_photos/`; the app uses the normalized image copies in `public/photos/`.

## Troubleshooting

If photorealistic tiles do not load after opening `?mode=demo`, or if the **Google 3D** checkbox immediately rolls back to unchecked, verify the Cesium ion token has Google Photorealistic 3D Tiles permissions for asset `2275207` and is allowed for the current URL. The app reports `access-forbidden` for Cesium ion `401/403` responses and falls back to the lightweight Cesium scene.

For local development and GitHub Pages, include these allowed URL patterns in the Cesium ion token restrictions:

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
https://stevenblum.github.io/ship_philly_tour/*
```

If Cesium workers or widgets fail to load, verify `dist/cesiumStatic` exists after build and that `VITE_APP_BASE_PATH` matches the deployment path.
