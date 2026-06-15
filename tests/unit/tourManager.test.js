// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TourManager } from "../../src/tourManager.js";

const stops = [
  {
    id: "first",
    title: "First Stop",
    text: "First text",
    cameraMode: "targetCentered",
    target: { lonDeg: -75, latDeg: 39, heightM: 10, radiusM: 50 },
    view: { headingDeg: 85, pitchDeg: -45, rangeM: 300, durationSec: 1 },
    stats: [],
    callouts: [],
    polygons: [],
    arrows: [],
    polylines: [],
  },
  {
    id: "second",
    title: "Second Stop",
    text: "Second text",
    cameraMode: "targetCentered",
    target: { lonDeg: -75.1, latDeg: 39.1, heightM: 10, radiusM: 50 },
    view: { headingDeg: 85, pitchDeg: -40, rangeM: 320, durationSec: 1 },
    stats: [],
    callouts: [],
    polygons: [],
    arrows: [],
    polylines: [],
  },
];

// createDom builds the minimum overlay shell TourManager requires so tests can
// exercise navigation behavior without loading Cesium or WebGL.
function createDom() {
  document.body.innerHTML = `
    <div id="tourPanel">
      <div id="slideNumber"></div>
      <h1 id="slideTitle"></h1>
      <p id="slideText"></p>
      <div id="photoPanel"></div>
      <div id="statsPanel"></div>
      <button id="prevBtn" type="button">Back</button>
      <button id="nextBtn" type="button">Next</button>
    </div>
    <div id="progressDots"></div>
    <button id="cameraViewCopyButton" type="button">Copy Camera</button>
  `;
}

// createViewerStub records camera calls while avoiding a real Cesium Viewer.
function createViewerStub() {
  return {
    camera: {
      setView: vi.fn(),
      flyTo: vi.fn(),
      viewBoundingSphere: vi.fn(),
      flyToBoundingSphere: vi.fn((sphere, options) => options.complete?.()),
      lookAtTransform: vi.fn(),
    },
  };
}

// createManager builds the manager with a fake callout manager so tests focus
// on tour navigation and DOM behavior.
function createManager() {
  const viewer = createViewerStub();
  const calloutManager = { showStopGraphics: vi.fn() };
  const shipyardGisLayer = { show: vi.fn(), hide: vi.fn() };
  const manager = new TourManager(viewer, stops, {
    calloutManager,
    shipyardGisLayer,
  });
  manager.initialize();
  return { manager, viewer, calloutManager, shipyardGisLayer };
}

describe("TourManager navigation", () => {
  beforeEach(() => {
    createDom();
  });

  test("starts at stop 0", () => {
    const { manager, viewer } = createManager();

    expect(manager.currentIndex).toBe(0);
    expect(document.getElementById("slideTitle").textContent).toBe("First Stop");
    expect(viewer.camera.viewBoundingSphere).toHaveBeenCalledTimes(1);
  });

  test("advances and returns within boundaries", () => {
    const { manager, viewer } = createManager();

    manager.next();
    expect(manager.currentIndex).toBe(1);
    expect(document.getElementById("slideTitle").textContent).toBe("Second Stop");
    expect(viewer.camera.flyToBoundingSphere).toHaveBeenCalled();

    manager.next();
    expect(manager.currentIndex).toBe(1);

    manager.previous();
    expect(manager.currentIndex).toBe(0);

    manager.previous();
    expect(manager.currentIndex).toBe(0);
  });

  test("supports id navigation and ignores invalid ids gracefully", () => {
    const { manager } = createManager();

    manager.goToStop("second");
    expect(manager.currentIndex).toBe(1);

    manager.goToStop("missing");
    expect(manager.currentIndex).toBe(1);
  });

  test("exposes current stop context for camera copy authoring", () => {
    const { manager } = createManager();

    manager.goToStop("second");

    expect(manager.getCurrentStopSnapshot()).toMatchObject({
      index: 1,
      stopNumber: 2,
      id: "second",
      title: "Second Stop",
      target: stops[1].target,
      view: stops[1].view,
    });
  });

  test("toggles the final GIS overlay from stop data", () => {
    const viewer = createViewerStub();
    const calloutManager = { showStopGraphics: vi.fn() };
    const shipyardGisLayer = { show: vi.fn(), hide: vi.fn() };
    const gisStops = [
      stops[0],
      { ...stops[1], gisOverlay: { show: true } },
    ];
    const manager = new TourManager(viewer, gisStops, {
      calloutManager,
      shipyardGisLayer,
    });

    manager.initialize();
    expect(shipyardGisLayer.hide).toHaveBeenCalledTimes(1);
    expect(shipyardGisLayer.show).not.toHaveBeenCalled();

    manager.next();
    expect(shipyardGisLayer.show).toHaveBeenCalledTimes(1);

    manager.previous();
    expect(shipyardGisLayer.hide).toHaveBeenCalledTimes(2);
  });

  test("starts pathFlight slides and stops them on navigation", () => {
    const viewer = createViewerStub();
    const calloutManager = { showStopGraphics: vi.fn() };
    const wipFlightController = {
      start: vi.fn(() => Promise.resolve()),
      stop: vi.fn(),
    };
    const pathFlightStop = {
      ...stops[1],
      id: "wip-flight",
      title: "WIP Flight",
      cameraMode: "pathFlight",
      pathFlight: {
        source: "data/wip-tour-path.json",
        durationSec: 60,
        altitudeOffsetM: 15,
        lookAheadSec: 1.5,
        pitchDeg: -15,
      },
      target: undefined,
      view: undefined,
    };
    const manager = new TourManager(viewer, [stops[0], pathFlightStop], {
      calloutManager,
      wipFlightController,
    });

    manager.initialize();
    expect(wipFlightController.stop).toHaveBeenCalledTimes(1);

    manager.next();
    expect(wipFlightController.stop).toHaveBeenCalledTimes(2);
    expect(wipFlightController.start).toHaveBeenCalledWith(
      pathFlightStop.pathFlight,
    );
    expect(viewer.camera.flyToBoundingSphere).not.toHaveBeenCalled();

    manager.previous();
    expect(wipFlightController.stop).toHaveBeenCalledTimes(3);
  });

  test("hides camera copy button with presentation chrome", () => {
    const { manager } = createManager();
    const cameraViewCopyButton = document.getElementById(
      "cameraViewCopyButton",
    );

    manager.togglePresentationChrome();

    expect(cameraViewCopyButton.classList.contains("is-hidden")).toBe(true);

    manager.togglePresentationChrome();

    expect(cameraViewCopyButton.classList.contains("is-hidden")).toBe(false);
  });
});
