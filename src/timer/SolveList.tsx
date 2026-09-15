import { useMemo, useState, type CSSProperties } from 'react'
import { formatTime } from './format'
import { rollingAverages } from './stats'
import { effectiveMs, mbldPoints, type Penalty, type Solve } from './types'
import { solveLine } from '../data/backup'
import type { AverageView } from './averageText'

/** Which column the list is ordered by. `null` is the default: newest first. */
type SortKey = 'time' | 'ao5' | 'ao12'
interface Sort { key: SortKey; dir: 'asc' | 'desc' }

/**
 * A heading you can sort by. Declared out here rather than inside the list: a
 * component built during a render is a new component every render, and React
 * throws its state away each time.
 */
function Head({ label, sortKey, sort, onCycle }: {
    label: string
    sortKey: SortKey
    sort: Sort | null
    onCycle: (key: SortKey) => void
}) {
    const active = sort?.key === sortKey
    return (
        <button
            type="button"
            className={active ? 'solve-sort on' : 'solve-sort'}
            onClick={() => onCycle(sortKey)}
        >
            {label}
            {active && <i>{sort.dir === 'asc' ? '▲' : '▼'}</i>}
        </button>
    )
}

interface SolveListProps {
    solves: Solve[]
    /** Which session these are. Only used to shut any open row when you leave
        it — a drawer belongs to the list it was opened in. */
    sessionId: string
    decimals: 2 | 3
    onPenalty: (id:number,penalty: Penalty) => void
    onDelete: (id:number) => void
    /** Opens the solves behind one row's ao5 or ao12. */
    onOpenAverage?: (view: AverageView) => void
    /** The floating list: #, time and ao5, in tighter rows. */
    compact?: boolean
}

/**
 * Times sort low to high, and everything that isn't a time sorts last.
 *
 * Infinity is a DNF and NaN is an average that didn't exist yet; neither is a
 * fast solve or a slow one, so neither belongs at either end of the order. They
 * stay at the bottom in both directions rather than flipping to the top when the
 * arrow does.
 */
function compare(a: number, b: number, dir: 'asc' | 'desc'): number {
    const aOk = Number.isFinite(a)
    const bOk = Number.isFinite(b)
    if (!aOk || !bOk) return aOk === bOk ? 0 : (aOk ? -1 : 1)
    return dir === 'asc' ? a - b : b - a
}

export default function SolveList({
    solves, sessionId, decimals, onPenalty, onDelete, onOpenAverage, compact = false,
}: SolveListProps) {
    const [openId, setOpenId] = useState<number | null>(null)
    const [sort, setSort] = useState<Sort | null>(null)
    /** The row whose delete button has been pressed once already. */
    const [confirming, setConfirming] = useState<number | null>(null)

    // The ao5 and ao12 as they stood after each solve, the way cstimer lists
    // them: what your average *was* at that point, not what it is now. Memoised
    // because the rail re-renders on every tick of the clock beside it.
    const ao5 = useMemo(() => rollingAverages(solves, 5), [solves])
    const ao12 = useMemo(() => rollingAverages(solves, 12), [solves])

    // One record per solve, carrying the chronological index the averages were
    // computed against. Sorting the records rather than the solves is what keeps
    // the # column and both averages attached to the right solve once the order
    // stops being the order they happened in.
    const rows = useMemo(() => {
        const built = solves.map((solve, index) => ({
            solve, index, time: effectiveMs(solve), ao5: ao5[index], ao12: ao12[index],
        }))
        if (sort === null) return built.reverse()
        return built.sort((a, b) => compare(a[sort.key], b[sort.key], sort.dir))
    }, [solves, ao5, ao12, sort])

    /** none → low to high → high to low → none. */
    function cycle(key: SortKey) {
        setSort((prev) => {
            if (prev === null || prev.key !== key) return { key, dir: 'asc' }
            return prev.dir === 'asc' ? { key, dir: 'desc' } : null
        })
    }

    /**
     * A drawer, and a half-pressed delete, belong to the session they were
     * opened in — neither means anything against a list of different solves.
     *
     * Adjusted during the render that brings the new session in rather than in
     * an effect, so the list never paints once with the old session's row open.
     */
    const [lastSession, setLastSession] = useState(sessionId)
    if (lastSession !== sessionId) {
        setLastSession(sessionId)
        setOpenId(null)
        setConfirming(null)
    }

    if (solves.length ===0) {
        return <p className="rail-empty">no solves yet</p>
    }

  return (
      // The # column is sized to the longest number it holds. A fixed width fit
      // three digits, and solve 1000 ran straight into its own time.
      <ol
        className={compact ? 'solve-list compact' : 'solve-list'}
        style={{ '--n-digits': String(solves.length).length } as CSSProperties}
      >
      {/* Three of the four headings are controls now, so the row is no longer
          decoration to be hidden from a screen reader. */}
      <li className="solve-head">
        <span className="solve-n">#</span>
        <span className="solve-t">
          <Head label="time" sortKey="time" sort={sort} onCycle={cycle} />
        </span>
        <span className="solve-ao">
          <Head label="ao5" sortKey="ao5" sort={sort} onCycle={cycle} />
        </span>
        {!compact && (
          <span className="solve-ao">
            <Head label="ao12" sortKey="ao12" sort={sort} onCycle={cycle} />
          </span>
        )}
      </li>

      {rows.map(({ solve, index }) => {
        /** The window one of this row's averages was taken over. */
        const windowOf = (size: number) => solves.slice(index + 1 - size, index + 1)

        return (
        <li key={solve.id}>
          <div className={`solve-row ${solve.penalty}`}>
            <button
              type="button"
              className="solve-open"
              onClick={() => {
                setOpenId(openId === solve.id ? null : solve.id)
                setConfirming(null)
              }}
            >
              <span className="solve-n">{index + 1}</span>
              <span className="solve-t">
                {formatTime(effectiveMs(solve), decimals)}
                {/* Only +2 needs a tag: a DNF already reads DNF in the time column. */}
                {solve.penalty === 'plus2' && <i className="solve-tag">+2</i>}
                {/* For multi-blind the cube count is the result and the time is
                    the tiebreak, so it travels with the time rather than
                    waiting in the drawer. */}
                {solve.mbld && (
                  <i className="solve-tag cubes">
                    {solve.mbld.solved}/{solve.mbld.attempted}
                  </i>
                )}
              </span>
            </button>

            {(compact ? [5] : [5, 12]).map((size) => {
              const value = size === 5 ? ao5[index] : ao12[index]
              const text = formatTime(value, decimals)

              return (
                <span className="solve-ao" key={size}>
                  {onOpenAverage && Number.isFinite(value) ? (
                    <button
                      type="button"
                      className="ao-open"
                      onClick={() => onOpenAverage({
                        label: `ao${size}`,
                        solves: windowOf(size),
                      })}
                    >
                      {text}
                    </button>
                  ) : text}
                </span>
              )
            })}
          </div>

          {openId === solve.id && (
            <div className="solve-actions">
              {/* Both toggle back to 'none', so a mis-tap is one more tap to undo
                  and the two penalties can never stack. */}
              <button
                type="button"
                aria-pressed={solve.penalty === 'plus2'}
                onClick={() => onPenalty(solve.id, solve.penalty === 'plus2' ? 'none' : 'plus2')}
              >
                +2
              </button>
              <button
                type="button"
                aria-pressed={solve.penalty === 'dnf'}
                onClick={() => onPenalty(solve.id, solve.penalty === 'dnf' ? 'none' : 'dnf')}
              >
                DNF
              </button>
              {/* Time, when, puzzle and scramble together: on its own a time
                  isn't worth pasting anywhere, and the rest is what makes it a
                  claim someone could check. */}
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(solveLine(solve, decimals))}
              >
                copy
              </button>
              {/* Asks once. A solve takes one keypress to record and there is no
                  undo behind this, so the second press is the whole safety net —
                  and it stays a button rather than a dialog because the cost of
                  changing your mind should be moving the mouse away.

                  Both labels are always in the button, stacked, with the longer
                  one holding the space open and hidden. Otherwise arming it
                  wraps "really delete" onto a second line and the row you are
                  aiming at grows under the pointer — which is the one moment on
                  this list where nothing should move. */}
              <button
                type="button"
                className={confirming === solve.id ? 'danger confirm armed' : 'danger confirm'}
                onClick={() => {
                  if (confirming !== solve.id) {
                    setConfirming(solve.id)
                    return
                  }
                  onDelete(solve.id)
                  setConfirming(null)
                  setOpenId(null)
                }}
              >
                <span>{confirming === solve.id ? 'really delete' : 'delete'}</span>
                <span className="confirm-sizer" aria-hidden="true">really delete</span>
              </button>
            </div>
          )}

          {solve.memoMs !== null && openId === solve.id && (
            <p className="solve-split">
              memo {formatTime(solve.memoMs, decimals)}
              {' · '}
              exec {formatTime(solve.ms - solve.memoMs, decimals)}
            </p>
          )}

          {solve.mbld && openId === solve.id && (
            <p className="solve-split">
              {mbldPoints(solve.mbld)}{' '}
              {Math.abs(mbldPoints(solve.mbld)) === 1 ? 'point' : 'points'}
            </p>
          )}
        </li>
        )
      })}
      </ol>
  )
}
