import { flyToStopCamera, setViewForStop } from "./cameraUtils.js";
import { CalloutManager } from "./calloutManager.js";
import { logger } from "./logger.js";

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
    this.isChromeHidden = false;

    this.tourPanel = document.getElementById("tourPanel");
    this.slideNumber = document.getElementById("slideNumber");
    this.slideTitle = document.getElementById("slideTitle");
    this.slideText = document.getElementById("slideText");
    this.photoPanel = document.getElementById("photoPanel");
    this.statsPanel = document.getElementById("statsPanel");
    this.progressDots = document.getElementById("progressDots");
    this.sceneStatus = document.getElementById("sceneStatus");
    this.nextBtn = document.getElementById("nextBtn");
    this.prevBtn = document.getElementById("prevBtn");
  }

  // initialize creates controls before rendering stop 0 so a page load always
  // lands in a usable presentation state.
  initialize() {
    this.createProgressDots();
    this.attachEventListeners();
    this.goToStop(0, { instant: true });
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
      dot.setAttribute("aria-label", `Go to stop ${index + 1}: ${stop.title}`);
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

  // goToStop is the central state transition for overlay content, progress,
  // Cesium graphics, and camera movement.
  goToStop(stopRef, options = {}) {
    const requestedIndex = this.findStopIndex(stopRef);
    const nextIndex =
      requestedIndex === -1 ? this.currentIndex : requestedIndex;
    this.currentIndex = Math.max(
      0,
      Math.min(nextIndex, this.tourStops.length - 1),
    );
    const stop = this.tourStops[this.currentIndex];

    this.updateOverlay(stop);
    this.updateProgressDots();
    this.updateControls();
    this.calloutManager.showStopGraphics(stop);
    this.flyCamera(stop, options);
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

    // Five-photo stops need denser presentation so all panel-production shop
    // slots can appear together inside the presentation panel.
    if (photos.length >= 5) {
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
      img.src = photo.src;
      img.alt = photo.label ?? stop.title;
      img.addEventListener("error", () => {
        const fallback = document.createElement("div");
        fallback.className = "photo-fallback";
        fallback.textContent = "Image pending";
        img.replaceWith(fallback);
      });

      item.append(img, caption);
      photoGrid.appendChild(item);
    }

    this.photoPanel.appendChild(photoGrid);
  }

  // flyCamera uses the stop camera mode so target-centered stops frame the
  // authored target, while absolutePose stops still support exact camera shots.
  flyCamera(stop, options = {}) {
    if (options.instant) {
      setViewForStop(this.viewer, stop);
      return;
    }

    flyToStopCamera(this.viewer, stop).catch((error) => {
      logger.debug("Camera flight did not complete.", error);
    });
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
  }
}
