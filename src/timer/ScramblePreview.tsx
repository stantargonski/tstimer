import { useMemo } from 'react'
import { solvedCube, stateAfter } from '../cube/nxn'
import { NetView } from '../cube/CubeView'
import type { WcaEvent } from './events'
import type { Scramble } from './scramble'
import { PREVIEW_MAX, PREVIEW_MIN } from './settings'
import { useFloatingPanel } from './useFloatingPanel'

interface ScramblePreviewProps {
  event: WcaEvent
  scramble: Scramble
  width: number
  height: number
  right: number
  bottom: number
  onResize: (width: number, height: number) => void
  onMove: (right: number, bottom: number) => void
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
  event, scramble, width, height, right, bottom, onResize, onMove, onReset,
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
    onResize,
    onMove,
  })

  return (
    <div className="scramble-preview" style={{ width, height, right, bottom }}>
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

      <span
        className="preview-title"
        title="drag to move"
        onPointerDown={panel.startMove}
        onPointerMove={panel.onPointerMove}
        onPointerUp={panel.onPointerUp}
        onPointerCancel={panel.onPointerUp}
      >
        {event.short} scramble

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
