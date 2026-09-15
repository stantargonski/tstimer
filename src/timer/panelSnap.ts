import { FIT_GAP, STACK_GAP, type FrameBox, type Rect } from './panelFit';

/**
 * Where a floating box is pulled to while it is dragged or resized.
 *
 * Moving, an edge within SNAP of a line lands on it: the margins of the space
 * beside the rail, the bottom of the scramble bar, and the edges of every other
 * box — lined up with them, or a STACK_GAP to one side. Resizing, the corner
 * being dragged pulls to those same lines and to the width or height of another
 * box, so two boxes can be made the same size without counting pixels.
 *
 * Pure, so every pull can be checked without a pointer — scripts/check-timer.ts.
 */

/** How close an edge has to come to a line to be pulled onto it. */
export const SNAP = 10;

export interface Guide {
  axis: 'x' | 'y';
  at: number;
}

/** What the timer draws while a box is held: the lines it snapped to, and the
    boxes whose size it matched. */
export interface SnapGuides {
  guides: Guide[];
  matched: string[];
}

export interface Other {
  id: string;
  rect: Rect;
}

export interface SnapOptions {
  enabled: boolean;
  others: Other[];
  onGuides: (guides: SnapGuides | null) => void;
}

interface Target {
  at: number;
  /** The box whose size this target matches, when it is a size rather than a line. */
  match?: string;
}

interface Pull {
  delta: number;
  target: Target;
}

/** The nearest target within SNAP of `edge`, as the distance to move to it. */
function pull(edge: number, targets: Target[]): Pull | null {
  let best: Pull | null = null;
  for (const target of targets) {
    const delta = target.at - edge;
    if (Math.abs(delta) > SNAP) continue;
    if (best === null || Math.abs(delta) < Math.abs(best.delta)) best = { delta, target };
  }
  return best;
}

function closer(a: Pull | null, b: Pull | null): Pull | null {
  if (!a) return b;
  if (!b) return a;
  return Math.abs(b.delta) < Math.abs(a.delta) ? b : a;
}

/**
 * The lines each edge may land on, per edge: a box's left edge lines up with
 * another's left edge or sits a gap to its right, never against its right edge
 * with no gap, which would read as the two touching by accident.
 */
function lines(frame: FrameBox, others: Other[]) {
  const at = (value: number): Target => ({ at: value });
  const left = [at(frame.left + FIT_GAP)];
  const right = [at(frame.width - FIT_GAP)];
  const top = [at(frame.top + FIT_GAP)];
  const bottom = [at(frame.height - FIT_GAP)];
  for (const { rect } of others) {
    left.push(at(rect.left), at(rect.right + STACK_GAP));
    right.push(at(rect.right), at(rect.left - STACK_GAP));
    top.push(at(rect.top), at(rect.bottom + STACK_GAP));
    bottom.push(at(rect.bottom), at(rect.top - STACK_GAP));
  }
  return { left, right, top, bottom };
}

/** Guides for the lines that were landed on; a matched size has none of its own. */
function guidesOf(x: Pull | null, y: Pull | null): Guide[] {
  const out: Guide[] = [];
  if (x && x.target.match === undefined) out.push({ axis: 'x', at: x.target.at });
  if (y && y.target.match === undefined) out.push({ axis: 'y', at: y.target.at });
  return out;
}

/** A box being dragged, moved onto the nearest line on each axis. Its size never changes. */
export function snapMove(rect: Rect, others: Other[], frame: FrameBox): SnapGuides & { rect: Rect } {
  const to = lines(frame, others);
  const x = closer(pull(rect.left, to.left), pull(rect.right, to.right));
  const y = closer(pull(rect.top, to.top), pull(rect.bottom, to.bottom));
  const dx = x?.delta ?? 0;
  const dy = y?.delta ?? 0;
  return {
    rect: { left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy },
    guides: guidesOf(x, y),
    matched: [],
  };
}

/** A side of a box. A corner is two of them. */
export type Edge = 'left' | 'right' | 'top' | 'bottom';

/**
 * A box being resized by `edges` — one side, or a corner's two. The other sides
 * stay put, so only the moving ones pull: onto a line, or to where they make the
 * box another box's width or height.
 */
export function snapResize(
  rect: Rect, edges: Edge[], others: Other[], frame: FrameBox,
): SnapGuides & { rect: Rect } {
  const to = lines(frame, others);
  const sizes = (at: (other: Rect) => number) =>
    others.map(({ id, rect: other }): Target => ({ at: at(other), match: id }));
  const width = (other: Rect) => other.right - other.left;
  const height = (other: Rect) => other.bottom - other.top;

  const left = edges.includes('left');
  const top = edges.includes('top');
  const x = left
    ? pull(rect.left, [...to.left, ...sizes((other) => rect.right - width(other))])
    : edges.includes('right')
      ? pull(rect.right, [...to.right, ...sizes((other) => rect.left + width(other))])
      : null;
  const y = top
    ? pull(rect.top, [...to.top, ...sizes((other) => rect.bottom - height(other))])
    : edges.includes('bottom')
      ? pull(rect.bottom, [...to.bottom, ...sizes((other) => rect.top + height(other))])
      : null;

  const next = { ...rect };
  if (x) next[left ? 'left' : 'right'] += x.delta;
  if (y) next[top ? 'top' : 'bottom'] += y.delta;
  return {
    rect: next,
    guides: guidesOf(x, y),
    matched: [x?.target.match, y?.target.match].filter((id): id is string => id !== undefined),
  };
}
