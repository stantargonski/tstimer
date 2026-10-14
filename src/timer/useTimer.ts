import { useEffect, useRef, useState } from 'react'
import type { Penalty } from './types'

/**
 *  idle → holding → ready ─┬─→ running → idle                     (3x3, no inspection)
 *                          ├─→ memo → running → idle              (blindfolded)
 *                          └─→ inspecting → holding → ready → …   (inspection on)
 *
 * Escape is the way back out of that last row: from inspection, or from the
 * hold that arms it, it returns to idle without recording anything.
 *
 * The BLD split is a phase rather than a `hasSplit` boolean beside `running`:
 * a boolean would make four combinations, two of which are nonsense, and every
 * branch would have to rule them out. Inspection is a phase for the same reason
 * — it has its own clock, its own colour and its own key handling.
 */
export type Phase = 'idle' | 'inspecting' | 'holding' | 'ready' | 'memo' | 'running'

const MODIFIERS = ['Shift', 'Control', 'Meta', 'CapsLock']

/** WCA: over fifteen seconds is +2, over seventeen is a DNF. */
const INSPECT_MS = 15_000
const INSPECT_DNF_MS = 17_000

export interface TimerOptions {
    holdMs?: number
    /** Time memo separately from execution — every blindfolded event. */
    split?: boolean
    /** Run a 15-second inspection before the solve. */
    inspection?: boolean
    /**
     * Whether the space bar runs the clock at all.
     *
     * Off for typed entry, where there is no clock on screen to run: the phase
     * would still advance on a space pressed outside the entry box, hiding the
     * interface for a solve nobody can see is in progress and that no key can
     * end once focus lands back in the box.
     */
    enabled?: boolean
}

export function useTimer(
    onStop: (ms: number, memoMs: number | null, penalty: Penalty) => void,
    { holdMs = 400, split = false, inspection = false, enabled = true }: TimerOptions = {},
) {
    const [phase , setPhase] = useState<Phase>('idle')
    const [memoMs, setMemoMs] = useState<number | null>(null)
    /**
     * When the solve and the inspection began, for the clock to count from.
     *
     * Not a running total: one updated every frame re-rendered everything that
     * holds this hook — the whole timer, solve list and charts included — sixty
     * times a second for as long as you solved. `<LiveClock>` reads these and
     * runs its own frame loop. Inspection's is 0 when there is none.
     */
    const [since, setSince] = useState({ solve: 0, inspection: 0 })

    // The handlers read the refs, which are current the instant they're set.
    const startedAt = useRef(0)
    const memoAt = useRef(0)        // absolute split time; 0 means not split yet
    const inspectAt = useRef(0)
    const stop = useRef(onStop)

    useEffect(() => {
        stop.current = onStop
    })

    const penalty = useRef<Penalty>('none')

    useEffect(() => {
        /** Whatever inspection cost you, decided the moment the solve begins. */
        function inspectionPenalty(): Penalty {
            if (!inspection || inspectAt.current === 0) return 'none'
            const elapsed = performance.now() - inspectAt.current
            if (elapsed >= INSPECT_DNF_MS) return 'dnf'
            return elapsed >= INSPECT_MS ? 'plus2' : 'none'
        }

        function onKeyDown(event: KeyboardEvent) {
            // Never hijack keys aimed at something you can type into.
            const active = document.activeElement
            if (
                active instanceof HTMLInputElement ||
                active instanceof HTMLTextAreaElement ||
                active instanceof HTMLSelectElement
            ) return

            // Ctrl/Cmd combos stay the browser's — reload, devtools, tab switching.
            if (event.ctrlKey || event.metaKey) return

            // Auto-repeat is nothing to act on, but a repeated space is still a
            // space: left to the browser it scrolls whatever is under the mouse,
            // so a long hold walks the solve list down its own rail. This sits
            // below the guards above rather than at the top of the handler, so a
            // space held down in a text field is still the field's own.
            if (event.repeat) {
                if (event.code === 'Space') event.preventDefault()
                return
            }

            // Inspection you have thought better of. Nothing is recorded and
            // nothing asks for the next scramble, so the one you were inspecting
            // is still the one in the banner — which is the whole point of an
            // escape hatch rather than a DNF.
            if (event.key === 'Escape' && (phase === 'inspecting' || inspectAt.current > 0)) {
                event.preventDefault()
                inspectAt.current = 0
                setSince((was) => ({ ...was, inspection: 0 }))
                setPhase('idle')
                return
            }

            if (phase === 'memo') {
                if (MODIFIERS.includes(event.key)) return

                event.preventDefault()
                memoAt.current = performance.now()
                setMemoMs(memoAt.current - startedAt.current)
                setPhase('running')
                return
            }

            if (phase === 'running') {
                // Any key stops it. You've just put the cube down and your hands
                // aren't where they started; hunting for the space bar costs time.
                if (MODIFIERS.includes(event.key)) return

                event.preventDefault()
                const elapsed = performance.now() - startedAt.current
                setPhase('idle')
                stop.current(
                    elapsed,
                    memoAt.current > 0 ? memoAt.current - startedAt.current : null,
                    penalty.current,
                )
                return
            }

            // Starting is still space only, so stray typing can't arm the timer.
            if (event.code !== 'Space') return
            if (active instanceof HTMLButtonElement) active.blur()
            event.preventDefault()

            // Space from idle either begins inspection or begins the hold. The
            // clock is deliberately NOT reset here: the time you just did stays
            // up until the next solve actually starts, so you can still read it
            // while you pick the cube up.
            if (phase === 'idle') {
                if (inspection) {
                    inspectAt.current = performance.now()
                    setSince((was) => ({ ...was, inspection: inspectAt.current }))
                    setPhase('inspecting')
                } else {
                    setPhase('holding')
                }
            } else if (phase === 'inspecting') {
                setPhase('holding')
            }
        }
        function onKeyUp(event: KeyboardEvent) {
            if (event.code !== 'Space') return
            event.preventDefault()

            if (phase === 'ready') {
                penalty.current = inspectionPenalty()
                inspectAt.current = 0
                // Both halves of "not inspecting" cleared together: the display
                // reads the elapsed time, so a leftover one would show a hold
                // counting down fifteen seconds that nobody started.
                startedAt.current = performance.now()
                setSince({ solve: startedAt.current, inspection: 0 })
                memoAt.current = 0
                setMemoMs(null)
                setPhase(split ? 'memo' : 'running')
            } else if (phase === 'holding') {
                // Letting go early goes back where it came from, so an aborted
                // hold during inspection doesn't restart the fifteen seconds.
                setPhase(inspection && inspectAt.current > 0 ? 'inspecting' : 'idle')
            }
        }
        // A space released in another window never reaches this one, so a hold
        // left behind by Cmd-Tab would sit armed and start the clock on your next
        // press. Losing focus counts as letting go early.
        function onLeave() {
            if (phase === 'holding' || phase === 'ready') {
                setPhase(inspection && inspectAt.current > 0 ? 'inspecting' : 'idle')
            }
        }
        if (!enabled) return

        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('keyup', onKeyUp)
        window.addEventListener('blur', onLeave)
        document.addEventListener('visibilitychange', onLeave)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('blur', onLeave)
            document.removeEventListener('visibilitychange', onLeave)
        }
    }, [phase, split, inspection, enabled])

    useEffect(() => {
        if (phase !== 'holding') return
        const id = setTimeout(() => setPhase('ready'), holdMs)
        return () => clearTimeout(id)
    }, [phase, holdMs])

    // Inspection is still on through the hold and the armed pause that end it —
    // getting ready is part of your fifteen seconds, not a break in them.
    const inspecting = phase === 'inspecting'
        || ((phase === 'holding' || phase === 'ready') && since.inspection > 0)

    return { phase, memoMs, since, inspecting }
}

export { INSPECT_MS, INSPECT_DNF_MS }
