import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Scramble } from './scramble'
import { scrambleText } from './scramble'
import { SCALE_MAX, SCALE_MIN, type ScrambleClick } from './settings'
import DragHandle from './DragHandle'

interface ScrambleBannerProps {
  scramble: Scramble
  canGoBack: boolean
  onLast: () => void
  onNext: () => void
  /** What a click on the scramble itself does. */
  action: ScrambleClick
  /** Sit straight on the background rather than in a panel of its own. */
  flat: boolean
  /** Monospaced, so the moves line up in columns. */
  mono: boolean
  /** The row above the scramble — the event picker and last / next. Off leaves
      the scramble alone on the bar. */
  showHead?: boolean
  /** The scramble's text size, as a percentage of stock. */
  scale?: number
  /**
   * Given, the bar's bottom edge can be dragged: down makes the scramble
   * bigger and the bar with it, up smaller. It is the text size setting, set by
   * hand — so the setting and the edge can never disagree about the size.
   */
  onScale?: (percent: number) => void
  /** The event picker, rendered above the scramble. */
  children?: ReactNode
}

export default function ScrambleBanner({
  scramble, canGoBack, onLast, onNext, action, flat, mono, showHead = true, scale = 100,
  onScale, children,
}: ScrambleBannerProps) {
  const [copied, setCopied] = useState(false)
  const textRef = useRef<HTMLButtonElement>(null)
  /** The size and height the drag started from. */
  const from = useRef({ scale, height: 1 })

  // The scramble's height grows with its text size, so the edge follows the
  // pointer when the size moves by the share of that height it was dragged.
  function drag(delta: number) {
    const start = from.current
    const next = Math.round(Math.min(
      SCALE_MAX, Math.max(SCALE_MIN, start.scale * (start.height + delta) / start.height),
    ))
    if (next !== scale) onScale?.(next)
  }

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(id)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(scrambleText(scramble))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const title = action === 'copy' ? 'click to copy'
    : action === 'next' ? 'click for the next scramble'
      : undefined

  function onClick() {
    if (action === 'copy') void copy()
    else if (action === 'next') onNext()
  }

  return (
    <div className={flat ? 'scramble-bar flat' : 'scramble-bar'}>
      {/* The nav sits with the picker rather than beside the scramble: both
          decide what you are about to solve, and neither is the scramble. */}
      {showHead && (
        <div className="scramble-head">
          {children}
          <div className="scramble-nav">
            <button type="button" onClick={onLast} disabled={!canGoBack}>‹ last</button>
            <button type="button" onClick={onNext}>next ›</button>
          </div>
        </div>
      )}

      <div className="scramble-body">
        <button
          ref={textRef}
          type="button"
          className={`scramble-text${copied ? ' copied' : ''}${mono ? ' mono' : ''}`}
          title={title}
          // A click target that does nothing shouldn't look like a click target.
          data-inert={action === 'none' ? 'true' : undefined}
          onClick={onClick}
        >
          {/* Megaminx and multi-blind come pre-broken into rows; everything else
              is a flat run of tokens that wraps wherever it needs to. */}
          {scramble.lines
            ? scramble.lines.map((line, index) => (
              <span key={index} className="scramble-line">{line}</span>
            ))
            : scramble.moves.map((move, index) => <span key={index}>{move}</span>)}
        </button>
      </div>

      {onScale && (
        <DragHandle
          axis="y"
          className="scramble-grip"
          label="drag to resize the scramble"
          onStart={() => {
            from.current = { scale, height: Math.max(1, textRef.current?.offsetHeight ?? 1) }
          }}
          onDrag={drag}
        />
      )}
    </div>
  )
}
