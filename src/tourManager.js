import { flyToStopCamera, setViewForStop } from "./cameraUtils.js";
import { CalloutManager } from "./calloutManager.js";
import { logger } from "./logger.js";
import { PhotoLightbox } from "./photoLightbox.js";
import { buildPublicAssetUrl } from "./publicAssetUrl.js";

const SURFACE_REFRESH_DELAYS_MS = [0, 250, 750, 1500, 3000, 5000];

// TourManager coordinates slide state, DOM overlays, keyboard controls, and
// Cesium camera movement to make the app behave like a live 3D presentation.
export class TourManager {
  constructor(viewer, tourStops, options = {}) {
    this.viewer = viewer;
    this.tourStops = tourStops;
    this.currentIndex = 0;
    this.calloutManager =
      options.calloutManager ??
      new CalloutManager(viewer, {
        baseArrows: options.baseArrows ?? [],
        baseCallouts: options.baseCallouts ?? [],
        enableFlowChevrons: options.enableFlowChevrons ?? true,
        flowChevronOptions: options.flowChevronOptions ?? {},
      });
    this.shipyardGisLayer = options.shipyardGisLayer;
    this.wipFlightController = options.wipFlightController;
    this.shipyardLayoutOverlay = options.shipyardLayoutOverlay;
    this.photoLightbox = options.photoLightbox ?? new PhotoLightbox();
    this.initialStopIndex = options.initialStopIndex ?? 0;
    this.isChromeHidden = false;

    this.tourPanel = document.getElementById("tourPanel");
    this.slideNumber = document.getElementById("slideNumber");
    this.slideTitle = document.getElementById("slideTitle");
    this.slideText = document.getElementById("slideText");
    this.photoPanel = document.getElementById("photoPanel");
    this.statsPanel = document.getElementById("statsPanel");
    this.progressDots = document.getElementById("progressDots");
    this.sceneStatus = document.getElementById("sceneStatus");
    this.photorealisticToggle = document.getElementById("photorealisticToggle");
    this.cameraViewCopyButton = document.getElementById(
      "cameraViewCopyButton",
    );
    this.nextBtn = document.getElementById("nextBtn");
    this.prevBtn = document.getElementById("prevBtn");
    this.surfaceRefreshTimers = [];
  }

  // initialize creates controls before rendering the configured initial stop so
  // a page load always lands in a usable presentation state. The current app
  // starts on slide 0, but tests can still exercise alternate initial indices.
  initialize() {
    this.createProgressDots();
    this.attachEventListeners();
    this.goToStop(this.initialStopIndex, { instant: true });
  }

  // attachEventListeners implements the required click and keyboard controls
  // for presenting without touching the mouse.
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

  // createProgressDots exposes direct navigation and current-stop status for
  // classroom use where presenters may jump around during discussion.
  createProgressDots() {
    this.progressDots.textContent = "";

    this.tourStops.forEach((stop, index) => {
      const dot = document.createElement("button");
      dot.className = "progress-dot";
      dot.title = stop.title;
      dot.type = "button";
      const slideNumber = stop.slideNumber ?? index + 1;
      dot.setAttribute(
        "aria-label",
        `Go to slide ${slideNumber}: ${stop.title}`,
      );
      dot.addEventListener("click", () => this.goToStop(index));
      this.progressDots.appendChild(dot);
    });
  }

  // updateProgressDots keeps visual and screen-reader state aligned.
  updateProgressDots() {
    const dots = Array.from(
      this.progressDots.querySelectorAll(".progress-dot"),
    );

    dots.forEach((dot, index) => {
      const active = index === this.currentIndex;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", active ? "step" : "false");
    });
  }

  // updateControls prevents boundary clicks from implying wraparound behavior.
  updateControls() {
    this.prevBtn.disabled = this.currentIndex === 0;
    this.nextBtn.disabled = this.currentIndex === this.tourStops.length - 1;
  }

  // next advances one stop while clamping at the final stop.
  next() {
    this.goToStop(Math.min(this.currentIndex + 1, this.tourStops.length - 1));
  }

  // previous returns one stop while clamping at the first stop.
  previous() {
    this.goToStop(Math.max(this.currentIndex - 1, 0));
  }

  // findStopIndex supports index and id navigation so tests and future UI can
  // address stops by stable ids instead of array position.
  findStopIndex(stopRef) {
    if (typeof stopRef === "number") return stopRef;
    return this.tourStops.findIndex((stop) => stop.id === stopRef);
  }

  // getCurrentStopSnapshot provides the clipboard authoring control with slide
  // context without exposing mutable tour-stop objects to the UI helper.
  getCurrentStopSnapshot() {
    const stop = this.tourStops[this.currentIndex];

    if (!stop) return null;

    return {
      index: this.currentIndex,
      stopNumber: stop.slideNumber ?? this.currentIndex + 1,
      slideNumber: stop.slideNumber ?? this.currentIndex + 1,
      id: stop.id,
      title: stop.title,
      target: stop.target,
      view: stop.view,
      camera: stop.camera,
      pathFlight: stop.pathFlight,
      layoutOverlay: stop.layoutOverlay,
    };
  }

  // goToStop is the central state transition for overlay content, progress,
  // Cesium graphics, and camera movement.
  goToStop(stopRef, options = {}) {
    const requestedIndex = this.findStopIndex(stopRef);
    const nextIndex =
      requestedIndex === -1 ? this.currentIndex : requestedIndex;
    this.wipFlightController?.stop?.();
    this.photoLightbox?.close?.();
    this.currentIndex = Math.max(
      0,
      Math.min(nextIndex, this.tourStops.length - 1),
    );
    const stop = this.tourStops[this.currentIndex];

    this.updateOverlay(stop);
    this.updateProgressDots();
    this.updateControls();
    this.calloutManager.showStopGraphics(stop);
    this.updateShipyardGisOverlay(stop);
    this.updateShipyardLayoutOverlay(stop, options);
    this.flyCamera(stop, options);

    if (this.viewer.shipyardPhotorealisticTileset) {
      this.refreshSurfaceAnchoredGraphics({ repeat: true });
    }
  }

  // updateShipyardLayoutOverlay handles slide 0's registered PNG crossfade.
  // It is independent of callouts/GIS so map imagery can stay loaded underneath
  // while the layout image becomes the only visible surface.
  updateShipyardLayoutOverlay(stop, options = {}) {
    if (!this.shipyardLayoutOverlay) return;

    const fadeDurationSec = options.instant
      ? 0
      : (stop.layoutOverlay?.fadeDurationSec ?? 1.5);

    if (stop.cameraMode === "layoutOverlay") {
      this.shipyardLayoutOverlay
        .show({
          source: stop.layoutOverlay?.source,
          fadeDurationSec,
        })
        .catch((error) => {
          logger.warn("Shipyard layout overlay did not show.", error);
        });
      return;
    }

    this.shipyardLayoutOverlay.hide({ fadeDurationSec }).catch((error) => {
      logger.warn("Shipyard layout overlay did not hide.", error);
    });
  }

  // syncCurrentLayoutOverlay reapplies slide-0 visibility after external scene
  // changes, such as loading Google 3D tiles while the layout slide is active.
  // Newly loaded imagery/tiles remain visible behind the PNG; this only keeps
  // the layout primitive fully opaque on top of the updated scene.
  syncCurrentLayoutOverlay() {
    const stop = this.tourStops[this.currentIndex];

    if (stop?.cameraMode !== "layoutOverlay" || !this.shipyardLayoutOverlay) {
      return;
    }

    this.shipyardLayoutOverlay.setLayoutAlpha(1, stop.layoutOverlay?.source);
  }

  // updateShipyardGisOverlay treats the full manufacturing-equipment GIS layer
  // as a final-slide-only presentation layer. It is intentionally controlled by
  // tour data so future slides can opt in without changing navigation code.
  updateShipyardGisOverlay(stop) {
    if (!this.shipyardGisLayer) return;

    const showOverlay = stop.gisOverlay?.show === true;

    if (showOverlay) {
      this.shipyardGisLayer.show();
      return;
    }

    this.shipyardGisLayer.hide();
  }

  // updateOverlay renders text, photos, and stats using textContent/DOM nodes so
  // future JSON-authored tour data cannot inject HTML.
  updateOverlay(stop) {
    if (this.slideNumber) this.slideNumber.textContent = "";
    this.slideTitle.textContent = stop.title;
    this.slideText.textContent = stop.text;

    this.photoPanel.textContent = "";
    this.renderPhoto(stop);

    this.statsPanel.textContent = "";
    for (const stat of stop.stats ?? []) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      row.className = "stat-row";
      label.textContent = stat.label;
      value.textContent = stat.value;
      row.append(label, value);
      this.statsPanel.appendChild(row);
    }
  }

  // renderPhoto shows single-photo and multi-photo stops. Missing shop-specific
  // images render as deliberate labeled placeholders so the presentation never
  // shows broken media while future assets are still being collected.
  renderPhoto(stop) {
    const photos =
      stop.photos ??
      (stop.photo ? [{ label: stop.title, src: stop.photo }] : []);
    if (photos.length === 0) return;

    const photoGrid = document.createElement("div");
    photoGrid.className =
      photos.length > 1 ? "photo-grid" : "photo-grid single";

    // Denser grids keep multi-shop photo sets inside the presentation panel
    // without making the left overlay scroll excessively.
    if (photos.length >= 4) {
      photoGrid.classList.add("compact");
    }

    for (const photo of photos) {
      const item = document.createElement("figure");
      const caption = document.createElement("figcaption");
      item.className = "photo-item";
      caption.textContent = photo.label ?? stop.title;

      if (!photo.src) {
        const placeholder = document.createElement("div");
        placeholder.className = "photo-fallback";
        placeholder.textContent = "Image pending";
        item.append(placeholder, caption);
        photoGrid.appendChild(item);
        continue;
      }

      const img = document.createElement("img");
      const trigger = document.createElement("button");
      const label = photo.label ?? stop.title;
      const photoUrl = buildPublicAssetUrl(photo.src);

      img.src = photoUrl;
      img.alt = label;
      img.addEventListener("error", () => {
        const fallback = document.createElement("div");
        fallback.className = "photo-fallback";
        fallback.textContent = "Image pending";
        trigger.replaceWith(fallback);
      });
      trigger.className = "photo-expand-button";
      trigger.type = "button";
      trigger.setAttribute("aria-label", `Expand image: ${label}`);
      trigger.appendChild(img);
      trigger.addEventListener("click", () => {
        this.photoLightbox?.open?.({
          title: stop.title,
          src: photoUrl,
          alt: label,
          caption: label,
        });
      });

      item.append(trigger, caption);
      photoGrid.appendChild(item);
    }

    this.photoPanel.appendChild(photoGrid);
  }

  // flyCamera uses the stop camera mode so target-centered stops frame the
  // authored target, while absolutePose stops still support exact camera shots.
  flyCamera(stop, options = {}) {
    if (stop.cameraMode === "layoutOverlay") {
      this.shipyardLayoutOverlay
        ?.flyToOverhead({
          source: stop.layoutOverlay?.source,
          durationSec: options.instant
            ? 0
            : (stop.layoutOverlay?.durationSec ?? 3),
          instant: options.instant,
        })
        .catch((error) => {
          logger.debug("Layout camera flight did not complete.", error);
        });
      return;
    }

    if (stop.cameraMode === "pathFlight") {
      this.wipFlightController?.start(stop.pathFlight).catch((error) => {
        logger.warn("WIP flight did not start.", error);
      });
      return;
    }

    if (options.instant) {
      setViewForStop(this.viewer, stop);
      return;
    }

    flyToStopCamera(this.viewer, stop).catch((error) => {
      logger.debug("Camera flight did not complete.", error);
    });
  }

  // clearSurfaceRefreshTimers prevents outdated delayed samples from one scene
  // state or stop from mutating arrows after the presenter has moved on.
  clearSurfaceRefreshTimers() {
    for (const timerId of this.surfaceRefreshTimers) {
      clearTimeout(timerId);
    }

    this.surfaceRefreshTimers = [];
  }

  // refreshSurfaceAnchoredGraphics resamples arrow endpoint heights from the
  // current rendered scene. Repeating the sample is important for Google
  // Photorealistic 3D Tiles because Cesium streams/refines tile geometry after
  // the checkbox succeeds and after camera flights move to new shops.
  refreshSurfaceAnchoredGraphics(options = {}) {
    this.clearSurfaceRefreshTimers();
    this.calloutManager.refreshSurfaceAnchoredArrows?.();

    if (!options.repeat) return;

    for (const delayMs of options.delaysMs ?? SURFACE_REFRESH_DELAYS_MS) {
      const timerId = setTimeout(() => {
        this.calloutManager.refreshSurfaceAnchoredArrows?.();
      }, delayMs);
      this.surfaceRefreshTimers.push(timerId);
    }
  }

  // toggleFullscreen uses the browser Fullscreen API required for presentation
  // use and ignores unsupported contexts gracefully.
  async toggleFullscreen() {
    if (!document.fullscreenEnabled) return;

    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }

    await document.exitFullscreen();
  }

  // togglePresentationChrome hides overlays for unobstructed screenshots while
  // keeping the Cesium scene and current stop state unchanged.
  togglePresentationChrome() {
    this.isChromeHidden = !this.isChromeHidden;
    this.tourPanel.classList.toggle("is-hidden", this.isChromeHidden);
    this.progressDots.classList.toggle("is-hidden", this.isChromeHidden);
    this.sceneStatus?.classList.toggle("is-hidden", this.isChromeHidden);
    this.photorealisticToggle?.classList.toggle(
      "is-hidden",
      this.isChromeHidden,
    );
    this.cameraViewCopyButton?.classList.toggle(
      "is-hidden",
      this.isChromeHidden,
    );
  }
}
