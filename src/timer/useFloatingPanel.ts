import { useRef, type PointerEvent } from 'react'
import { boxOf, clampPlace, rectOf, type FrameBox } from './panelFit'
import { snapMove, snapResize, type SnapOptions } from './panelSnap'

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
  onResize: (width: number, height: number) => void
  onMove: (right: number, bottom: number) => void
}

function clampSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Dragging and resizing for the panels that float over the timer.
 *
 * Position is a gap from the right and bottom edges rather than a top-left
 * coordinate, so a panel keeps its relationship to the corner it started in
 * when the window changes size. It resizes from its top-left corner for the
 * same reason CSS `resize: both` is no use here: the dragged corner can't be
 * the pinned one, or the panel grows off the screen.
 *
 * The box it is given is the one already fitted to the window (panelFit), so a
 * drag starts from where the panel is drawn and saves where it visibly is. A
 * window that shrinks under a panel is handled there too, at render, rather
 * than here by rewriting the saved position.
 *
 * Holding ⌥ / Alt places it freely, whatever the snap setting says.
 *
 * Every floating box uses this, so none of them can drift from the others in
 * how it behaves under the pointer.
 */
export function useFloatingPanel({
  width, height, right, bottom, minWidth, maxWidth, minHeight, maxHeight, frame, snap,
  onResize, onMove,
}: FloatingPanelOptions) {
  const resizing = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const moving = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null)

  /** The snap to apply to this pointer event, or null for a free one. */
  function snapping(event: PointerEvent<HTMLElement>): SnapOptions | null {
    if (!snap || !snap.enabled || frame.width === 0 || event.altKey) return null
    return snap
  }

  function startResize(down: PointerEvent<HTMLElement>) {
    down.preventDefault()
    down.currentTarget.setPointerCapture(down.pointerId)
    resizing.current = { x: down.clientX, y: down.clientY, width, height }
  }

  function startMove(down: PointerEvent<HTMLElement>) {
    down.preventDefault()
    down.currentTarget.setPointerCapture(down.pointerId)
    moving.current = { x: down.clientX, y: down.clientY, right, bottom }
  }

  function onPointerMove(move: PointerEvent<HTMLElement>) {
    const pulled = snapping(move)
    const size = resizing.current
    if (size) {
      // Dragging up and left makes it bigger, because the opposite corner is
      // the one that's pinned.
      let nextWidth = clampSize(size.width - (move.clientX - size.x), minWidth, maxWidth)
      let nextHeight = clampSize(size.height - (move.clientY - size.y), minHeight, maxHeight)
      if (pulled) {
        const pinned = rectOf({ width, height, right, bottom }, frame)
        const snapped = snapResize(
          { ...pinned, left: pinned.right - nextWidth, top: pinned.bottom - nextHeight },
          pulled.others,
          frame,
        )
        nextWidth = clampSize(snapped.rect.right - snapped.rect.left, minWidth, maxWidth)
        nextHeight = clampSize(snapped.rect.bottom - snapped.rect.top, minHeight, maxHeight)
        pulled.onGuides({ guides: snapped.guides, matched: snapped.matched })
      } else {
        snap?.onGuides(null)
      }
      onResize(nextWidth, nextHeight)
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
    onMove(next.right, next.bottom)
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

  return { startResize, startMove, onPointerMove, onPointerUp }
}
