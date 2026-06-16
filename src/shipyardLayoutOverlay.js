import * as Cesium from "cesium";
import { normalizeBasePath } from "./basePath.js";
import { logger } from "./logger.js";

const DEFAULT_LAYOUT_REGISTRATION_SOURCE =
  "data/shipyard-layout-registration.json";
const DEFAULT_FADE_DURATION_SEC = 1.5;

// readRuntimeBasePath mirrors the GIS and WIP path helpers so the layout image
// and registration JSON resolve in local root hosting and GitHub Pages builds.
function readRuntimeBasePath() {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env.BASE_URL ?? import.meta.env.VITE_APP_BASE_PATH ?? "/";
  }

  if (typeof process !== "undefined" && process.env) {
    return process.env.VITE_APP_BASE_PATH ?? "/";
  }

  return "/";
}

// buildPublicAssetUrl converts public/ asset paths into runtime URLs without
// forcing callers to care whether the app is served from "/" or a project path.
export function buildPublicAssetUrl(
  source,
  basePath = readRuntimeBasePath(),
) {
  if (!source || /^(https?:|data:|blob:)/i.test(source)) return source;

  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedSource = source.startsWith("/") ? source.slice(1) : source;

  return `${normalizedBasePath}${normalizedSource}`;
}

// buildShipyardLayoutRegistrationUrl keeps the JSON fetch path compatible with
// Vite's base path and with hand-authored absolute URLs used in tests.
export function buildShipyardLayoutRegistrationUrl(
  source = DEFAULT_LAYOUT_REGISTRATION_SOURCE,
  basePath = readRuntimeBasePath(),
) {
  return buildPublicAssetUrl(source, basePath);
}

// cartesianFromCorner converts generated lon/lat/height corners to Cesium's
// Cartesian coordinates. The converter stores explicit corners because the PNG
// is rotated to match the real yard rather than drawn as a north-up rectangle.
function cartesianFromCorner(corner) {
  const coordinate = corner.coordinate ?? corner;

  return Cesium.Cartesian3.fromDegrees(
    coordinate.lonDeg,
    coordinate.latDeg,
    coordinate.heightM ?? 0,
  );
}

// normalizeRegistrationCorners accepts the generated array form and a named
// object form so tests and future converters can evolve without changing the
// Cesium primitive behavior.
function normalizeRegistrationCorners(corners) {
  if (Array.isArray(corners)) {
    return Object.fromEntries(corners.map((corner) => [corner.id, corner]));
  }

  return corners ?? {};
}

// computeQuadNormal builds the single surface normal needed by the textured
// Cesium quad. MaterialAppearance expects normals when texture coordinates are
// provided, and faceForward lets Cesium render the image from the camera side.
function computeQuadNormal(topLeft, topRight, bottomLeft) {
  const right = Cesium.Cartesian3.subtract(
    topRight,
    topLeft,
    new Cesium.Cartesian3(),
  );
  const down = Cesium.Cartesian3.subtract(
    bottomLeft,
    topLeft,
    new Cesium.Cartesian3(),
  );
  const normal = Cesium.Cartesian3.cross(right, down, new Cesium.Cartesian3());

  return Cesium.Cartesian3.normalize(normal, normal);
}

// buildLayoutGeometryData converts the registration's named corners into flat
// typed arrays. The texture coordinates keep image pixel origin at top-left
// while Cesium's texture V axis is bottom-up.
export function buildLayoutGeometryData(registration) {
  const corners = normalizeRegistrationCorners(registration?.corners);

  if (!corners?.topLeft || !corners?.topRight || !corners?.bottomRight || !corners?.bottomLeft) {
    throw new Error("Layout registration must include all four image corners.");
  }

  const orderedCorners = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ];
  const positions = orderedCorners.map(cartesianFromCorner);
  const normal = computeQuadNormal(positions[0], positions[1], positions[3]);
  const positionValues = new Float64Array(12);
  const normalValues = new Float32Array(12);

  positions.forEach((position, index) => {
    const offset = index * 3;
    positionValues[offset] = position.x;
    positionValues[offset + 1] = position.y;
    positionValues[offset + 2] = position.z;
    normalValues[offset] = normal.x;
    normalValues[offset + 1] = normal.y;
    normalValues[offset + 2] = normal.z;
  });

  return {
    positionValues,
    normalValues,
    textureValues: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}

// createLayoutPrimitive builds a single translucent textured primitive. Keeping
// it as a primitive instead of an imagery layer allows the rotated two-point
// registration to be honored exactly.
function createLayoutPrimitive(registration, options = {}) {
  const geometryData = buildLayoutGeometryData(registration);
  const imageUrl = buildPublicAssetUrl(
    registration.image?.src,
    options.basePath ?? readRuntimeBasePath(),
  );
  const geometry = new Cesium.Geometry({
    attributes: new Cesium.GeometryAttributes({
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: geometryData.positionValues,
      }),
      normal: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: geometryData.normalValues,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: geometryData.textureValues,
      }),
    }),
    indices: geometryData.indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(
      geometryData.positionValues,
    ),
  });
  const material = Cesium.Material.fromType(Cesium.Material.ImageType, {
    image: imageUrl,
    repeat: new Cesium.Cartesian2(1, 1),
    color: Cesium.Color.WHITE.withAlpha(options.alpha ?? 0),
  });

  return new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry }),
    appearance: new Cesium.MaterialAppearance({
      material,
      faceForward: true,
      flat: true,
      translucent: true,
      closed: false,
      // Slide 0 is an authoring/presentation overlay, not terrain. Disabling
      // depth testing lets the registered PNG draw on top of satellite imagery
      // and Google 3D Tiles while those scene layers remain visible and loaded.
      renderState: {
        depthTest: {
          enabled: false,
        },
      },
    }),
    asynchronous: false,
    show: (options.alpha ?? 0) > 0,
  });
}

// getClockSeconds abstracts Cesium's clock so tests can drive fade behavior
// without a real render loop.
function getClockSeconds() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now() / 1000
    : Date.now() / 1000;
}

// defaultScheduleFrame hides requestAnimationFrame differences between browser
// and unit-test execution while preserving asynchronous fades in the app.
function defaultScheduleFrame(callback) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }

  return setTimeout(callback, 16);
}

// defaultCancelFrame pairs with defaultScheduleFrame so interrupted slide
// changes cannot leave old fade callbacks mutating imagery alpha later.
function defaultCancelFrame(frameId) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameId);
    return;
  }

  clearTimeout(frameId);
}

// ShipyardLayoutOverlay owns the slide-0 PNG surface and fades that surface on
// top of the live Cesium scene. It does not hide imagery or Google 3D Tiles,
// which keeps the transition back to the map/tiles visually continuous.
export class ShipyardLayoutOverlay {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.basePath = options.basePath ?? readRuntimeBasePath();
    this.fetchJson =
      options.fetchJson ??
      (async (url) => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
          );
        }

        return response.json();
      });
    this.scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame;
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame;
    this.registrationBySource = new Map();
    this.primitiveBySource = new Map();
    this.activeFrameId = undefined;
    this.transitionToken = 0;
    this.alpha = 0;
    this.currentSource = undefined;
  }

  // loadRegistration fetches and caches the generated registration JSON so
  // repeated Back/Next transitions do not refetch the slide-0 geometry.
  async loadRegistration(source = DEFAULT_LAYOUT_REGISTRATION_SOURCE) {
    if (this.registrationBySource.has(source)) {
      return this.registrationBySource.get(source);
    }

    const url = buildShipyardLayoutRegistrationUrl(source, this.basePath);
    const registration = await this.fetchJson(url);

    this.registrationBySource.set(source, registration);
    return registration;
  }

  // ensurePrimitive creates the Cesium textured quad once per registration
  // source. The primitive remains in the scene and is hidden by alpha/show
  // instead of being removed between slide changes.
  async ensurePrimitive(source = DEFAULT_LAYOUT_REGISTRATION_SOURCE) {
    if (this.primitiveBySource.has(source)) {
      return this.primitiveBySource.get(source);
    }

    const registration = await this.loadRegistration(source);
    const primitive = createLayoutPrimitive(registration, {
      basePath: this.basePath,
      alpha: 0,
    });

    this.viewer.scene.primitives.add(primitive);
    this.primitiveBySource.set(source, primitive);
    return primitive;
  }

  // setLayoutAlpha applies the crossfade value only to the PNG primitive. The
  // underlying map imagery and Google 3D Tiles remain untouched so they stay
  // visible through the transition and never reveal a star-only background.
  setLayoutAlpha(alpha, source = this.currentSource) {
    this.alpha = Math.max(0, Math.min(1, alpha));

    const primitive = source ? this.primitiveBySource.get(source) : undefined;

    if (primitive?.appearance?.material?.uniforms?.color) {
      primitive.appearance.material.uniforms.color =
        Cesium.Color.WHITE.withAlpha(this.alpha);
      primitive.show = this.alpha > 0.001;
    }

    this.viewer?.scene?.requestRender?.();
  }

  // stopActiveFade cancels an in-progress fade before a new slide transition
  // starts, preventing race conditions from fast presenter navigation.
  stopActiveFade() {
    if (this.activeFrameId !== undefined) {
      this.cancelFrame(this.activeFrameId);
      this.activeFrameId = undefined;
    }

    this.transitionToken += 1;
    return this.transitionToken;
  }

  // fadeTo animates from the current alpha to the requested target alpha. A
  // zero-duration fade is synchronous for first-load and unit-test paths.
  fadeTo(targetAlpha, options = {}) {
    const durationSec = options.durationSec ?? DEFAULT_FADE_DURATION_SEC;
    const source = options.source ?? this.currentSource;
    const token = this.stopActiveFade();
    const startAlpha = this.alpha;
    const alphaDelta = targetAlpha - startAlpha;
    const startSeconds = getClockSeconds();

    if (durationSec <= 0 || Math.abs(alphaDelta) < 0.001) {
      this.setLayoutAlpha(targetAlpha, source);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const step = () => {
        if (token !== this.transitionToken) {
          resolve();
          return;
        }

        const elapsedSec = getClockSeconds() - startSeconds;
        const progress = Math.min(elapsedSec / durationSec, 1);
        this.setLayoutAlpha(startAlpha + alphaDelta * progress, source);

        if (progress >= 1) {
          this.activeFrameId = undefined;
          resolve();
          return;
        }

        this.activeFrameId = this.scheduleFrame(step);
      };

      this.activeFrameId = this.scheduleFrame(step);
    });
  }

  // show prepares the layout primitive and fades the registered PNG in on top
  // of the current Cesium scene.
  async show(options = {}) {
    const source = options.source ?? DEFAULT_LAYOUT_REGISTRATION_SOURCE;

    this.currentSource = source;
    await this.ensurePrimitive(source);
    await this.fadeTo(1, {
      source,
      durationSec: options.fadeDurationSec ?? DEFAULT_FADE_DURATION_SEC,
    });
  }

  // hide reverses the slide-0 fade by hiding only the PNG primitive. The live
  // map imagery or 3D Tiles scene underneath is never modified by this overlay.
  async hide(options = {}) {
    if (!this.currentSource && this.alpha <= 0) return;

    const source = this.currentSource;

    await this.fadeTo(0, {
      source,
      durationSec: options.fadeDurationSec ?? DEFAULT_FADE_DURATION_SEC,
    });
    this.currentSource = undefined;
  }

  // flyToOverhead frames the registered drawing from directly above. Heading
  // comes from the generated two-point transform so the PNG appears upright for
  // the presentation rather than north-up.
  async flyToOverhead(options = {}) {
    const source = options.source ?? DEFAULT_LAYOUT_REGISTRATION_SOURCE;
    const registration = await this.loadRegistration(source);
    const camera = registration.camera;

    if (!camera) {
      throw new Error("Layout registration is missing camera metadata.");
    }

    const destination = Cesium.Cartesian3.fromDegrees(
      camera.lonDeg,
      camera.latDeg,
      camera.heightM,
    );
    const orientation = {
      heading: Cesium.Math.toRadians(camera.headingDeg ?? 0),
      pitch: Cesium.Math.toRadians(camera.pitchDeg ?? -90),
      roll: Cesium.Math.toRadians(camera.rollDeg ?? 0),
    };

    if (options.instant || options.durationSec === 0) {
      this.viewer.camera.setView({ destination, orientation });
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.viewer.camera.flyTo({
        destination,
        orientation,
        duration: options.durationSec ?? camera.durationSec ?? 3,
        complete: resolve,
        cancel: () => reject(new Error("Layout camera flight cancelled")),
      });
    });
  }
}
