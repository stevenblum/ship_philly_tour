import * as Cesium from "cesium";
import {
  DEFAULT_ARROW_CONTROL_HEIGHT_M,
  resolveArrowControlOffset,
} from "./arrowControlOffset.js";
import { FlowChevronLayer } from "./flowChevronLayer.js";
import { logger } from "./logger.js";
import { scaleShipGraphVisual } from "./visualScale.js";

// sampleCurvedArrowPositions turns author-friendly control points into the
// dense line strip Cesium needs to render a smooth 3D directional arrow.
export function sampleCurvedArrowPositions(arrow) {
  if ((arrow.coordinates?.length ?? 0) < 3) {
    logger.warn(
      `Curved arrow ${arrow.id} needs at least three control points.`,
    );
    return [];
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

  return Array.from({ length: sampleCount }, (_, index) => {
    const time = (index / (sampleCount - 1)) * maxTime;
    return spline.evaluate(time);
  });
}

// buildCurvedArrowPolylineConfig creates a Cesium entity polyline config from
// arrow data while keeping plain debug polylines separate from directional UI.
// The active option supports the presentation requirement that the current
// narrated route turns green while the full process-flow route remains visible.
export function buildCurvedArrowPolylineConfig(arrow, options = {}) {
  const active = options.active ?? false;
  const inactiveWidth = arrow.width ?? 7;
  const activeWidth = arrow.activeWidth ?? Math.max(inactiveWidth + 2, 7);
  const color = Cesium.Color.fromCssColorString(
    active ? (arrow.activeColor ?? "#35f27a") : (arrow.color ?? "#53d8ff"),
  );

  return {
    positions: sampleCurvedArrowPositions(arrow),
    // Scale only the rendered line width. Authored arrow widths remain stable
    // route metadata while the presentation can enlarge the visible graph.
    width: scaleShipGraphVisual(active ? activeWidth : inactiveWidth),
    material: new Cesium.PolylineArrowMaterialProperty(color),
    arcType: Cesium.ArcType.NONE,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

// resolvePointLabelHeightReference keeps ordinary shop markers anchored to the
// visible surface while still allowing rare authored callouts to request an
// absolute altitude for cinematic or debugging use.
export function resolvePointLabelHeightReference(callout) {
  if (callout.heightReference === "none") {
    return Cesium.HeightReference.NONE;
  }

  if (callout.heightReference === "relativeToGround") {
    return Cesium.HeightReference.RELATIVE_TO_GROUND;
  }

  return Cesium.HeightReference.CLAMP_TO_GROUND;
}

// sampleRenderedSurfaceHeight asks Cesium for the currently rendered terrain or
// 3D Tiles height at the shop coordinate. Point labels use HeightReference
// clamping inside Cesium's renderer; arrows need this explicit sample because
// PolylineGraphics positions are fixed Cartesian coordinates.
function sampleRenderedSurfaceHeight(scene, callout, options = {}) {
  if (!scene) return undefined;

  const cartographic = Cesium.Cartographic.fromDegrees(
    callout.lon,
    callout.lat,
    callout.height ?? 0,
  );
  const sampleWidthM = options.sampleWidthM ?? 1;

  if (
    scene.sampleHeightSupported !== false &&
    typeof scene.sampleHeight === "function"
  ) {
    try {
      const sampledHeight = scene.sampleHeight(
        cartographic,
        undefined,
        sampleWidthM,
      );

      if (Number.isFinite(sampledHeight)) return sampledHeight;
    } catch (error) {
      logger.debug("Scene height sample failed for arrow endpoint.", error);
    }
  }

  if (
    scene.clampToHeightSupported !== false &&
    typeof scene.clampToHeight === "function"
  ) {
    try {
      const clampedPosition = scene.clampToHeight(
        Cesium.Cartesian3.fromRadians(
          cartographic.longitude,
          cartographic.latitude,
          cartographic.height,
        ),
        undefined,
        sampleWidthM,
      );

      if (clampedPosition) {
        return Cesium.Cartographic.fromCartesian(clampedPosition).height;
      }
    } catch (error) {
      logger.debug("Scene height clamp failed for arrow endpoint.", error);
    }
  }

  return undefined;
}

// resolveSurfaceAnchoredCoordinate mirrors point-label height-reference rules
// for arrow endpoints. Ordinary clamped shop labels use rendered surface
// heights when available, relative-to-ground labels add their authored offset
// above that surface, and absolute labels keep their explicit altitude.
export function resolveSurfaceAnchoredCoordinate(
  viewer,
  callout,
  options = {},
) {
  const heightReference = resolvePointLabelHeightReference(callout);
  const authoredHeight = callout.height ?? 0;

  if (heightReference === Cesium.HeightReference.NONE) {
    return [callout.lon, callout.lat, authoredHeight];
  }

  const sampledHeight = sampleRenderedSurfaceHeight(
    viewer?.scene,
    callout,
    options,
  );
  const surfaceHeight = sampledHeight ?? authoredHeight;
  const height =
    heightReference === Cesium.HeightReference.RELATIVE_TO_GROUND
      ? surfaceHeight + authoredHeight
      : surfaceHeight;

  return [callout.lon, callout.lat, height];
}

// buildPointLabelStyle keeps active and inactive marker styling in one place so
// the persistent shop-label layer can update emphasis without recreating
// entities on every tour stop change.
function buildPointLabelStyle(callout, active = false) {
  const activeColor = callout.activeColor ?? "#35f27a";
  const inactiveColor = callout.color ?? "#53d8ff";
  const pointSize = active
    ? (callout.activePixelSize ?? 17)
    : (callout.pixelSize ?? 10);
  const fontSize = active ? 17 : 15;

  return {
    pointColor: Cesium.Color.fromCssColorString(
      active ? activeColor : inactiveColor,
    ),
    labelColor: active
      ? Cesium.Color.fromCssColorString(activeColor)
      : Cesium.Color.WHITE,
    pointSize: scaleShipGraphVisual(pointSize),
    pointOutlineWidth: scaleShipGraphVisual(2),
    labelOutlineWidth: scaleShipGraphVisual(3),
    labelPixelOffset: -scaleShipGraphVisual(18),
    font: active
      ? `bold ${scaleShipGraphVisual(fontSize)}px sans-serif`
      : `${scaleShipGraphVisual(fontSize)}px sans-serif`,
  };
}

// buildPointLabelEntityConfig centralizes point and label graphics so tests can
// verify the surface-clamping contract without constructing a live Cesium
// Viewer. Cesium treats CLAMP_TO_GROUND as terrain-and-3D-Tiles clamping when
// the active 3D Tileset has collision enabled.
export function buildPointLabelEntityConfig(callout, options = {}) {
  const heightReference = resolvePointLabelHeightReference(callout);
  const style = buildPointLabelStyle(callout, options.active ?? false);

  return {
    id: callout.id,
    position: Cesium.Cartesian3.fromDegrees(
      callout.lon,
      callout.lat,
      callout.height ?? 0,
    ),
    point: {
      pixelSize: style.pointSize,
      color: style.pointColor,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: style.pointOutlineWidth,
      heightReference,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: callout.label,
      font: style.font,
      fillColor: style.labelColor,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: style.labelOutlineWidth,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, style.labelPixelOffset),
      heightReference,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  };
}

// CalloutManager owns persistent shop labels plus transient stop graphics. Shop
// labels stay visible for layout context, while active stop labels update style
// and arrows/polygons/debug lines still clear between stops.
export class CalloutManager {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.baseCallouts = options.baseCallouts ?? [];
    this.baseArrows = options.baseArrows ?? [];
    this.basePointIds = new Set(this.baseCallouts.map((callout) => callout.id));
    this.baseArrowIds = new Set(this.baseArrows.map((arrow) => arrow.id));
    this.pointEntities = new Map();
    this.arrowEntities = new Map();
    this.transientPointIds = new Set();
    this.transientArrowIds = new Set();
    this.activeEntities = [];
    this.currentStop = undefined;
    this.currentActiveArrowIds = new Set();
    const flowChevronOptions = options.flowChevronOptions ?? {};
    this.flowChevronLayer = new FlowChevronLayer(viewer, {
      ...flowChevronOptions,
      enabled: options.enableFlowChevrons ?? flowChevronOptions.enabled ?? true,
    });
  }

  // clear removes transient stop graphics and authored non-base point labels
  // while preserving the persistent shop-label layer.
  clear() {
    for (const entity of this.activeEntities) {
      this.viewer.entities.remove(entity);
    }

    for (const arrowId of this.transientArrowIds) {
      this.flowChevronLayer.removeArrow(arrowId);
      this.arrowEntities.delete(arrowId);
    }

    for (const pointId of this.transientPointIds) {
      const entityRecord = this.pointEntities.get(pointId);

      if (entityRecord) {
        this.viewer.entities.remove(entityRecord.entity);
        this.pointEntities.delete(pointId);
      }
    }

    this.updatePointLabelStates(new Set());
    this.activeEntities = [];
    this.transientPointIds = new Set();
    this.transientArrowIds = new Set();
  }

  // ensurePointLabel creates a point-label entity once and stores the source
  // callout so active/inactive styling can be reapplied later without changing
  // the entity's position or clamping behavior.
  ensurePointLabel(callout, persistent = false) {
    const existingRecord = this.pointEntities.get(callout.id);

    if (existingRecord) {
      return existingRecord.entity;
    }

    const entity = this.viewer.entities.add(
      buildPointLabelEntityConfig(callout),
    );
    this.pointEntities.set(callout.id, { callout, entity });

    if (!persistent) {
      this.transientPointIds.add(callout.id);
    }

    return entity;
  }

  // ensureBasePointLabels initializes the persistent KML-derived shop and yard
  // label layer the first time graphics are shown.
  ensureBasePointLabels() {
    for (const callout of this.baseCallouts) {
      const entity = this.ensurePointLabel(callout, true);
      entity.show = true;
    }
  }

  // setBasePointLabelsVisible lets special overview layers, such as the final
  // full GIS slide, hide the tour's persistent shop labels without destroying
  // their clamped entity records.
  setBasePointLabelsVisible(visible) {
    for (const pointId of this.basePointIds) {
      const entityRecord = this.pointEntities.get(pointId);

      if (entityRecord) {
        entityRecord.entity.show = visible;
      }
    }
  }

  // ensureBaseArrows initializes or restyles the persistent low production-flow
  // route so the full shipbuilding sequence stays visible while active segments
  // can turn green on a per-stop basis.
  ensureBaseArrows(activeArrowIds = new Set()) {
    for (const arrow of this.baseArrows) {
      this.ensureArrow(arrow, true, activeArrowIds.has(arrow.id));
    }
  }

  // setBaseArrowsVisible hides or restores the persistent production-flow layer
  // independently from transient stop arrows. Chevrons are removed while hidden
  // and recreated by ensureBaseArrows when ordinary slides are shown again.
  setBaseArrowsVisible(visible) {
    for (const arrowId of this.baseArrowIds) {
      const entity = this.arrowEntities.get(arrowId);

      if (entity) {
        entity.show = visible;
      }

      if (!visible) {
        this.flowChevronLayer.removeArrow(arrowId, { forgetSource: false });
      }
    }
  }

  // ensureActivePointLabels adds any authored stop-specific labels that are not
  // part of the persistent shop layer, preserving future custom callouts.
  ensureActivePointLabels(callouts) {
    for (const callout of callouts) {
      this.ensurePointLabel(callout, this.basePointIds.has(callout.id));
    }
  }

  // applyPointLabelState mutates only visual emphasis. It leaves position and
  // heightReference untouched so labels remain clamped to terrain or 3D Tiles.
  applyPointLabelState(entityRecord, active) {
    const style = buildPointLabelStyle(entityRecord.callout, active);

    entityRecord.entity.point.pixelSize = style.pointSize;
    entityRecord.entity.point.color = style.pointColor;
    entityRecord.entity.point.outlineWidth = style.pointOutlineWidth;
    entityRecord.entity.label.font = style.font;
    entityRecord.entity.label.fillColor = style.labelColor;
    entityRecord.entity.label.outlineWidth = style.labelOutlineWidth;
    entityRecord.entity.label.pixelOffset = new Cesium.Cartesian2(
      0,
      style.labelPixelOffset,
    );
  }

  // updatePointLabelStates turns only explicit active labels green, larger, and
  // bold while returning context and inactive persistent labels to normal.
  updatePointLabelStates(activePointIds) {
    for (const [pointId, entityRecord] of this.pointEntities) {
      this.applyPointLabelState(entityRecord, activePointIds.has(pointId));
    }
  }

  // resolveReferencedArrow converts endpoint references into concrete sampled
  // coordinates at render time. This avoids storing duplicate endpoint
  // coordinates in arrow data, so moving a shop point also moves its arrows.
  resolveReferencedArrow(arrow) {
    if (arrow.coordinates) {
      return arrow;
    }

    const startRecord = this.pointEntities.get(arrow.startCalloutId);
    const endRecord = this.pointEntities.get(arrow.endCalloutId);

    if (!startRecord || !endRecord) {
      logger.warn(
        `Curved arrow ${arrow.id} references a missing point-label endpoint.`,
      );
      return undefined;
    }

    const start = resolveSurfaceAnchoredCoordinate(
      this.viewer,
      startRecord.callout,
      arrow.surfaceSampling,
    );
    const end = resolveSurfaceAnchoredCoordinate(
      this.viewer,
      endRecord.callout,
      arrow.surfaceSampling,
    );
    const controlOffset = resolveArrowControlOffset(start, end, arrow);
    const control = [
      (start[0] + end[0]) / 2 + (controlOffset.lonDeg ?? 0),
      (start[1] + end[1]) / 2 + (controlOffset.latDeg ?? 0),
      (start[2] + end[2]) / 2 +
        (controlOffset.heightM ?? DEFAULT_ARROW_CONTROL_HEIGHT_M),
    ];

    return {
      ...arrow,
      coordinates: [start, control, end],
    };
  }

  // ensureArrow creates persistent and transient curved-arrow entities without
  // duplicating base route arrows on every stop transition. Existing arrows are
  // restyled here because active route highlighting is a stop-level state.
  ensureArrow(arrow, persistent = false, active = false) {
    const resolvedArrow = this.resolveReferencedArrow(arrow);

    if (!resolvedArrow) {
      return undefined;
    }

    const polyline = buildCurvedArrowPolylineConfig(resolvedArrow, { active });

    if (polyline.positions.length === 0) return undefined;

    const existingEntity = this.arrowEntities.get(arrow.id);

    if (existingEntity) {
      existingEntity.show = true;
      existingEntity.polyline.positions = polyline.positions;
      existingEntity.polyline.width = polyline.width;
      existingEntity.polyline.material = polyline.material;
      this.syncArrowChevrons(arrow, polyline.positions, active);
      return existingEntity;
    }

    const entity = this.viewer.entities.add({
      id: arrow.id,
      polyline,
    });

    this.arrowEntities.set(arrow.id, entity);

    if (!persistent) {
      this.transientArrowIds.add(arrow.id);
      this.activeEntities.push(entity);
    }

    this.syncArrowChevrons(arrow, polyline.positions, active);

    return entity;
  }

  // syncArrowChevrons delegates repeated directional chevrons to a standalone
  // layer that follows the already-sampled arrow path and can be toggled off
  // without changing the route arrows themselves.
  syncArrowChevrons(arrow, positions, active = false) {
    this.flowChevronLayer.syncArrow(arrow.id, positions, {
      active,
      color: arrow.color,
      activeColor: arrow.activeColor,
    });
  }

  // setFlowChevronsEnabled exposes the standalone chevron overlay toggle for
  // future UI controls, authoring sessions, and tests.
  setFlowChevronsEnabled(enabled) {
    this.flowChevronLayer.setEnabled(enabled);
  }

  // refreshSurfaceAnchoredArrows resamples endpoint heights for existing route
  // arrows after the scene changes, such as when Google Photorealistic 3D Tiles
  // load or refine. It updates arrows and chevrons without resetting the
  // current slide, active labels, or camera state.
  refreshSurfaceAnchoredArrows() {
    if (!this.currentStop) return;

    const showBaseCallouts = this.currentStop.showBaseCallouts !== false;
    const showBaseArrows = this.currentStop.showBaseArrows !== false;

    if (showBaseCallouts) {
      this.ensureBasePointLabels();
    } else {
      this.setBasePointLabelsVisible(false);
    }

    if (showBaseArrows) {
      this.ensureBaseArrows(this.currentActiveArrowIds);
    } else {
      this.setBaseArrowsVisible(false);
    }

    for (const arrow of this.currentStop.arrows ?? []) {
      this.addCurvedArrow(arrow, this.currentActiveArrowIds.has(arrow.id));
    }
  }

  // showStopGraphics maps the tour data convention onto Cesium entity types:
  // persistent labels, highlighted zones, curved arrows, and fallback/debug
  // polylines.
  showStopGraphics(stop) {
    this.clear();
    const showBaseCallouts = stop.showBaseCallouts !== false;
    const showBaseArrows = stop.showBaseArrows !== false;

    if (showBaseCallouts) {
      this.ensureBasePointLabels();
    } else {
      this.setBasePointLabelsVisible(false);
    }

    // activeArrowIds is deliberately separate from activeCalloutIds so a stop
    // can highlight the route into the active shop without changing label
    // visibility or emphasis rules.
    const activeArrowIds = new Set(stop.activeArrowIds ?? []);
    this.currentStop = stop;
    this.currentActiveArrowIds = activeArrowIds;

    if (showBaseArrows) {
      this.ensureBaseArrows(activeArrowIds);
    } else {
      this.setBaseArrowsVisible(false);
    }

    const activeCallouts = stop.callouts ?? [];
    // activeCalloutIds is intentionally explicit so overview and context labels
    // never become green simply because they are visible.
    const activePointIds = new Set(stop.activeCalloutIds ?? []);
    this.ensureActivePointLabels(activeCallouts);
    this.updatePointLabelStates(activePointIds);

    for (const polygon of stop.polygons ?? []) {
      this.addPolygon(polygon);
    }

    for (const arrow of stop.arrows ?? []) {
      this.addCurvedArrow(arrow, activeArrowIds.has(arrow.id));
    }

    for (const polyline of stop.polylines ?? []) {
      this.addPolyline(polyline);
    }
  }

  // addPointLabel renders KML-derived and authored point labels with their
  // anchor point clamped to the current surface so dots do not float above shops.
  addPointLabel(callout) {
    const entity = this.ensurePointLabel(callout);

    return entity;
  }

  // addPolygon highlights production zones such as shop corridors or dock areas
  // without implying those polygons are surveyed boundaries.
  addPolygon(polygon) {
    const flatCoordinates = polygon.coordinates.flat();
    const color = Cesium.Color.fromCssColorString(polygon.color ?? "#53d8ff");
    const entity = this.viewer.entities.add({
      id: polygon.id,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoordinates),
        material: color.withAlpha(polygon.alpha ?? 0.25),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    });

    this.activeEntities.push(entity);
  }

  // addCurvedArrow renders directional callouts using sampled Catmull-Rom
  // points and Cesium's PolylineArrowMaterialProperty.
  addCurvedArrow(arrow, active = false) {
    this.ensureArrow(arrow, this.baseArrowIds.has(arrow.id), active);
  }

  // addPolyline is intentionally plain because polylines are reserved for
  // fallback/debug lines and should not be confused with directional arrows.
  addPolyline(polyline) {
    const flatCoordinates = polyline.coordinates.flat();
    const color = Cesium.Color.fromCssColorString(polyline.color ?? "#53d8ff");
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
}
