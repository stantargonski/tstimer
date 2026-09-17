import { PREVIEW_MARGIN } from './settings';

/**
 * Where the floating panels actually go, given the room there is to put them.
 *
 * The settings hold where a panel was last put and how big it was made. This is
 * what that comes to on the window you have now: shrunk to fit beside the rail,
 * kept off the rail, and — when a small window pushes the graph onto the
 * preview — moved clear of it rather than left on top of it.
 *
 * Where a panel is put never changes its size. One dragged over the clock covers
 * the clock; shrinking is only for a window with no room for the panel at all.
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

/** The timer frame; how much of its left side the rail takes; and how far down
    the scramble bar reaches, which is where the free space starts. */
export interface FrameBox {
  width: number;
  height: number;
  left: number;
  top: number;
  /**
   * How far down the rail reaches. With only the stats docked the rail ends
   * under them, and the frame's left edge below that is free. Absent means the
   * rail runs the frame's full height.
   */
  railBottom?: number;
}

/** A box in the frame's own coordinates, measured from its top-left. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The gap a panel keeps from the frame's edges when it has to shrink. */
export const FIT_GAP = 16;
/** The gap kept between two boxes moved off each other, or snapped side by side. */
export const STACK_GAP = 12;
/** The narrowest the graph is drawn to fit beside the preview. Any narrower and
    it goes above the preview instead, at its own width. */
export const BESIDE_MIN = 160;

export function rectOf(box: PanelBox, frame: FrameBox): Rect {
  const right = frame.width - box.right;
  const bottom = frame.height - box.bottom;
  return { left: right - box.width, top: bottom - box.height, right, bottom };
}

export function boxOf(rect: Rect, frame: FrameBox): PanelBox {
  return {
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    right: frame.width - rect.right,
    bottom: frame.height - rect.bottom,
  };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * How far left a box whose top is at `top` may go: clear of the rail while any
 * of it would sit beside the rail, and the frame's own edge once all of it is
 * below the rail.
 */
export function leftEdge(frame: FrameBox, top: number): number {
  const railBottom = frame.railBottom ?? frame.height;
  return top < railBottom + STACK_GAP ? frame.left : 0;
}

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
  const maxBottom = Math.max(PREVIEW_MARGIN, frame.height - box.height);
  const placedBottom = Math.round(Math.min(maxBottom, Math.max(PREVIEW_MARGIN, bottom)));
  const top = frame.height - placedBottom - box.height;
  const maxRight = Math.max(PREVIEW_MARGIN, frame.width - leftEdge(frame, top) - box.width);
  return {
    right: Math.round(Math.min(maxRight, Math.max(PREVIEW_MARGIN, right))),
    bottom: placedBottom,
  };
}

export interface FitOptions {
  /** The clock and everything hanging off it, in frame coordinates. */
  keepOut?: Rect | null;
}

/** A panel shrunk to fit beside the rail and placed within the frame. */
export function fitPanel(box: PanelBox, frame: FrameBox): PanelBox {
  if (frame.width === 0) return box;
  const room = frame.width - leftEdge(frame, rectOf(box, frame).top) - 2 * FIT_GAP;
  const width = Math.max(0, Math.min(box.width, room));
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
 * it down in the corner below the clock. Above the preview only when that is
 * clear of both the preview and the clock; failing both, it stays where it was.
 */
export function clearOf(
  graph: PanelBox, preview: PanelBox,
  storedGraph: PanelBox, storedPreview: PanelBox,
  frame: FrameBox,
  { keepOut = null }: FitOptions = {},
): PanelBox {
  if (!overlaps(graph, preview) || overlaps(storedGraph, storedPreview)) return graph;

  const besideRight = preview.right + preview.width + STACK_GAP;
  const room = frame.width - leftEdge(frame, rectOf(preview, frame).top) - FIT_GAP - besideRight;
  if (room >= BESIDE_MIN) {
    const width = Math.min(graph.width, room);
    return { ...graph, width, ...clampPlace(besideRight, preview.bottom, { ...graph, width }, frame) };
  }

  const above = {
    ...graph,
    ...clampPlace(preview.right, preview.bottom + preview.height + STACK_GAP, graph, frame),
  };
  // Clamped back down onto the preview, or up onto the clock: neither is clear.
  if (overlaps(above, preview)) return graph;
  if (keepOut && intersects(rectOf(above, frame), keepOut)) return graph;
  return above;
}

/** A floating box that has never been put anywhere: at the top-left of the
    space beside the rail, `top` down from the top of the frame. */
export function floatAt(frame: FrameBox, width: number, height: number, top: number): PanelBox {
  const left = frame.left + FIT_GAP;
  return boxOf({ left, top, right: left + width, bottom: top + height }, frame);
}
