import { useEffect, useState, type ReactNode } from 'react'
import type { Scramble } from './scramble'
import { scrambleText } from './scramble'
import type { ScrambleClick } from './settings'

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
  /** The event picker, rendered above the scramble. */
  children?: ReactNode
}

export default function ScrambleBanner({
  scramble, canGoBack, onLast, onNext, action, flat, mono, showHead = true, children,
}: ScrambleBannerProps) {
  const [copied, setCopied] = useState(false)

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

    </div>
  )
}
