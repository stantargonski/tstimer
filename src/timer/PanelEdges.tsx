import type { PointerEvent } from 'react'
import type { Edge } from './panelSnap'
import type { useFloatingPanel } from './useFloatingPanel'

type Panel = ReturnType<typeof useFloatingPanel>

const HANDLES: { name: string; edges: Edge[] }[] = [
  { name: 'n', edges: ['top'] },
  { name: 's', edges: ['bottom'] },
  { name: 'e', edges: ['right'] },
  { name: 'w', edges: ['left'] },
  { name: 'nw', edges: ['top', 'left'] },
  { name: 'ne', edges: ['top', 'right'] },
  { name: 'sw', edges: ['bottom', 'left'] },
  { name: 'se', edges: ['bottom', 'right'] },
]

/**
 * Invisible strips along a floating box's four sides and squares at its
 * corners, each resizing it from there the way a window's edge does. The grip
 * drawn in the top-left corner stays, as the one you can see.
 *
 * Every press and move stops here: the graph is moved by a press anywhere on
 * it, and a resize that reached it as well would also be a move.
 */
export default function PanelEdges({ panel }: { panel: Panel }) {
  const own = (handler: (event: PointerEvent<HTMLElement>) => void) =>
    (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation()
      handler(event)
    }

  return (
    <>
      {HANDLES.map(({ name, edges }) => (
        <span
          key={name}
          className={`panel-edge ${name}`}
          aria-hidden="true"
          onPointerDown={own((down) => panel.startResize(down, edges))}
          onPointerMove={own(panel.onPointerMove)}
          onPointerUp={own(panel.onPointerUp)}
          onPointerCancel={own(panel.onPointerUp)}
        />
      ))}
    </>
  )
}
