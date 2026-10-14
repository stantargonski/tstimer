import { useMemo, useState } from 'react'
import { formatTime, solveText } from '../format'
import { bestAverage, bestSingleIndex, byDay, durationText, mean, totalTime } from '../stats'
import type { Solve } from '../types'
import type { WcaEvent } from '../events'

/** How many days are shown before "show more", and how many more it adds. */
const PAGE = 30

/** `2026-10-13` as the day it names, in the reader's own words for it. */
function dayText(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

interface DailyTableProps {
  /** The session's solves, already cut to the page's time window. */
  solves: Solve[]
  event: WcaEvent
  decimals: 2 | 3
  trimPercent: number
}

/**
 * One row per day you solved on, newest first: how many, the best, the mean,
 * the best ao5 and how long it took.
 *
 * Days are local, the same days the activity calendar colours, so a late
 * session stays on the evening it happened.
 */
export default function DailyTable({ solves, event, decimals, trimPercent }: DailyTableProps) {
  const days = useMemo(() => byDay(solves), [solves])
  const [shown, setShown] = useState(PAGE)
  const multi = event.scramble.kind === 'mbf'

  if (days.length === 0) return <p className="chart-empty">No solves in this window.</p>

  return (
    <>
      <div className="table-scroll">
        <table className="stats event-table daily-table">
          <thead>
            <tr>
              <th scope="col">day</th>
              <th scope="col">solves</th>
              <th scope="col">best</th>
              <th scope="col">mean</th>
              <th scope="col">best ao5</th>
              <th scope="col">time</th>
            </tr>
          </thead>
          <tbody>
            {days.slice(0, shown).map(({ day, solves: list }) => {
              const at = bestSingleIndex(list)
              return (
                <tr key={day}>
                  <th scope="row">{dayText(day)}</th>
                  <td>{list.length}</td>
                  <td>{at < 0 ? formatTime(Infinity) : solveText(list[at], decimals)}</td>
                  <td>{multi ? formatTime(NaN) : formatTime(mean(list), decimals)}</td>
                  <td>{multi ? formatTime(NaN) : formatTime(bestAverage(list, 5, trimPercent), decimals)}</td>
                  <td>{durationText(totalTime(list))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {days.length > shown && (
        <div className="table-more">
          <button type="button" onClick={() => setShown(shown + PAGE)}>
            show more ({days.length - shown} more days)
          </button>
        </div>
      )}
    </>
  )
}
