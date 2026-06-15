import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";
import { logger } from "./logger.js";
import { initializeCameraViewCopyButton } from "./cameraViewClipboard.js";
import { resolveFlowChevronEnabled } from "./flowChevronLayer.js";
import { initializePhotorealisticToggle } from "./photorealisticToggle.js";
import { setupScene } from "./sceneSetup.js";
import { formatSceneModeStatus } from "./sceneMode.js";
import { shipyardLocations, toPointLabel } from "./shipyardLocations.js";
import { processFlowArrows, tourStops } from "./tourStops.js";
import { ShipyardGisLayer } from "./shipyardGisLayer.js";
import { WipFlightController } from "./wipFlightController.js";
import {
  validateShipyardLocations,
  validateTourStops,
} from "./tourDataValidator.js";
import { TourManager } from "./tourManager.js";
import { enableCoordinateAuthoring } from "./coordinateAuthoring.js";

// reportValidationErrors keeps bad authored data visible during development
// while still allowing the app to start if the issue is non-fatal.
function reportValidationErrors(label, errors) {
  if (errors.length === 0) return;
  logger.warn(`${label} validation found ${errors.length} issue(s).`, errors);
}

// updateSceneStatus makes the active scene/detail mode visible to presenters so
// they can immediately confirm whether the app is conserving quota or running a
// high-detail demonstration scene.
function updateSceneStatus(sceneStatus) {
  const sceneStatusElement = document.getElementById("sceneStatus");
  if (!sceneStatusElement) return;

  sceneStatusElement.textContent = formatSceneModeStatus(sceneStatus);
  sceneStatusElement.dataset.sceneMode = sceneStatus.sceneMode;
  sceneStatusElement.dataset.photorealistic = String(
    sceneStatus.photorealisticEnabled,
  );
}

// buildPersistentCallouts combines KML-derived points with authored stop
// callouts so future production points can remain visible across the whole tour
// even when they are not present in the source KML.
function buildPersistentCallouts(locations, stops) {
  const calloutsById = new Map();

  for (const location of locations) {
    const callout = toPointLabel(location);
    calloutsById.set(callout.id, callout);
  }

  for (const stop of stops) {
    for (const callout of stop.callouts ?? []) {
      if (!calloutsById.has(callout.id)) {
        calloutsById.set(callout.id, callout);
      }
    }
  }

  return Array.from(calloutsById.values());
}

// bootstrap owns the async scene setup and guarantees the tour manager starts
// only after the primary or fallback Cesium viewer is ready.
async function bootstrap() {
  reportValidationErrors(
    "Shipyard location",
    validateShipyardLocations(shipyardLocations),
  );
  reportValidationErrors("Tour stop", validateTourStops(tourStops));

  const { viewer, sceneStatus } = await setupScene("cesiumContainer");
  updateSceneStatus(sceneStatus);
  const baseCallouts = buildPersistentCallouts(shipyardLocations, tourStops);
  const shipyardGisLayer = new ShipyardGisLayer(viewer);
  const wipFlightController = new WipFlightController(viewer);
  const tourManager = new TourManager(viewer, tourStops, {
    baseArrows: processFlowArrows,
    baseCallouts,
    enableFlowChevrons: resolveFlowChevronEnabled(),
    shipyardGisLayer,
    wipFlightController,
  });
  tourManager.initialize();
  initializeCameraViewCopyButton(viewer, {
    getCurrentStopSnapshot: () => tourManager.getCurrentStopSnapshot(),
  });
  tourManager.refreshSurfaceAnchoredGraphics({
    repeat: sceneStatus.photorealisticEnabled,
  });
  initializePhotorealisticToggle(viewer, sceneStatus, (nextSceneStatus) => {
    updateSceneStatus(nextSceneStatus);
    tourManager.refreshSurfaceAnchoredGraphics({
      repeat: nextSceneStatus.photorealisticEnabled,
    });
  });
  enableCoordinateAuthoring(viewer);
  logger.info("Philadelphia Shipyard tour initialized.");
}

// Top-level startup catches fatal initialization failures and surfaces them in
// the overlay so a presenter is not left with a silent blank page.
bootstrap().catch((error) => {
  logger.error("Failed to initialize Philadelphia Shipyard tour.", error);
  document.getElementById("slideTitle").textContent = "Tour failed to load";
  document.getElementById("slideText").textContent =
    "Check the browser console for setup details.";
});
