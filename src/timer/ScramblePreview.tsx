import { useMemo } from 'react'
import { solvedCube, stateAfter } from '../cube/nxn'
import { NetView } from '../cube/CubeView'
import type { WcaEvent } from './events'
import type { Scramble } from './scramble'
import { PREVIEW_MAX, PREVIEW_MIN } from './settings'
import { useFloatingPanel } from './useFloatingPanel'
import type { FrameBox, PanelBox } from './panelFit'
import PanelEdges from './PanelEdges'
import LockButton from './LockButton'
import type { SnapOptions } from './panelSnap'

interface ScramblePreviewProps {
  event: WcaEvent
  scramble: Scramble
  width: number
  height: number
  right: number
  bottom: number
  frame: FrameBox
  snap: SnapOptions
  /** Lit while another box is being resized to its size. */
  highlight: boolean
  /** Every move and resize, as the whole box. */
  onBox: (box: PanelBox) => void
  /** Its size before it was fitted to the window — see useFloatingPanel. */
  saved?: { width: number; height: number }
  /** Pinned in place — see useFloatingPanel. */
  locked: boolean
  onLock: () => void
  /** Back to the size and corner it ships at, after a drag has lost it. */
  onReset: () => void
}

/**
 * The scramble drawn as a cube.
 *
 * Every token is applied, the blindfolded events' trailing wide moves included:
 * those are turns rather than a way of holding the cube, so the picture is the
 * position you will actually pick up. A 3BLD preview with mixed colours on top
 * is correct, not broken.
 *
 * Moved by its title bar and resized from its top-left corner — see
 * useFloatingPanel for why it is placed from the bottom-right.
 */
export default function ScramblePreview({
  event, scramble, width, height, right, bottom, frame, snap, highlight, onBox, saved, locked, onLock, onReset,
}: ScramblePreviewProps) {
  const size = event.size ?? 3

  // The generators only emit tokens the engine knows, but an imported or
  // hand-typed scramble might not — and a preview is never worth blanking the
  // timer over. Fall back to a solved cube and let the text stand as the
  // source of truth.
  const state = useMemo(() => {
    if (event.preview !== 'nxn') return null
    try {
      return stateAfter(size, scramble.moves)
    } catch {
      return solvedCube(size)
    }
  }, [event.preview, size, scramble])

  const panel = useFloatingPanel({
    width,
    height,
    right,
    bottom,
    minWidth: PREVIEW_MIN,
    maxWidth: PREVIEW_MAX,
    minHeight: PREVIEW_MIN,
    maxHeight: PREVIEW_MAX,
    frame,
    snap,
    locked,
    saved,
    onChange: onBox,
  })

  return (
    <div
      className={`scramble-preview${highlight ? ' size-match' : ''}${locked ? ' locked' : ''}`}
      style={{ width, height, right, bottom }}
    >
      {!locked && (
        <button
          type="button"
          className="preview-grip"
          title="drag to resize"
          aria-label="resize the scramble preview"
          onPointerDown={panel.startResize}
          onPointerMove={panel.onPointerMove}
          onPointerUp={panel.onPointerUp}
          onPointerCancel={panel.onPointerUp}
        />
      )}

      <PanelEdges panel={panel} />

      <span
        className="preview-title"
        title={locked ? undefined : 'drag to move'}
        onPointerDown={panel.startMove}
        onPointerMove={panel.onPointerMove}
        onPointerUp={panel.onPointerUp}
        onPointerCancel={panel.onPointerUp}
      >
        {event.short} scramble

        <LockButton locked={locked} name="scramble preview" onToggle={onLock} />

        <button
          type="button"
          className="preview-reset"
          title="back to the default position"
          aria-label="move the scramble preview back to its default position"
          // The title bar is the drag handle, so the press that starts this
          // click would otherwise start a drag underneath it.
          onPointerDown={(down) => down.stopPropagation()}
          onClick={onReset}
        >
          ⟲
        </button>
      </span>

      <div className="preview-body">
        {state
          ? <NetView state={state} size={size} label={`${event.name} scramble`} />
          : <p className="preview-none">No preview for {event.name} yet — the scramble above is the whole of it.</p>}
      </div>
    </div>
  )
}
