// SHIP_GRAPH_VISUAL_SCALE is the single presentation tuning knob for the
// shipyard process graph. It keeps shop markers, labels, arrows, chevrons, and
// MES graph objects in proportion when audience readability needs adjustment.
const SHIP_GRAPH_VISUAL_SCALE = 1.25;

// scaleShipGraphVisual applies the shared graph scale to dimensions that are
// already authored in screen-space units such as pixels, line widths, and
// billboard scales. It intentionally does not touch geographic coordinates or
// route spacing, so changing presentation readability never changes map layout.
export function scaleShipGraphVisual(value) {
  return value * SHIP_GRAPH_VISUAL_SCALE;
}
