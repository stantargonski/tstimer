import { PREVIEW_MARGIN } from './settings';

/**
 * Where the floating panels actually go, given the room there is to put them.
 *
 * The settings hold where a panel was last put and how big it was made. This is
 * what that comes to on the window you have now: shrunk to fit beside the rail,
 * kept off the rail, and — when a small window pushes the graph onto the
 * preview — stacked above it rather than on top of it.
 *
 * None of it is written back. A window that shrinks and grows again puts every
 * panel back where it was, because the saved place was never touched.
 */

/** A panel's size, and its gap from the frame's right and bottom edges. */
export interface PanelBox {
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/** The timer frame, and how much of its left side the rail takes. */
export interface FrameBox {
  width: number;
  height: number;
  left: number;
}

/** The gap a panel keeps from the frame's edges when it has to shrink. */
export const FIT_GAP = 16;
/** The gap kept between the graph and the preview when one is moved off the other. */
export const STACK_GAP = 12;
/** The narrowest the graph is drawn to fit beside the preview. Any narrower and
    it goes above the preview instead, at its own width. */
export const BESIDE_MIN = 160;

/**
 * A position kept within the frame: never past the rail on the left or above
 * the frame at the top. The right and bottom edges still allow PREVIEW_MARGIN,
 * so a panel can be tucked partly off-screen as before.
 *
 * An unmeasured frame — width 0, before the first layout — clamps nothing.
 */
export function clampPlace(
  right: number, bottom: number, box: Pick<PanelBox, 'width' | 'height'>, frame: FrameBox,
): { right: number; bottom: number } {
  if (frame.width === 0) return { right, bottom };
  const maxRight = Math.max(PREVIEW_MARGIN, frame.width - frame.left - box.width);
  const maxBottom = Math.max(PREVIEW_MARGIN, frame.height - box.height);
  return {
    right: Math.round(Math.min(maxRight, Math.max(PREVIEW_MARGIN, right))),
    bottom: Math.round(Math.min(maxBottom, Math.max(PREVIEW_MARGIN, bottom))),
  };
}

/** A panel shrunk to fit beside the rail, and placed within the frame. */
export function fitPanel(box: PanelBox, frame: FrameBox): PanelBox {
  if (frame.width === 0) return box;
  const width = Math.max(0, Math.min(box.width, frame.width - frame.left - 2 * FIT_GAP));
  const height = Math.max(0, Math.min(box.height, frame.height - 2 * FIT_GAP));
  return { width, height, ...clampPlace(box.right, box.bottom, { width, height }, frame) };
}

/** Whether two boxes placed from the same corner cover any of the same ground. */
export function overlaps(a: PanelBox, b: PanelBox): boolean {
  return a.right < b.right + b.width && b.right < a.right + a.width
    && a.bottom < b.bottom + b.height && b.bottom < a.bottom + a.height;
}

/**
 * The graph moved clear of the preview, when the window is what put it there.
 *
 * Only when the fitted boxes overlap and the saved ones do not: a graph dragged
 * over the preview on purpose is where it was asked to be, and moving it would
 * also fight the drag that put it there.
 *
 * Beside the preview first, narrowed to the room there is, because that keeps
 * it down in the corner below the clock. Above the preview only when beside
 * would leave it too thin to read — which on a short window puts it over the
 * side of the clock, but a graph over the clock can be moved and a graph over
 * the cube hides the thing you are about to solve.
 */
export function clearOf(
  graph: PanelBox, preview: PanelBox,
  storedGraph: PanelBox, storedPreview: PanelBox,
  frame: FrameBox,
): PanelBox {
  if (!overlaps(graph, preview) || overlaps(storedGraph, storedPreview)) return graph;

  const besideRight = preview.right + preview.width + STACK_GAP;
  const room = frame.width - frame.left - FIT_GAP - besideRight;
  if (room >= BESIDE_MIN) {
    const width = Math.min(graph.width, room);
    return { ...graph, width, ...clampPlace(besideRight, preview.bottom, { ...graph, width }, frame) };
  }

  return {
    ...graph,
    ...clampPlace(preview.right, preview.bottom + preview.height + STACK_GAP, graph, frame),
  };
}
