import { setGooglePhotorealisticTilesEnabled } from "./sceneSetup.js";
import { logger } from "./logger.js";

const CHECKED_TITLE =
  "Google Photorealistic 3D Tiles are enabled. Uncheck to return to lightweight imagery.";
const UNCHECKED_TITLE =
  "Enable Google Photorealistic 3D Tiles for final demos or recording.";
const LOADING_TITLE = "Updating Google Photorealistic 3D Tiles mode...";
const ERROR_TITLES = {
  "access-forbidden":
    "Google 3D unavailable: Cesium ion denied access to Photorealistic 3D Tiles. Check token asset permissions and allowed URLs.",
  "missing-token": "Google 3D unavailable: VITE_CESIUM_ION_TOKEN is missing.",
  "tile-load-failed":
    "Google 3D unavailable: Photorealistic 3D Tiles failed to load. Check network and Cesium ion access.",
  "toggle-error":
    "Google 3D unavailable: the scene toggle failed before tiles could load.",
};

// buildToggleTitle translates scene-status reasons into concise operator
// guidance. The checkbox still shows requested state while loading, but after a
// failure it explains why the control rolled back to unchecked.
function buildToggleTitle(isEnabled, isError, reason) {
  if (isError) {
    return ERROR_TITLES[reason] ?? ERROR_TITLES["tile-load-failed"];
  }

  return isEnabled ? CHECKED_TITLE : UNCHECKED_TITLE;
}

// updateToggleState keeps the visible checkbox, title text, data attributes,
// and loading/error affordances synchronized with the actual Cesium scene mode.
// This prevents the UI from implying that quota-consuming Google tiles are
// active after a missing-token or tile-load fallback.
function updateToggleState(root, input, sceneStatus, options = {}) {
  const isEnabled = Boolean(sceneStatus?.photorealisticEnabled);
  const isLoading = Boolean(options.loading);
  const isError = Boolean(options.error);
  const reason = sceneStatus?.reason ?? "";

  input.checked = isEnabled;
  input.disabled = isLoading;
  root.classList.toggle("is-loading", isLoading);
  root.classList.toggle("is-error", isError);
  root.setAttribute("aria-busy", String(isLoading));
  root.dataset.photorealistic = String(isEnabled);
  root.dataset.sceneReason = reason;
  root.dataset.errorMessage = isError
    ? buildToggleTitle(isEnabled, true, reason)
    : "";
  input.setAttribute("aria-invalid", String(isError));
  input.setAttribute(
    "aria-label",
    isError ? `Google 3D. ${root.dataset.errorMessage}` : "Google 3D",
  );

  if (isLoading) {
    root.title = LOADING_TITLE;
    return;
  }

  root.title = buildToggleTitle(isEnabled, isError, reason);
}

// initializePhotorealisticToggle wires the presentation control to the Cesium
// scene-detail switch. The control deliberately changes only the Google 3D
// Tiles primitive, so tour navigation, callouts, arrows, chevrons, and current
// camera position continue to work while presenters compare scene modes.
export function initializePhotorealisticToggle(
  viewer,
  initialSceneStatus,
  onSceneStatusChange = () => {},
) {
  const root = document.getElementById("photorealisticToggle");
  const input = document.getElementById("photorealisticToggleInput");

  if (!root || !input) {
    logger.warn("Photorealistic toggle elements are missing from the DOM.");
    return;
  }

  updateToggleState(root, input, initialSceneStatus);

  input.addEventListener("change", async () => {
    const requestedEnabled = input.checked;

    updateToggleState(
      root,
      input,
      { photorealisticEnabled: requestedEnabled, reason: "user-requested" },
      { loading: true },
    );

    try {
      const nextSceneStatus = await setGooglePhotorealisticTilesEnabled(
        viewer,
        requestedEnabled,
      );
      const failedToEnable =
        requestedEnabled && !nextSceneStatus.photorealisticEnabled;

      updateToggleState(root, input, nextSceneStatus, {
        error: failedToEnable,
      });
      onSceneStatusChange(nextSceneStatus);
    } catch (error) {
      const fallbackStatus = {
        sceneMode: "lightweight",
        requestedMode: "photorealistic",
        photorealisticEnabled: false,
        source: "ui:photorealistic-toggle",
        reason: "toggle-error",
      };

      logger.error("Failed to toggle Google Photorealistic 3D Tiles.", error);
      updateToggleState(root, input, fallbackStatus, { error: true });
      onSceneStatusChange(fallbackStatus);
    }
  });
}
