import { useMemo, useState } from 'react'
import { formatTime, solveText } from '../format'
import { bestAverage, bestSingleIndex, mean } from '../stats'
import { rankOf, type Session } from '../types'
import { eventOf } from '../events'

type Column = 'name' | 'event' | 'solves' | 'best' | 'ao5' | 'ao12' | 'mean'
interface Sort { column: Column; dir: 1 | -1 }

const HEADS: { column: Column; label: string }[] = [
  { column: 'name', label: 'session' },
  { column: 'event', label: 'event' },
  { column: 'solves', label: 'solves' },
  { column: 'best', label: 'best' },
  { column: 'ao5', label: 'best ao5' },
  { column: 'ao12', label: 'best ao12' },
  { column: 'mean', label: 'mean' },
]

interface Row {
  session: Session
  event: string
  /** What the row sorts and shows by; NaN is "—" and Infinity is DNF. */
  best: number
  bestText: string
  ao5: number
  ao12: number
  mean: number
}

/**
 * Text and numbers sort their own way; a DNF or an empty figure sorts last in
 * both directions, the same rule as the solve list.
 */
function compare(a: Row, b: Row, { column, dir }: Sort): number {
  if (column === 'name') return dir * a.session.name.localeCompare(b.session.name, undefined, { numeric: true })
  if (column === 'event') return dir * a.event.localeCompare(b.event)
  const x = column === 'solves' ? a.session.solves.length : a[column]
  const y = column === 'solves' ? b.session.solves.length : b[column]
  const xOk = Number.isFinite(x)
  const yOk = Number.isFinite(y)
  if (!xOk || !yOk) return xOk === yOk ? 0 : xOk ? -1 : 1
  return dir * (x - y)
}

interface SessionsTableProps {
  sessions: Session[]
  /** The session the page is showing, marked in the table. */
  current: string
  decimals: 2 | 3
  trimPercent: number
  onPick: (id: string) => void
}

/**
 * Every session side by side. Any heading sorts the table, and pressing it
 * again turns the order round; a row opens that session in the card below.
 */
export default function SessionsTable({
  sessions, current, decimals, trimPercent, onPick,
}: SessionsTableProps) {
  const [sort, setSort] = useState<Sort | null>(null)

  // Every figure for every session, once per change to the store rather than
  // once per sort — the best-window searches are the expensive part.
  const rows = useMemo<Row[]>(() => sessions.map((session) => {
    const multi = eventOf(session.event).scramble.kind === 'mbf'
    const at = bestSingleIndex(session.solves)
    const empty = session.solves.length === 0
    return {
      session,
      event: eventOf(session.event).short,
      best: empty ? NaN : at < 0 ? Infinity : rankOf(session.solves[at]),
      bestText: empty
        ? formatTime(NaN)
        : at < 0 ? formatTime(Infinity) : solveText(session.solves[at], decimals),
      ao5: multi ? NaN : bestAverage(session.solves, 5, trimPercent),
      ao12: multi ? NaN : bestAverage(session.solves, 12, trimPercent),
      mean: multi ? NaN : mean(session.solves),
    }
  }), [sessions, decimals, trimPercent])

  const ordered = useMemo(
    () => (sort ? [...rows].sort((a, b) => compare(a, b, sort)) : rows),
    [rows, sort],
  )

  function cycle(column: Column) {
    setSort((prev) => (prev?.column === column ? { column, dir: prev.dir === 1 ? -1 : 1 } : { column, dir: 1 }))
  }

  return (
    <div className="table-scroll">
      <table className="stats event-table sessions-table">
        <thead>
          <tr>
            {HEADS.map(({ column, label }) => {
              const on = sort?.column === column
              return (
                <th
                  key={column}
                  scope="col"
                  aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                >
                  <button
                    type="button"
                    className={on ? 'solve-sort on' : 'solve-sort'}
                    onClick={() => cycle(column)}
                  >
                    {label}
                    {on && <i>{sort.dir === 1 ? '▲' : '▼'}</i>}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => (
            <tr
              key={row.session.id}
              className={row.session.id === current ? 'picked' : undefined}
              onClick={() => onPick(row.session.id)}
            >
              <th scope="row">
                {/* The row's click, reachable by keyboard: Enter on the button
                    bubbles up to it. */}
                <button type="button" className="table-pick">
                  {row.session.name}
                </button>
              </th>
              <td>{row.event}</td>
              <td>{row.session.solves.length}</td>
              <td>{row.bestText}</td>
              <td>{formatTime(row.ao5, decimals)}</td>
              <td>{formatTime(row.ao12, decimals)}</td>
              <td>{formatTime(row.mean, decimals)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
