import { useRef, type PointerEvent } from 'react'

interface DragHandleProps {
  /** The direction it drags in: 'x' for a width, 'y' for a height. */
  axis: 'x' | 'y'
  className: string
  /** What it resizes, as its tooltip and its name for a screen reader. */
  label: string
  /** Called as the drag starts, so the owner can note what it started from. */
  onStart: () => void
  /** How far the pointer has moved along the axis since the drag started. */
  onDrag: (delta: number) => void
}

/**
 * A strip along an edge that resizes something when dragged: the sidebar's
 * width, the line between its stats and its list, the scramble bar's height.
 *
 * It reports distance rather than size, because only its owner knows what the
 * distance is a distance from — a width, a height, or a text size.
 */
export default function DragHandle({ axis, className, label, onStart, onDrag }: DragHandleProps) {
  const from = useRef<number | null>(null)
  const along = (event: PointerEvent<HTMLElement>) => (axis === 'x' ? event.clientX : event.clientY)

  function end(up: PointerEvent<HTMLElement>) {
    from.current = null
    if (up.currentTarget.hasPointerCapture(up.pointerId)) {
      up.currentTarget.releasePointerCapture(up.pointerId)
    }
  }

  return (
    <div
      className={`drag-handle ${axis} ${className}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={label}
      onPointerDown={(down) => {
        down.preventDefault()
        down.stopPropagation()
        down.currentTarget.setPointerCapture(down.pointerId)
        from.current = along(down)
        onStart()
      }}
      onPointerMove={(move) => {
        if (from.current !== null) onDrag(along(move) - from.current)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    />
  )
}
