import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { formatTime } from './format'
import {
  mean, rollingAverages, specLabel, trimCount, trimFor, trimmedAverage, type AverageSpec,
} from './stats'
import { effectiveMs, mbldPoints, type Penalty, type Solve } from './types'
import { solveLine } from '../data/backup'
import { MAX_COMMENT } from '../data/limits'
import type { AverageView } from './averageText'

/** Which column the list is ordered by: the time, or the first or second
    average column. `null` is the default: newest first. */
type SortKey = 'time' | 'a0' | 'a1'
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
    /** The settings' averages. The first two are the list's columns, the way
        csTimer lists its first two; the floating list shows only the first. */
    averages: AverageSpec[]
    trimPercent: number
    onPenalty: (id:number,penalty: Penalty) => void
    onDelete: (id:number) => void
    /** Sets a solve's comment; empty text removes it. */
    onComment?: (id: number, text: string) => void
    /** Moves this solve and every later one into a new session. */
    onSplit?: (id: number) => void
    /** Opens the solves behind one row's average, or a selected range. */
    onOpenAverage?: (view: AverageView) => void
    /** The floating list: #, time and the first average, in tighter rows. */
    compact?: boolean
}

/**
 * A solve's comment, edited in place and saved when you leave the field.
 *
 * Its own component so the draft resets whenever a different solve's drawer is
 * open: it is keyed on the solve.
 */
function CommentField({ value, onSave }: { value: string; onSave: (text: string) => void }) {
    const [draft, setDraft] = useState(value)
    return (
        <input
            className="solve-comment"
            type="text"
            value={draft}
            maxLength={MAX_COMMENT}
            placeholder="comment"
            aria-label="comment"
            spellCheck={false}
            onChange={(change) => setDraft(change.target.value)}
            onBlur={() => { if (draft !== value) onSave(draft) }}
            onKeyDown={(press) => {
                if (press.key === 'Enter') press.currentTarget.blur()
                if (press.key === 'Escape') {
                    // Taken back, and kept from the list's own Escape.
                    press.stopPropagation()
                    setDraft(value)
                }
            }}
        />
    )
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
    solves, sessionId, decimals, averages, trimPercent, onPenalty, onDelete, onComment, onSplit,
    onOpenAverage, compact = false,
}: SolveListProps) {
    const [openId, setOpenId] = useState<number | null>(null)
    const [sort, setSort] = useState<Sort | null>(null)
    /** The row whose delete button has been pressed once already. */
    const [confirming, setConfirming] = useState<number | null>(null)
    /** The row whose solve was just copied, for as long as it says so. */
    const [copiedId, setCopiedId] = useState<number | null>(null)

    useEffect(() => {
      if (copiedId === null) return
      const id = setTimeout(() => setCopiedId(null), 1200)
      return () => clearTimeout(id)
    }, [copiedId])

    /** The last row clicked without shift: one end of a range. */
    const [anchor, setAnchor] = useState<number | null>(null)
    /** A shift-click range, as chronological indices, inclusive. */
    const [range, setRange] = useState<{ from: number; to: number } | null>(null)
    const root = useRef<HTMLOListElement>(null)

    const columns = useMemo(
      () => averages.slice(0, compact ? 1 : 2),
      [averages, compact],
    )

    // The averages as they stood after each solve, the way cstimer lists them:
    // what your average *was* at that point, not what it is now. Memoised
    // because the rail re-renders on every tick of the clock beside it.
    const rolling = useMemo(
      () => columns.map((spec) => rollingAverages(solves, spec, trimPercent)),
      [solves, columns, trimPercent],
    )

    // One record per solve, carrying the chronological index the averages were
    // computed against. Sorting the records rather than the solves is what keeps
    // the # column and both averages attached to the right solve once the order
    // stops being the order they happened in.
    const rows = useMemo(() => {
        const built = solves.map((solve, index) => ({
            solve,
            index,
            time: effectiveMs(solve),
            a0: rolling[0]?.[index] ?? NaN,
            a1: rolling[1]?.[index] ?? NaN,
        }))
        if (sort === null) return built.reverse()
        return built.sort((a, b) => compare(a[sort.key], b[sort.key], sort.dir))
    }, [solves, rolling, sort])

    // Escape, or a press anywhere outside the list, lets a range go.
    useEffect(() => {
      if (range === null) return
      function onKey(press: KeyboardEvent) {
        if (press.key === 'Escape') setRange(null)
      }
      function onDown(down: PointerEvent) {
        if (!root.current?.contains(down.target as Node)) setRange(null)
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('pointerdown', onDown)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('pointerdown', onDown)
      }
    }, [range])

    /** A plain click opens the row as it always did; with shift and a row
        already clicked, it selects every solve between the two instead. */
    function clickRow(click: MouseEvent, solve: Solve, index: number) {
      const from = anchor === null ? -1 : solves.findIndex((item) => item.id === anchor)
      if (click.shiftKey && from !== -1 && from !== index) {
        setRange({ from: Math.min(from, index), to: Math.max(from, index) })
        setOpenId(null)
        setConfirming(null)
        return
      }
      setRange(null)
      setAnchor(solve.id)
      setOpenId(openId === solve.id ? null : solve.id)
      setConfirming(null)
    }

    const picked = range ? solves.slice(range.from, range.to + 1) : null

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
        setAnchor(null)
        setRange(null)
    }

    if (solves.length ===0) {
        return <p className="rail-empty">no solves yet</p>
    }

  return (
      // The # column is sized to the longest number it holds. A fixed width fit
      // three digits, and solve 1000 ran straight into its own time.
      <ol
        ref={root}
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
        {columns.map((spec, at) => (
          <span className="solve-ao" key={specLabel(spec)}>
            <Head
              label={specLabel(spec)}
              sortKey={at === 0 ? 'a0' : 'a1'}
              sort={sort}
              onCycle={cycle}
            />
          </span>
        ))}
      </li>

      {picked && <RangeBar
        solves={picked}
        decimals={decimals}
        trimPercent={trimPercent}
        onOpen={onOpenAverage}
        onClear={() => setRange(null)}
      />}

      {rows.map(({ solve, index }) => {
        /** The window one of this row's averages was taken over. */
        const windowOf = (size: number) => solves.slice(index + 1 - size, index + 1)
        const inRange = range !== null && index >= range.from && index <= range.to

        return (
        <li key={solve.id}>
          <div className={`solve-row ${solve.penalty}${inRange ? ' picked' : ''}`}>
            <button
              type="button"
              className="solve-open"
              aria-pressed={inRange || undefined}
              // Shift would otherwise start a text selection across the rows.
              onMouseDown={(down) => { if (down.shiftKey) down.preventDefault() }}
              onClick={(click) => clickRow(click, solve, index)}
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
                {solve.comment && <i className="solve-tag note" title={solve.comment}>✎</i>}
              </span>
            </button>

            {columns.map((spec, at) => {
              const value = rolling[at][index]
              const text = formatTime(value, decimals)

              return (
                <span className="solve-ao" key={specLabel(spec)}>
                  {onOpenAverage && Number.isFinite(value) ? (
                    <button
                      type="button"
                      className="ao-open"
                      onClick={() => onOpenAverage({
                        label: specLabel(spec),
                        solves: windowOf(spec.size),
                        value,
                        trim: trimFor(spec, trimPercent),
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
              {/* Says so once it has, since a copy otherwise does nothing you can
                  see. Stacked like delete below, so the row doesn't move. A
                  failed write leaves it saying copy. */}
              <button
                type="button"
                className={copiedId === solve.id ? 'confirm copied' : 'confirm'}
                onClick={() => {
                  navigator.clipboard.writeText(solveLine(solve, decimals)).then(
                    () => setCopiedId(solve.id),
                    () => {},
                  )
                }}
              >
                <span aria-live="polite">{copiedId === solve.id ? 'copied' : 'copy'}</span>
                <span className="confirm-sizer" aria-hidden="true">copied</span>
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

          {openId === solve.id && (onComment || onSplit) && (
            <div className="solve-more">
              {onComment && (
                <CommentField
                  key={solve.id}
                  value={solve.comment ?? ''}
                  onSave={(text) => onComment(solve.id, text)}
                />
              )}
              {/* Not on the first solve: splitting there would only move
                  the whole session into a new one. */}
              {onSplit && index > 0 && (
                <button
                  type="button"
                  className="solve-split-here"
                  title="move this solve and every one after it into a new session"
                  onClick={() => {
                    onSplit(solve.id)
                    setOpenId(null)
                  }}
                >
                  split session here
                </button>
              )}
            </div>
          )}
        </li>
        )
      })}
      </ol>
  )
}

/**
 * What a shift-click range says: how many, their mean and their average, and
 * a way to open them as text.
 *
 * The average trims the way any average of that many does (the settings'
 * percentage, one apiece under twenty), so a range of twelve reads exactly as
 * the ao12 over the same solves would.
 */
function RangeBar({ solves, decimals, trimPercent, onOpen, onClear }: {
  solves: Solve[]
  decimals: 2 | 3
  trimPercent: number
  onOpen?: (view: AverageView) => void
  onClear: () => void
}) {
  const times = solves.map(effectiveMs)
  const avg = trimmedAverage(times, trimPercent)
  const label = `${solves.length} solves`

  return (
    <li className="solve-range" role="status">
      <span>
        <b>{solves.length}</b> solves selected
        {' · '}mean {formatTime(mean(solves), decimals)}
        {' · '}avg {formatTime(avg, decimals)}
      </span>
      {onOpen && (
        <button
          type="button"
          className="ao-open"
          onClick={() => onOpen({
            label, solves, value: avg, trim: trimCount(solves.length, trimPercent),
          })}
        >
          open
        </button>
      )}
      <button type="button" className="solve-range-clear" aria-label="clear the selection" onClick={onClear}>
        ×
      </button>
    </li>
  )
}
