import { useMemo, useState, type PointerEvent } from 'react'
import { formatTime } from './format'
import { graphSeries } from './charts/sessionGraph'
import { linePath, niceStep } from './charts/scale'
import { useFloatingPanel } from './useFloatingPanel'
import type { FrameBox } from './panelFit'
import {
  GRAPH_MAX_HEIGHT, GRAPH_MAX_WIDTH, GRAPH_MIN_HEIGHT, GRAPH_MIN_WIDTH, GRAPH_SPANS,
  type GraphSpan,
} from './settings'
import type { Solve } from './types'

/** The panel's padding plus its border: the gap between its edge and the plot. */
const INSET = 9
/** Room inside the plot. The top leaves space for DNF markers on the ceiling. */
const PAD = { top: 11, right: 5, bottom: 5 }
/** About one character of an axis label at its 10px size. */
const LABEL_CHAR = 6

interface SessionGraphProps {
  solves: Solve[]
  decimals: 2 | 3
  span: GraphSpan
  width: number
  height: number
  right: number
  bottom: number
  frame: FrameBox
  onSpan: (span: GraphSpan) => void
  onResize: (width: number, height: number) => void
  onMove: (right: number, bottom: number) => void
}

/**
 * The active session's solves, small, floating over the timer.
 *
 * The stats page's graph in miniature — the same dots, lines and classes — cut
 * down to what reads at a glance between solves: no legend, no axis along the
 * bottom, three time labels up the side. How many of the latest solves it draws
 * is the one thing it lets you change, from the pill in its corner.
 *
 * The whole plot is the handle it is dragged by: a panel this small has no room
 * for a title bar to hold it by.
 */
export default function SessionGraph({
  solves, decimals, span, width, height, right, bottom, frame, onSpan, onResize, onMove,
}: SessionGraphProps) {
  const panel = useFloatingPanel({
    width,
    height,
    right,
    bottom,
    frame,
    minWidth: GRAPH_MIN_WIDTH,
    maxWidth: GRAPH_MAX_WIDTH,
    minHeight: GRAPH_MIN_HEIGHT,
    maxHeight: GRAPH_MAX_HEIGHT,
    onResize,
    onMove,
  })

  /** Which solve in the window the pointer is nearest, or null when it is off the plot. */
  const [hover, setHover] = useState<number | null>(null)

  const plotWidth = width - INSET * 2
  const plotHeight = height - INSET * 2

  // The timer re-renders on every tick of a running clock, and none of this
  // changes unless a solve or the panel does.
  const drawn = useMemo(() => {
    const series = graphSeries(solves, span)
    const finite = series.times.filter((value) => Number.isFinite(value))
    if (finite.length < 2) return null

    const low = Math.min(...finite)
    const high = Math.max(...finite)
    // A flat window would otherwise divide by zero; give it a band to sit in.
    const spread = high - low || Math.max(high * 0.1, 1000)
    const ceiling = high + spread * 0.12
    const floor = Math.max(0, low - spread * 0.12)

    // Three labels at most: ask for three steps, and fall back to two when the
    // rounding leaves room for a fourth.
    const gridlines = (step: number) => {
      const out: number[] = []
      for (let value = Math.ceil(floor / step) * step; value <= ceiling; value += step) out.push(value)
      return out
    }
    let lines = gridlines(niceStep(ceiling - floor, 3))
    if (lines.length > 3) lines = gridlines(niceStep(ceiling - floor, 2))

    const labels = lines.map((value) => formatTime(value, decimals))
    // As wide as the longest label needs, so a 3x3 session isn't pushed right
    // to make room for the minutes a 3BLD one would carry.
    const left = Math.max(...labels.map((label) => label.length)) * LABEL_CHAR + 8
    const innerWidth = plotWidth - left - PAD.right
    const innerHeight = plotHeight - PAD.top - PAD.bottom
    const count = series.times.length

    const x = (index: number) => left + (index / (count - 1)) * innerWidth
    const y = (ms: number) =>
      PAD.top + innerHeight - ((ms - floor) / (ceiling - floor)) * innerHeight

    return {
      series,
      lines,
      labels,
      left,
      innerWidth,
      innerHeight,
      x,
      y,
      ao5: linePath(series.ao5, x, y),
      ao12: linePath(series.ao12, x, y),
    }
  }, [solves, span, decimals, plotWidth, plotHeight])

  /** Nearest-index rather than hit-testing the dots — see TimeChart's `track`. */
  function track(move: PointerEvent<SVGRectElement>) {
    if (!drawn) return
    const box = move.currentTarget.getBoundingClientRect()
    if (box.width === 0) return

    const count = drawn.series.times.length
    const index = Math.round(((move.clientX - box.left) / box.width) * (count - 1))
    setHover(Math.min(count - 1, Math.max(0, index)))
  }

  const nextSpan = GRAPH_SPANS[(GRAPH_SPANS.indexOf(span) + 1) % GRAPH_SPANS.length]
  // A solve deleted from under the pointer can leave the index past the end.
  const at = drawn && hover !== null && hover < drawn.series.times.length ? hover : null

  return (
    <div
      className="session-graph"
      style={{ width, height, right, bottom }}
      title="drag to move"
      onPointerDown={(down) => {
        setHover(null)
        panel.startMove(down)
      }}
      onPointerMove={panel.onPointerMove}
      onPointerUp={panel.onPointerUp}
      onPointerCancel={panel.onPointerUp}
    >
      <button
        type="button"
        className="preview-grip"
        title="drag to resize"
        aria-label="resize the session graph"
        // Kept from reaching the panel, whose own press starts a move.
        onPointerDown={(down) => {
          down.stopPropagation()
          panel.startResize(down)
        }}
      />

      <button
        type="button"
        className="graph-span"
        title="how many of the latest solves to show"
        onPointerDown={(down) => down.stopPropagation()}
        onClick={() => onSpan(nextSpan)}
      >
        {span === 0 ? 'all' : `last ${span}`}
      </button>

      {drawn && (
        <div className="chart-wrap">
          <svg
            className="chart"
            viewBox={`0 0 ${plotWidth} ${plotHeight}`}
            role="img"
            aria-label={span === 0 ? 'every solve in this session' : `the last ${span} solves`}
          >
            {drawn.lines.map((value, index) => (
              <g key={value}>
                <line
                  className="grid"
                  x1={drawn.left}
                  x2={plotWidth - PAD.right}
                  y1={drawn.y(value)}
                  y2={drawn.y(value)}
                />
                <text className="axis" x={drawn.left - 6} y={drawn.y(value) + 3.5} textAnchor="end">
                  {drawn.labels[index]}
                </text>
              </g>
            ))}

            {at !== null && (
              <line
                className="chart-guide"
                x1={drawn.x(at)}
                x2={drawn.x(at)}
                y1={PAD.top}
                y2={plotHeight - PAD.bottom}
              />
            )}

            <path className="line ao12" d={drawn.ao12} fill="none" />
            <path className="line ao5" d={drawn.ao5} fill="none" />

            {drawn.series.times.map((value, index) => {
              const key = solves[drawn.series.offset + index].id
              const cx = drawn.x(index)

              // As on the stats page: a DNF has no height, so it sits on the
              // ceiling with a shape of its own.
              if (!Number.isFinite(value)) {
                return (
                  <path
                    key={key}
                    className="point dnf"
                    d={`M${cx - 3} ${PAD.top - 6} L${cx + 3} ${PAD.top - 6} L${cx} ${PAD.top} Z`}
                  />
                )
              }

              const pb = drawn.series.isPb[index]
              // The solve just done, marked so you can find yourself on the line.
              const last = index === drawn.series.times.length - 1
              return (
                <circle
                  key={key}
                  className={pb ? 'point pb' : last ? 'point last' : 'point'}
                  cx={cx}
                  cy={drawn.y(value)}
                  r={pb || last ? 3.2 : 2}
                />
              )
            })}

            {at !== null && (
              <circle
                className="point held"
                cx={drawn.x(at)}
                cy={Number.isFinite(drawn.series.times[at]) ? drawn.y(drawn.series.times[at]) : PAD.top - 3}
                r={4.5}
              />
            )}

            <rect
              className="chart-hit"
              x={drawn.left}
              y={PAD.top}
              width={drawn.innerWidth}
              height={drawn.innerHeight}
              onPointerMove={track}
              onPointerLeave={() => setHover(null)}
            />
          </svg>

          {at !== null && (
            <div
              className="graph-tip"
              style={{
                // Clamped off both edges, so the box never hangs off the panel's sides.
                left: `${Math.min(80, Math.max(20, (drawn.x(at) / plotWidth) * 100))}%`,
                top: `${((Number.isFinite(drawn.series.times[at])
                  ? drawn.y(drawn.series.times[at])
                  : PAD.top) / plotHeight) * 100}%`,
              }}
            >
              <b>#{drawn.series.offset + at + 1}</b>{' '}
              {formatTime(drawn.series.times[at], decimals)}
              {' · '}ao5 {formatTime(drawn.series.ao5[at], decimals)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
