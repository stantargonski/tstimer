import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import { useFloatingPanel } from './useFloatingPanel'
import PanelEdges from './PanelEdges'
import type { FrameBox, PanelBox } from './panelFit'
import type { SnapOptions } from './panelSnap'
import {
  FLOAT_MAX_HEIGHT, FLOAT_MAX_WIDTH, FLOAT_MIN_HEIGHT, FLOAT_MIN_WIDTH,
} from './settings'

interface FloatingBoxProps {
  /** Its own class, beside `float-box`. */
  className: string
  /** What the title bar says, and what the resize grip is named for. */
  title: string
  box: PanelBox
  frame: FrameBox
  snap: SnapOptions
  /** Lit while another box is being resized to its size. */
  highlight: boolean
  onBox: (box: PanelBox) => void
  onDock: () => void
  /** Told how tall the box would be with nothing scrolled out of sight, for a
      box that is meant to be exactly as tall as what is in it. */
  onNaturalHeight?: (height: number) => void
  /** A row under the title bar that stays put while the body scrolls. */
  head?: ReactNode
  /** A row at the foot, likewise. */
  foot?: ReactNode
  children: ReactNode
}

/**
 * A part of the sidebar, taken out of it: the session stats, or the solve list.
 *
 * Moved by its title bar and resized from any side or corner, the way the
 * preview is — the same hook, so the same snapping — and put back into the
 * sidebar by the ⧉ at the end of the title bar.
 */
export default function FloatingBox({
  className, title, box, frame, snap, highlight, onBox, onDock, onNaturalHeight,
  head, foot, children,
}: FloatingBoxProps) {
  const panel = useFloatingPanel({
    ...box,
    minWidth: FLOAT_MIN_WIDTH,
    maxWidth: FLOAT_MAX_WIDTH,
    minHeight: FLOAT_MIN_HEIGHT,
    maxHeight: FLOAT_MAX_HEIGHT,
    frame,
    snap,
    onChange: onBox,
  })

  const outerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // Read out of a ref so the observer below is set up once, not every render.
  const report = useRef(onNaturalHeight)
  useEffect(() => {
    report.current = onNaturalHeight
  })
  const measured = onNaturalHeight !== undefined

  useEffect(() => {
    const outer = outerRef.current
    const body = bodyRef.current
    const content = contentRef.current
    if (!measured || !outer || !body || !content) return
    const observer = new ResizeObserver(() => {
      // Everything that isn't the body — title, head, foot, padding, border —
      // and then all of what the body holds rather than what it shows.
      report.current?.(Math.ceil(outer.offsetHeight - body.clientHeight + content.offsetHeight))
    })
    observer.observe(content)
    observer.observe(outer)
    return () => observer.disconnect()
  }, [measured])

  function grab(down: PointerEvent<HTMLElement>) {
    // The dock button is in the title bar, and a press on it is a click.
    if (down.target instanceof Element && down.target.closest('button')) return
    panel.startMove(down)
  }

  return (
    <div
      ref={outerRef}
      className={`float-box ${className}${highlight ? ' size-match' : ''}`}
      style={{ width: box.width, height: box.height, right: box.right, bottom: box.bottom }}
    >
      <PanelEdges panel={panel} />
      <button
        type="button"
        className="preview-grip"
        title="drag to resize"
        aria-label={`resize the ${title}`}
        onPointerDown={panel.startResize}
        onPointerMove={panel.onPointerMove}
        onPointerUp={panel.onPointerUp}
        onPointerCancel={panel.onPointerUp}
      />

      <div
        className="float-title"
        title="drag to move"
        onPointerDown={grab}
        onPointerMove={panel.onPointerMove}
        onPointerUp={panel.onPointerUp}
        onPointerCancel={panel.onPointerUp}
      >
        {title}
        <button
          type="button"
          className="float-dock"
          title="back into the sidebar"
          aria-label={`put the ${title} back into the sidebar`}
          onClick={onDock}
        >
          ⧉
        </button>
      </div>

      {head && <div className="float-head">{head}</div>}
      <div ref={bodyRef} className="float-body">
        <div ref={contentRef}>{children}</div>
      </div>
      {foot && <div className="float-foot">{foot}</div>}
    </div>
  )
}
