import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTime, solveText } from './format'
import {
  average, best, bestAverageWindow, bestSingleIndex, mean, meanExec, meanMemo,
} from './stats'
import { effectiveMs, type Solve } from './types'
import type { AverageView } from './averageText'
import type { WcaEvent } from './events'

/** How long a figure stays lit after it becomes a record. */
const FLASH_MS = 2000

interface StatsPanelProps {
    solves: Solve[]
    decimals: 2 | 3
    event: WcaEvent
    /** Which session these solves came from. Only used to tell a new record
        apart from simply switching to a session that already had one. */
    sessionId: string
    /** Opens the solves behind one of the figures. Absent means the figures are
        text rather than controls, which is what the settings-page mock wants. */
    onOpenAverage?: (view: AverageView) => void
}

export default function StatsPanel(
  { solves, decimals, event, sessionId, onOpenAverage }: StatsPanelProps,
) {
    const latest = solves.length > 0 ? effectiveMs(solves[solves.length-1]) : NaN
    /** Multi-blind has no averages (WCA 9f12) and its single is cubes and time. */
    const multi = event.scramble.kind === 'mbf'

    // Memoised because the rail redraws on every clock tick and the best-window
    // search walks the whole session once per size — at a hundred that is twenty
    // times the ao5 shift, which is enough to be felt through the space bar.
    //
    // Every figure now carries the solves behind it, so the `best` column opens
    // the same way the `current` one does. The current *single* is the exception
    // and stays text: it is the last solve rather than a window over any.
    const rows = useMemo(() => {
      const singleAt = bestSingleIndex(solves)
      const last = solves[solves.length - 1]

      return [
        {
          label: 'single',
          current: latest,
          currentText: multi && last ? solveText(last, decimals) : null,
          currentWindow: null as Solve[] | null,
          record: best(solves),
          recordText: multi && singleAt >= 0 ? solveText(solves[singleAt], decimals) : null,
          recordWindow: singleAt >= 0 ? solves.slice(singleAt, singleAt + 1) : null,
        },
        ...(multi ? [] : [5, 12, 100]).map((size) => {
          const record = bestAverageWindow(solves, size)
          return {
            label: `ao${size}`,
            currentText: null,
            recordText: null,
            current: average(solves, size),
            currentWindow: solves.length >= size ? solves.slice(-size) : null,
            record: record.value,
            recordWindow:
              record.start >= 0 ? solves.slice(record.start, record.start + size) : null,
          }
        }),
      ]
    }, [solves, latest, multi, decimals])

    const lit = useNewBests(rows, solves.length, sessionId)

    function figure(
      label: string,
      value: number,
      window: Solve[] | null,
      recordOf: string | null,
      shown: string | null = null,
    ) {
      const text = shown ?? formatTime(value, decimals)
      if (!onOpenAverage || !window || Number.isNaN(value)) return text

      return (
        <button
          type="button"
          className="ao-open"
          onClick={() => onOpenAverage({ label: recordOf ?? label, solves: window, value })}
        >
          {text}
        </button>
      )
    }

  return (
    <>
      <table className="stats">
        <thead>
          <tr>
            <th />
            <th>current</th>
            <th>best</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{figure(row.label, row.current, row.currentWindow, null, row.currentText)}</td>
              <td className={lit.has(row.label) ? 'new-best' : undefined}>
                {figure(row.label, row.record, row.recordWindow, `best ${row.label}`, row.recordText)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="stats-foot">
        <span>{solves.length} solves</span>
        {!multi && <span>mean {formatTime(mean(solves), decimals)}</span>}
      </p>

      {event.split && (
        <p className="stats-foot">
          <span>memo {formatTime(meanMemo(solves), decimals)}</span>
          <span>exec {formatTime(meanExec(solves), decimals)}</span>
        </p>
      )}
    </>
  )
}

/**
 * Which figures just became records, for as long as that is worth showing.
 *
 * Three things this deliberately does not light up, because each of them is a
 * number changing rather than an achievement: the first render, where every
 * record is "new" only in the sense that nothing was on screen a moment ago;
 * switching session, for the same reason; and a record moving because a solve
 * was *deleted*, which lowers the bar rather than clearing it.
 */
function useNewBests(
  rows: { label: string; record: number }[],
  count: number,
  sessionId: string,
): Set<string> {
  const [lit, setLit] = useState<Set<string>>(() => new Set())
  const seen = useRef<{ sessionId: string; count: number; records: Map<string, number> } | null>(null)

  useEffect(() => {
    const records = new Map(rows.map((row) => [row.label, row.record]))
    const before = seen.current
    seen.current = { sessionId, count, records }

    const fresh = before && before.sessionId === sessionId && count === before.count + 1
    const beaten = !fresh ? []:rows
      .filter((row) => {
        const now = row.record
        const then = before.records.get(row.label)
        if (!Number.isFinite(now)) return false
        // An absent previous record means this is the first one of its size,
        // which is worth the same green as beating one.
        return then === undefined || !Number.isFinite(then) || now < then
      })
      .map((row) => row.label)

    setLit((prev) => (prev.size === 0 && beaten.length === 0 ? prev: new Set(beaten)))  
    if (beaten.length === 0) return

    const id = setTimeout(() => setLit(new Set()), FLASH_MS)
    return () => clearTimeout(id)
  }, [rows, count, sessionId])

  return lit
}
