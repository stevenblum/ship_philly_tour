import * as Cesium from "cesium";
import { scaleShipGraphVisual } from "./visualScale.js";

// DEFAULT_FLOW_CHEVRON_OPTIONS defines the standalone chevron overlay behavior
// for production-flow arrows. The overlay follows existing arrow paths instead
// of creating new route geometry, which keeps arrow layout tuning in one place.
const DEFAULT_FLOW_CHEVRON_OPTIONS = {
  enabled: true,
  spacingYards: 6,
  inactiveAlpha: 0.52,
  activeAlpha: 0.92,
  inactiveScale: scaleShipGraphVisual(0.34),
  activeScale: scaleShipGraphVisual(0.46),
  pulseAlpha: 0.08,
  pulseScale: scaleShipGraphVisual(0.1),
  speed: 0.12,
  rotationLeadFraction: 0.012,
  color: "#53d8ff",
  activeColor: "#35f27a",
};

const METERS_PER_YARD = 0.9144;
const SCREEN_TANGENT_EPSILON = 0.0001;
const CHEVRON_STROKE_WIDTH = scaleShipGraphVisual(8);

// encodeSvgAsDataUrl keeps the chevron asset local to this module so the flow
// overlay can be removed or disabled without touching public static assets.
function encodeSvgAsDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// buildChevronSvgDataUrl creates a simple right-pointing chevron image. Cesium
// billboard color tinting supplies the blue/green route state at runtime.
export function buildChevronSvgDataUrl() {
  return encodeSvgAsDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <path d="M16 10 L32 24 L16 38" fill="none" stroke="white" stroke-width="${CHEVRON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `);
}

const CHEVRON_IMAGE = buildChevronSvgDataUrl();

// readRuntimeEnv supports browser runtime configuration through Vite and lets
// tests call the same resolver in Node without constructing a DOM.
function readRuntimeEnv() {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env;
  }

  if (typeof process !== "undefined" && process.env) {
    return process.env;
  }

  return {};
}

// normalizeSearch accepts both raw query strings and values already prefixed
// with "?", matching the scene-mode parser's test-friendly convention.
function normalizeSearch(search) {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
}

// readBooleanFlag parses the small set of values authors commonly use in URLs
// and env files while treating missing or unrecognized values as neutral.
function readBooleanFlag(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return null;
}

// resolveFlowChevronEnabled gives presenters and developers a no-code way to
// turn the standalone chevron layer on or off while keeping it enabled by
// default for clearer route direction.
export function resolveFlowChevronEnabled(options = {}) {
  const env = options.env ?? readRuntimeEnv();
  const browserSearch =
    typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(
    normalizeSearch(options.search ?? browserSearch),
  );

  const urlChevrons = readBooleanFlag(
    params.get("chevrons") ?? params.get("flowChevrons"),
  );
  if (urlChevrons !== null) return urlChevrons;

  const envChevrons = readBooleanFlag(env.VITE_ENABLE_FLOW_CHEVRONS);
  if (envChevrons !== null) return envChevrons;

  return DEFAULT_FLOW_CHEVRON_OPTIONS.enabled;
}

// loopFraction wraps animation progress so chevrons continuously travel from
// arrow tail to arrow head without exceeding the sampled path bounds.
function loopFraction(value) {
  const remainder = value % 1;
  return remainder < 0 ? remainder + 1 : remainder;
}

// clampFraction protects public interpolation calls where a caller expects
// fraction 1 to mean the path endpoint instead of the animation loop start.
function clampFraction(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

// cleanSmallNumber removes floating-point negative zero and tiny deltas before
// they reach atan2, which keeps horizontal chevrons from randomly flipping
// between PI and -PI.
function cleanSmallNumber(value) {
  return Math.abs(value) < SCREEN_TANGENT_EPSILON ? 0 : value;
}

// resolveChevronSpacingMeters converts the authoring-friendly spacing request
// into Cesium's meter-based world coordinates. The arrow paths are sampled as
// Cartesian3 positions in Earth-fixed meters, so spacing chevrons by path length
// keeps the visual rhythm tied to real shipyard distance rather than pixels.
export function resolveChevronSpacingMeters(options = {}) {
  const spacingMeters = Number(options.spacingMeters);

  if (Number.isFinite(spacingMeters) && spacingMeters > 0) {
    return spacingMeters;
  }

  const spacingYards = Number(
    options.spacingYards ?? DEFAULT_FLOW_CHEVRON_OPTIONS.spacingYards,
  );
  const resolvedSpacingYards =
    Number.isFinite(spacingYards) && spacingYards > 0
      ? spacingYards
      : DEFAULT_FLOW_CHEVRON_OPTIONS.spacingYards;

  return resolvedSpacingYards * METERS_PER_YARD;
}

// buildPathMetrics converts the sampled Cesium arrow positions into cumulative
// segment lengths. Chevrons use these metrics to space themselves by distance
// along the exact same line strip rendered by PolylineGraphics.
export function buildPathMetrics(positions = []) {
  const segments = [];
  let totalLength = 0;

  for (let index = 0; index < positions.length - 1; index += 1) {
    const startLength = totalLength;
    const length = Cesium.Cartesian3.distance(
      positions[index],
      positions[index + 1],
    );
    totalLength += length;
    segments.push({
      startIndex: index,
      endIndex: index + 1,
      startLength,
      endLength: totalLength,
      length,
    });
  }

  return { positions, segments, totalLength };
}

// computeChevronCountForPathLength derives chevron count from real sampled path
// length instead of using a fixed per-arrow count. The nearest whole count keeps
// every gap on a given arrow equal while staying close to the requested spacing.
export function computeChevronCountForPathLength(
  pathLengthMeters,
  spacingMeters,
) {
  if (!Number.isFinite(pathLengthMeters) || pathLengthMeters <= 0) return 0;

  return Math.max(
    1,
    Math.round(
      pathLengthMeters / resolveChevronSpacingMeters({ spacingMeters }),
    ),
  );
}

// interpolatePathPosition samples a Cartesian position at a normalized path
// distance. It intentionally accepts precomputed metrics so animation does not
// recalculate segment lengths for every chevron on every frame.
export function interpolatePathPosition(pathMetrics, fraction) {
  const positions = pathMetrics.positions ?? [];

  if (positions.length === 0) return undefined;
  if (positions.length === 1 || pathMetrics.totalLength <= 0) {
    return Cesium.Cartesian3.clone(positions[0]);
  }

  const targetLength = clampFraction(fraction) * pathMetrics.totalLength;
  const segment =
    pathMetrics.segments.find(
      (candidate) => targetLength <= candidate.endLength,
    ) ?? pathMetrics.segments.at(-1);
  const localLength = targetLength - segment.startLength;
  const localFraction = segment.length > 0 ? localLength / segment.length : 0;

  return Cesium.Cartesian3.lerp(
    positions[segment.startIndex],
    positions[segment.endIndex],
    localFraction,
    new Cesium.Cartesian3(),
  );
}

// buildPathTangentPositions samples a short centered segment around the chevron
// rather than using only a forward point. This follows curved routes more
// closely and still handles chevrons near the start or end of an arrow path.
export function buildPathTangentPositions(pathMetrics, fraction, leadFraction) {
  const clampedFraction = clampFraction(fraction);
  const clampedLead = Math.max(leadFraction, SCREEN_TANGENT_EPSILON);
  let fromFraction = Math.max(0, clampedFraction - clampedLead);
  let toFraction = Math.min(1, clampedFraction + clampedLead);

  if (toFraction - fromFraction < SCREEN_TANGENT_EPSILON) {
    if (clampedFraction <= 0) {
      toFraction = Math.min(1, clampedLead);
    } else {
      fromFraction = Math.max(0, 1 - clampedLead);
    }
  }

  return {
    from: interpolatePathPosition(pathMetrics, fromFraction),
    to: interpolatePathPosition(pathMetrics, toFraction),
  };
}

// screenTangentToBillboardRotation converts Cesium window-coordinate deltas into
// billboard rotation. Cesium's SceneTransforms.worldToWindowCoordinates returns
// browser-style window coordinates: x increases to the right, y increases down
// from the top-left corner. Billboard rotation is applied in the billboard's
// screen plane around its center; with alignedAxis set to Cartesian3.ZERO, the
// billboard remains screen-facing and the rotation behaves like a normal
// counter-clockwise angle in a y-up plane.
//
// The chevron SVG is drawn pointing to the right when rotation is 0. That means
// the correct rotation is simply the path tangent angle after converting the
// y-down window delta to a y-up delta. Examples:
// - screen tangent left-to-right: delta=(+x, 0) => 0 radians, chevron points right.
// - screen tangent bottom-to-top: delta=(0, -y window) => +PI/2, chevron points up.
// - screen tangent top-to-bottom: delta=(0, +y window) => -PI/2, chevron points down.
export function screenTangentToBillboardRotation(
  screenFrom,
  screenTo,
  fallbackRotation = 0,
) {
  if (!screenFrom || !screenTo) return fallbackRotation;

  // Invert the y delta because Cesium's window coordinates are y-down, but the
  // billboard rotation angle needs a y-up screen-plane tangent for atan2.
  const deltaX = cleanSmallNumber(screenTo.x - screenFrom.x);
  const deltaYUp = cleanSmallNumber(-(screenTo.y - screenFrom.y));

  if (
    !Number.isFinite(deltaX) ||
    !Number.isFinite(deltaYUp) ||
    (deltaX === 0 && deltaYUp === 0)
  ) {
    return fallbackRotation;
  }

  return Math.atan2(deltaYUp, deltaX);
}

// buildChevronStyle gathers the visual state for active and inactive arrows in
// one place so CalloutManager only has to pass the current route state.
export function buildChevronStyle(options = {}) {
  const active = options.active ?? false;

  return {
    spacingMeters: resolveChevronSpacingMeters(options),
    alpha: active
      ? (options.activeAlpha ?? DEFAULT_FLOW_CHEVRON_OPTIONS.activeAlpha)
      : (options.inactiveAlpha ?? DEFAULT_FLOW_CHEVRON_OPTIONS.inactiveAlpha),
    scale: active
      ? (options.activeScale ?? DEFAULT_FLOW_CHEVRON_OPTIONS.activeScale)
      : (options.inactiveScale ?? DEFAULT_FLOW_CHEVRON_OPTIONS.inactiveScale),
    colorCss: active
      ? (options.activeColor ?? DEFAULT_FLOW_CHEVRON_OPTIONS.activeColor)
      : (options.color ?? DEFAULT_FLOW_CHEVRON_OPTIONS.color),
    pulseAlpha: active
      ? (options.pulseAlpha ?? DEFAULT_FLOW_CHEVRON_OPTIONS.pulseAlpha)
      : 0,
    pulseScale: active
      ? (options.pulseScale ?? DEFAULT_FLOW_CHEVRON_OPTIONS.pulseScale)
      : 0,
  };
}

// buildChevronEntityId gives the standalone chevron entities stable ids that
// are traceable to their source arrow while avoiding collisions with arrow ids.
function buildChevronEntityId(arrowId, index) {
  return `${arrowId}-flow-chevron-${index}`;
}

// hashToUnitInterval staggers animation phases between arrows. This avoids a
// synchronized blinking effect while preserving deterministic rendering.
function hashToUnitInterval(value) {
  let hash = 0;

  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return (hash % 1000) / 1000;
}

// colorWithAlpha converts route CSS colors into Cesium colors on demand so
// animation can vary alpha without mutating shared Color instances.
function colorWithAlpha(colorCss, alpha) {
  return Cesium.Color.fromCssColorString(colorCss).withAlpha(
    Math.min(Math.max(alpha, 0), 1),
  );
}

// FlowChevronLayer owns repeated chevron billboards that ride on top of the
// existing curved-arrow paths. It is deliberately isolated from the Cesium arrow
// material so the overlay can be toggled or removed without route rewrites.
export class FlowChevronLayer {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.options = { ...DEFAULT_FLOW_CHEVRON_OPTIONS, ...options };
    this.enabled = this.options.enabled;
    this.arrowSources = new Map();
    this.arrowRecords = new Map();
    this.phase = 0;
    this.lastTickTime = undefined;
    this.boundUpdate = (clock) => this.update(clock?.currentTime);

    if (this.viewer.clock?.onTick?.addEventListener) {
      this.viewer.clock.onTick.addEventListener(this.boundUpdate);
    }
  }

  // setEnabled toggles the whole chevron overlay. Disabling removes billboard
  // entities immediately while leaving the underlying blue/green arrows intact.
  setEnabled(enabled) {
    this.enabled = enabled;

    if (!enabled) {
      this.removeAll();
      return;
    }

    for (const [arrowId, source] of this.arrowSources) {
      this.renderArrow(arrowId, source.positions, source.options);
    }
  }

  // syncArrow creates or updates chevrons for one arrow using the arrow's
  // already-sampled polyline positions, preserving the current route geometry.
  syncArrow(arrowId, positions, options = {}) {
    if (options.enabled === false || (positions?.length ?? 0) < 2) {
      this.removeArrow(arrowId);
      return;
    }

    this.arrowSources.set(arrowId, { positions, options });

    if (!this.enabled) {
      this.removeArrow(arrowId, { forgetSource: false });
      return;
    }

    this.renderArrow(arrowId, positions, options);
  }

  // renderArrow handles the billboard entity lifecycle for one remembered arrow
  // path. syncArrow owns source updates; setEnabled can call this to rehydrate.
  renderArrow(arrowId, positions, options = {}) {
    const style = buildChevronStyle({ ...this.options, ...options });
    const existingRecord = this.arrowRecords.get(arrowId);
    const record = existingRecord ?? {
      arrowId,
      entities: [],
      phaseOffset: hashToUnitInterval(arrowId),
    };

    record.pathMetrics = buildPathMetrics(positions);
    record.style = style;
    record.chevronCount = computeChevronCountForPathLength(
      record.pathMetrics.totalLength,
      record.style.spacingMeters,
    );
    record.active = options.active ?? false;
    this.arrowRecords.set(arrowId, record);
    this.resizeRecord(record);
    this.updateRecord(record);
  }

  // removeArrow clears only the chevrons that belong to one source arrow. This
  // is used when transient stop arrows are cleared between slides.
  removeArrow(arrowId, options = {}) {
    if (options.forgetSource ?? true) {
      this.arrowSources.delete(arrowId);
    }

    const record = this.arrowRecords.get(arrowId);
    if (!record) return;

    for (const entity of record.entities) {
      this.viewer.entities.remove(entity);
    }

    this.arrowRecords.delete(arrowId);
  }

  // removeAll clears the standalone overlay while preserving the main callout
  // manager's point labels, polygons, arrows, and debug polylines.
  removeAll() {
    for (const arrowId of Array.from(this.arrowRecords.keys())) {
      this.removeArrow(arrowId, { forgetSource: false });
    }
  }

  // destroy removes the clock listener and entities for future teardown paths,
  // including tests and potential hot-reload cleanup.
  destroy() {
    if (this.viewer.clock?.onTick?.removeEventListener) {
      this.viewer.clock.onTick.removeEventListener(this.boundUpdate);
    }

    this.removeAll();
    this.arrowSources.clear();
  }

  // resizeRecord keeps entity count aligned with sampled route distance. Longer
  // arrows get more chevrons and shorter arrows get fewer, which keeps the
  // visible spacing near the requested real-world yard distance.
  resizeRecord(record) {
    while (record.entities.length < record.chevronCount) {
      record.entities.push(
        this.createChevronEntity(record, record.entities.length),
      );
    }

    while (record.entities.length > record.chevronCount) {
      const entity = record.entities.pop();
      this.viewer.entities.remove(entity);
    }
  }

  // createChevronEntity builds one billboard entity. The SVG always points
  // right, so rotation 0 is intentionally the "flow to the right" orientation.
  // updateRecord then replaces rotation every tick with the current local path
  // tangent converted into Cesium's billboard rotation convention.
  createChevronEntity(record, index) {
    const position = interpolatePathPosition(
      record.pathMetrics,
      index / Math.max(record.chevronCount, 1),
    );

    return this.viewer.entities.add({
      id: buildChevronEntityId(record.arrowId, index),
      position,
      billboard: {
        image: CHEVRON_IMAGE,
        color: colorWithAlpha(record.style.colorCss, record.style.alpha),
        scale: record.style.scale,
        rotation: 0,
        // alignedAxis ZERO tells Cesium to keep the billboard screen-facing and
        // measure rotation in the screen plane. This is important: using a world
        // axis such as UNIT_Z would make rotation depend on camera/earth
        // orientation, while these chevrons need to track the visible 2D path
        // direction on screen.
        alignedAxis: Cesium.Cartesian3.ZERO,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  // update advances the moving chevrons. Cesium clock time is preferred so the
  // effect remains smooth during camera flights and live presentation playback.
  update(currentTime) {
    if (!this.enabled) return;

    const elapsedSeconds = this.readElapsedSeconds(currentTime);
    this.phase = loopFraction(this.phase + elapsedSeconds * this.options.speed);

    for (const record of this.arrowRecords.values()) {
      this.updateRecord(record);
    }
  }

  // readElapsedSeconds handles the first tick and test doubles that do not
  // provide JulianDate instances without interrupting static chevron placement.
  readElapsedSeconds(currentTime) {
    if (!currentTime || !this.lastTickTime) {
      this.lastTickTime = currentTime;
      return 1 / 60;
    }

    let elapsedSeconds = 0;

    try {
      elapsedSeconds = Cesium.JulianDate.secondsDifference(
        currentTime,
        this.lastTickTime,
      );
    } catch {
      elapsedSeconds = 0;
    }

    this.lastTickTime = currentTime;
    return Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0
      ? elapsedSeconds
      : 0;
  }

  // updateRecord moves, rotates, and optionally pulses all chevrons for one
  // arrow. Positions are sampled from the exact line strip used by the arrow.
  updateRecord(record) {
    const count = Math.max(record.entities.length, 1);

    record.entities.forEach((entity, index) => {
      const travelFraction = loopFraction(
        record.phaseOffset + this.phase + index / count,
      );
      const position = interpolatePathPosition(
        record.pathMetrics,
        travelFraction,
      );
      // A centered tangent samples both sides of the chevron on the curved path.
      // That better matches the local curve direction than using only a point
      // ahead of the chevron, especially near bends and near the path endpoint.
      const tangentPositions = buildPathTangentPositions(
        record.pathMetrics,
        travelFraction,
        this.options.rotationLeadFraction,
      );
      const pulse = this.computePulse(record, index);

      entity.position = position;
      entity.billboard.rotation = this.computeRotation(
        tangentPositions.from,
        tangentPositions.to,
        entity.billboard.rotation,
      );
      entity.billboard.scale =
        record.style.scale + pulse * record.style.pulseScale;
      entity.billboard.color = colorWithAlpha(
        record.style.colorCss,
        record.style.alpha + pulse * record.style.pulseAlpha,
      );
    });
  }

  // computePulse gives active chevrons the requested wave-like glow while
  // leaving inactive context routes steady and visually quieter.
  computePulse(record, index) {
    if (!record.active) return 0;

    return (
      (Math.sin(
        (this.phase * 2 + index / Math.max(record.entities.length, 1)) *
          Math.PI *
          2,
      ) +
        1) /
      2
    );
  }

  // computeRotation projects a local tangent segment into screen space and then
  // converts the y-down window delta into Cesium billboard rotation. This is the
  // bridge between the 3D route geometry and the 2D billboard: the path tangent
  // is measured after camera projection, so the chevron follows what the
  // presenter actually sees on screen. If a point is temporarily unprojectable,
  // keep the previous angle instead of snapping to zero or pointing backwards.
  computeRotation(fromPosition, toPosition, fallbackRotation = 0) {
    if (
      !this.viewer.scene ||
      !fromPosition ||
      !toPosition ||
      !Cesium.SceneTransforms?.worldToWindowCoordinates
    ) {
      return fallbackRotation;
    }

    const screenFrom = Cesium.SceneTransforms.worldToWindowCoordinates(
      this.viewer.scene,
      fromPosition,
    );
    const screenTo = Cesium.SceneTransforms.worldToWindowCoordinates(
      this.viewer.scene,
      toPosition,
    );

    return screenTangentToBillboardRotation(
      screenFrom,
      screenTo,
      fallbackRotation,
    );
  }
}
