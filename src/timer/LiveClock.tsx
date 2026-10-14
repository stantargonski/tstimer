import { useEffect, useState } from 'react'
import { clockPhase, clockText } from './display'
import type { Decimals } from './format'
import type { RunningDisplay } from './settings'
import type { Phase } from './useTimer'

/** `performance.now()`, re-read every frame while `active` and left alone otherwise. */
function useFrameClock(active: boolean): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!active) return
    let id = 0
    function tick() {
      setNow(performance.now())
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [active])
  return now
}

/**
 * The big clock, and the only thing that re-renders every frame of a solve.
 *
 * It runs its own frame loop from the start times `useTimer` hands it, so the
 * timer around it — solve list, stats, graph — renders when the phase changes
 * and not sixty times a second while the clock counts.
 */
export default function LiveClock({ phase, since, inspecting, restingMs, decimals, runningDisplay }: {
  phase: Phase
  since: { solve: number; inspection: number }
  inspecting: boolean
  /** What to read when not timing: the session's last solve. */
  restingMs: number
  decimals: Decimals
  runningDisplay: RunningDisplay
}) {
  const timing = phase === 'running' || phase === 'memo'
  const now = useFrameClock(timing || inspecting)

  // A `now` left over from before this solve or inspection began reads as the
  // very start of it, never as a negative.
  const ms = timing ? Math.max(0, now - since.solve) : restingMs
  // Kept above zero while inspecting: `display` reads a zero in a hold as a
  // plain hold with no inspection behind it.
  const inspectMs = inspecting ? Math.max(1, now - since.inspection) : 0

  return (
    <div className={`clock ${clockPhase(phase, inspectMs)}`}>
      {clockText({ phase, ms, inspectMs, decimals, runningDisplay })}
    </div>
  )
}
