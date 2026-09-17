import { useRef, type PointerEvent } from 'react'
import { boxOf, clampPlace, rectOf, type FrameBox, type PanelBox, type Rect } from './panelFit'
import { snapMove, snapResize, type Edge, type SnapOptions } from './panelSnap'
import { PREVIEW_MARGIN } from './settings'

interface FloatingPanelOptions {
  width: number
  height: number
  right: number
  bottom: number
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  /** The room the panel is kept within — see panelFit. */
  frame: FrameBox
  /** What it pulls to while held — see panelSnap. Absent means it pulls to nothing. */
  snap?: SnapOptions
  /** Pinned where it is: presses that would move or resize it do nothing, and
      are left alone so a click on what they landed on still counts. */
  locked?: boolean
  /**
   * Every drag and resize, as the whole box it leaves behind. One call rather
   * than a size and a place, because a resize from the right or the bottom
   * changes both — and two calls, each spreading the same settings, would have
   * the second undo the first.
   */
  onChange: (box: PanelBox) => void
}

function clampSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function rounded(box: PanelBox): PanelBox {
  return {
    width: Math.round(box.width),
    height: Math.round(box.height),
    right: Math.round(box.right),
    bottom: Math.round(box.bottom),
  }
}

/**
 * Dragging and resizing for the panels that float over the timer.
 *
 * Position is a gap from the right and bottom edges rather than a top-left
 * coordinate, so a panel keeps its relationship to the corner it started in
 * when the window changes size.
 *
 * It resizes from any side or corner — see PanelEdges — with the sides not
 * being dragged held where they are.
 *
 * The box it is given is the one already fitted to the window (panelFit), so a
 * drag starts from where the panel is drawn and saves where it visibly is. A
 * window that shrinks under a panel is handled there too, at render, rather
 * than here by rewriting the saved position.
 *
 * A locked panel ignores both, and says so in what it returns, so the edges and
 * grips drawn for it can stand down too.
 *
 * Holding ⌥ / Alt places it freely, whatever the snap setting says.
 *
 * Every floating box uses this, so none of them can drift from the others in
 * how it behaves under the pointer.
 */
export function useFloatingPanel({
  width, height, right, bottom, minWidth, maxWidth, minHeight, maxHeight, frame, snap, locked = false,
  onChange,
}: FloatingPanelOptions) {
  const resizing = useRef<{ x: number; y: number; rect: Rect; edges: Edge[] } | null>(null)
  const moving = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null)

  /** The snap to apply to this pointer event, or null for a free one. */
  function snapping(event: PointerEvent<HTMLElement>): SnapOptions | null {
    if (!snap || !snap.enabled || frame.width === 0 || event.altKey) return null
    return snap
  }

  /** From the top-left corner unless told otherwise — the grip drawn there. */
  function startResize(down: PointerEvent<HTMLElement>, edges: Edge[] = ['left', 'top']) {
    if (locked) return
    down.preventDefault()
    down.currentTarget.setPointerCapture(down.pointerId)
    resizing.current = {
      x: down.clientX, y: down.clientY, edges, rect: rectOf({ width, height, right, bottom }, frame),
    }
  }

  function startMove(down: PointerEvent<HTMLElement>) {
    if (locked) return
    down.preventDefault()
    down.currentTarget.setPointerCapture(down.pointerId)
    moving.current = { x: down.clientX, y: down.clientY, right, bottom }
  }

  /**
   * The moving sides kept inside the frame and the box inside its size limits,
   * on the axes being dragged only — a panel fitted narrower than its minimum
   * by a small window isn't widened by someone dragging its top edge.
   */
  function sized(rect: Rect, edges: Edge[]): Rect {
    const next = { ...rect }
    const left = edges.includes('left')
    const top = edges.includes('top')
    const across = left || edges.includes('right')
    const upDown = top || edges.includes('bottom')
    if (frame.width > 0) {
      if (left) next.left = Math.max(frame.left, next.left)
      else if (across) next.right = Math.min(frame.width - PREVIEW_MARGIN, next.right)
      if (top) next.top = Math.max(0, next.top)
      else if (upDown) next.bottom = Math.min(frame.height - PREVIEW_MARGIN, next.bottom)
    }
    if (across) {
      const w = clampSize(next.right - next.left, minWidth, maxWidth)
      if (left) next.left = next.right - w
      else next.right = next.left + w
    }
    if (upDown) {
      const h = clampSize(next.bottom - next.top, minHeight, maxHeight)
      if (top) next.top = next.bottom - h
      else next.bottom = next.top + h
    }
    return next
  }

  function onPointerMove(move: PointerEvent<HTMLElement>) {
    const pulled = snapping(move)
    const size = resizing.current
    if (size) {
      const dx = move.clientX - size.x
      const dy = move.clientY - size.y
      const { edges, rect: from } = size
      let rect = sized({
        left: from.left + (edges.includes('left') ? dx : 0),
        right: from.right + (edges.includes('right') ? dx : 0),
        top: from.top + (edges.includes('top') ? dy : 0),
        bottom: from.bottom + (edges.includes('bottom') ? dy : 0),
      }, edges)
      if (pulled) {
        const snapped = snapResize(rect, edges, pulled.others, frame)
        rect = sized(snapped.rect, edges)
        pulled.onGuides({ guides: snapped.guides, matched: snapped.matched })
      } else {
        snap?.onGuides(null)
      }
      onChange(rounded(boxOf(rect, frame)))
      return
    }

    const from = moving.current
    if (!from) return
    // Right and bottom count inwards, so a drag right or down shrinks them.
    let next = clampPlace(
      from.right - (move.clientX - from.x),
      from.bottom - (move.clientY - from.y),
      { width, height },
      frame,
    )
    if (pulled) {
      const snapped = snapMove(rectOf({ width, height, ...next }, frame), pulled.others, frame)
      const box = boxOf(snapped.rect, frame)
      next = clampPlace(box.right, box.bottom, { width, height }, frame)
      pulled.onGuides({ guides: snapped.guides, matched: [] })
    } else {
      snap?.onGuides(null)
    }
    onChange({ width, height, ...next })
  }

  function onPointerUp(up: PointerEvent<HTMLElement>) {
    const held = resizing.current !== null || moving.current !== null
    resizing.current = null
    moving.current = null
    if (held) snap?.onGuides(null)
    // Checked rather than assumed: a drag started on a child bubbles its release
    // up to a parent that never held the capture.
    if (up.currentTarget.hasPointerCapture(up.pointerId)) {
      up.currentTarget.releasePointerCapture(up.pointerId)
    }
  }

  return { locked, startResize, startMove, onPointerMove, onPointerUp }
}
