import { useRef, type PointerEvent } from 'react'
import { clampPlace, type FrameBox } from './panelFit'

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
  onResize: (width: number, height: number) => void
  onMove: (right: number, bottom: number) => void
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
 * The scramble preview and the session graph both use this, so the two can't
 * drift apart in how they behave under the pointer.
 */
export function useFloatingPanel({
  width, height, right, bottom, minWidth, maxWidth, minHeight, maxHeight, frame, onResize, onMove,
}: FloatingPanelOptions) {
  const resizing = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const moving = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null)

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
    const size = resizing.current
    if (size) {
      // Dragging up and left makes it bigger, because the opposite corner is
      // the one that's pinned.
      onResize(
        Math.min(maxWidth, Math.max(minWidth, Math.round(size.width - (move.clientX - size.x)))),
        Math.min(maxHeight, Math.max(minHeight, Math.round(size.height - (move.clientY - size.y)))),
      )
      return
    }

    const from = moving.current
    if (!from) return
    // Right and bottom count inwards, so a drag right or down shrinks them.
    const next = clampPlace(
      from.right - (move.clientX - from.x),
      from.bottom - (move.clientY - from.y),
      { width, height },
      frame,
    )
    onMove(next.right, next.bottom)
  }

  function onPointerUp(up: PointerEvent<HTMLElement>) {
    resizing.current = null
    moving.current = null
    // Checked rather than assumed: a drag started on a child bubbles its release
    // up to a parent that never held the capture.
    if (up.currentTarget.hasPointerCapture(up.pointerId)) {
      up.currentTarget.releasePointerCapture(up.pointerId)
    }
  }

  return { startResize, startMove, onPointerMove, onPointerUp }
}
