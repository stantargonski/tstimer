import { useEffect, useRef, type PointerEvent } from 'react'
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
 * The scramble preview and the session graph both use this, so the two can't
 * drift apart in how they behave under the pointer.
 */
export function useFloatingPanel({
  width, height, right, bottom, minWidth, maxWidth, minHeight, maxHeight, onResize, onMove,
}: FloatingPanelOptions) {
  const resizing = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const moving = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null)

  /** The furthest the panel may be pushed and still be grabbable. */
  function limits() {
    return {
      maxRight: Math.max(0, window.innerWidth - width - PREVIEW_MARGIN),
      maxBottom: Math.max(0, window.innerHeight - height - PREVIEW_MARGIN),
    }
  }

  function place(nextRight: number, nextBottom: number) {
    const { maxRight, maxBottom } = limits()
    onMove(
      Math.round(Math.min(maxRight, Math.max(PREVIEW_MARGIN, nextRight))),
      Math.round(Math.min(maxBottom, Math.max(PREVIEW_MARGIN, nextBottom))),
    )
  }

  // A window that shrinks under the panel would otherwise leave it stranded
  // off-screen with nothing left to grab.
  //
  // The handler is read out of a ref rather than being the dependency of the
  // effect: the timer re-renders on every frame of a running solve, and
  // re-subscribing to `resize` sixty times a second to pick up a number that
  // almost never changes is a lot of work to do for nothing.
  const reclamp = useRef(() => {})
  useEffect(() => {
    reclamp.current = () => place(right, bottom)
  })

  useEffect(() => {
    function onWindowResize() {
      reclamp.current()
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [])

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
    place(from.right - (move.clientX - from.x), from.bottom - (move.clientY - from.y))
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
