import type { PointerEvent, ReactNode } from 'react'
import { useFloatingPanel } from './useFloatingPanel'
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
  /** A row under the title bar that stays put while the body scrolls. */
  head?: ReactNode
  /** A row at the foot, likewise. */
  foot?: ReactNode
  children: ReactNode
}

/**
 * A part of the sidebar, taken out of it: the session stats, or the solve list.
 *
 * Moved by its title bar and resized from its top-left corner, the way the
 * preview is — the same hook, so the same snapping — and put back into the
 * sidebar by the ⧉ at the end of the title bar.
 */
export default function FloatingBox({
  className, title, box, frame, snap, highlight, onBox, onDock, head, foot, children,
}: FloatingBoxProps) {
  const panel = useFloatingPanel({
    ...box,
    minWidth: FLOAT_MIN_WIDTH,
    maxWidth: FLOAT_MAX_WIDTH,
    minHeight: FLOAT_MIN_HEIGHT,
    maxHeight: FLOAT_MAX_HEIGHT,
    frame,
    snap,
    onResize: (width, height) => onBox({ ...box, width, height }),
    onMove: (right, bottom) => onBox({ ...box, right, bottom }),
  })

  function grab(down: PointerEvent<HTMLElement>) {
    // The dock button is in the title bar, and a press on it is a click.
    if (down.target instanceof Element && down.target.closest('button')) return
    panel.startMove(down)
  }

  return (
    <div
      className={`float-box ${className}${highlight ? ' size-match' : ''}`}
      style={{ width: box.width, height: box.height, right: box.right, bottom: box.bottom }}
    >
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
      <div className="float-body">{children}</div>
      {foot && <div className="float-foot">{foot}</div>}
    </div>
  )
}
