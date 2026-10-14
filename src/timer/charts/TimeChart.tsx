import { useMemo, useState, type PointerEvent } from 'react'
import { formatTime } from '../format'
import { rollingAverages, specLabel, type AverageSpec } from '../stats'
import { effectiveMs, type Solve } from '../types'
import { extent, linePath, niceStep } from './scale'

/**
 * Every solve in the session, with the settings' averages drawn over the top.
 *
 * Hand-rolled SVG rather than a charting library: the app has no runtime
 * dependencies beyond React, and what's needed here is a polyline and some
 * circles. A library would be the heavier option, not the lighter one.
 */

const WIDTH = 720
const HEIGHT = 240
const PAD = { top: 14, right: 12, bottom: 22, left: 52 }

/**
 * The x axis counts in hundreds of solves, coarsening only when a hundred would
 * crowd it.
 *
 * Deliberately not `niceStep` below: that one rounds an arbitrary span to
 * whatever reads well, and here the numbers people actually think in are round
 * hundreds — "my first five hundred solves", never "my first five hundred and
 * twelve".
 */
const X_STEPS = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000]
const MAX_X_LABELS = 8

function xStep(count: number): number {
  return X_STEPS.find((step) => count / step <= MAX_X_LABELS) ?? X_STEPS[X_STEPS.length - 1]
}

interface TimeChartProps {
  solves: Solve[]
  decimals: 2 | 3
  averages: AverageSpec[]
  trimPercent: number
}

export default function TimeChart({ solves, decimals, averages, trimPercent }: TimeChartProps) {
  // Each series costs a pass per solve over its own window, so an ao100 line
  // alone is twenty times the ao5 line. Memoised on the solves rather than
  // recomputed whenever the span buttons or the theme move underneath it.
  const series = useMemo(
    () => averages.map((spec) => rollingAverages(solves, spec, trimPercent)),
    [solves, averages, trimPercent],
  )

  /** Which solve the pointer is nearest, or null when it is off the chart. */
  const [hover, setHover] = useState<number | null>(null)

  // Everything but the hover readout, worked out once per set of solves rather
  // than on every pointer move across the chart — with thousands of solves,
  // redrawing every dot per mouse event is what made the sweep stutter.
  const plot = useMemo(() => {
    const times = solves.map(effectiveMs)
    const range = extent(times)
    if (!range || times.filter((value) => Number.isFinite(value)).length < 2) return null

    const { low, high } = range
    // A flat session would otherwise divide by zero; give it a band to sit in.
    const span = high - low || Math.max(high * 0.1, 1000)
    const top = high + span * 0.12
    const bottom = Math.max(0, low - span * 0.12)

    const plotWidth = WIDTH - PAD.left - PAD.right
    const plotHeight = HEIGHT - PAD.top - PAD.bottom

    const x = (index: number) =>
      PAD.left + (solves.length === 1 ? plotWidth / 2 : (index / (solves.length - 1)) * plotWidth)
    const y = (ms: number) =>
      PAD.top + plotHeight - ((ms - bottom) / (top - bottom)) * plotHeight

    const step = niceStep(top - bottom)
    const lines: number[] = []
    for (let value = Math.ceil(bottom / step) * step; value <= top; value += step) lines.push(value)

    // A personal best is only a personal best against what came before it, so
    // this walks forward rather than comparing against the session's best.
    const isPb: boolean[] = []
    let running = Infinity
    for (const value of times) {
      const better = Number.isFinite(value) && value < running
      if (better) running = value
      isPb.push(better)
    }

    // Every hundredth solve. The count itself stands in when there aren't a
    // hundred yet, so a short session's axis still says how long it is.
    const marks: number[] = [1]
    const every = xStep(solves.length)
    for (let mark = every; mark <= solves.length; mark += every) marks.push(mark)
    if (marks.length === 1 && solves.length > 1) marks.push(solves.length)

    const points = times.map((value, index) => {
      // DNFs have no height of their own, so they sit on the ceiling with a
      // shape of their own rather than dragging the scale up to infinity.
      const dnf = !Number.isFinite(value)

      return dnf ? (
        <path
          key={solves[index].id}
          className="point dnf"
          d={`M${x(index) - 3.5} ${PAD.top - 6} L${x(index) + 3.5} ${PAD.top - 6}
              L${x(index)} ${PAD.top + 1} Z`}
        />
      ) : (
        <circle
          key={solves[index].id}
          className={isPb[index] ? 'point pb' : 'point'}
          cx={x(index)}
          cy={y(value)}
          r={isPb[index] ? 3.6 : 2.4}
        />
      )
    })

    return { times, x, y, lines, marks, plotWidth, plotHeight, points }
  }, [solves])

  if (!plot) {
    return <p className="chart-empty">Two solves and this fills in.</p>
  }
  const { times, x, y, lines, marks, plotWidth, plotHeight, points } = plot

  /**
   * The solve nearest the pointer, from where the pointer is across the plot.
   *
   * Nearest-index rather than hit-testing the dots: a 2.4px circle is something
   * you have to aim at, and this is a chart you read by sweeping across. The
   * whole vertical strip around a point is live, so the readout keeps up with
   * the pointer instead of blinking in and out of existence between dots.
   */
  function track(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width === 0) return

    const ratio = (event.clientX - box.left) / box.width
    const index = Math.round(ratio * (solves.length - 1))
    setHover(Math.min(solves.length - 1, Math.max(0, index)))
  }

  const at = hover === null ? null : {
    index: hover,
    time: times[hover],
    when: new Date(solves[hover].id),
  }

  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="solve times">
        {lines.map((value) => (
          <g key={value}>
            <line className="grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} />
            <text className="axis" x={PAD.left - 8} y={y(value) + 3.5} textAnchor="end">
              {formatTime(value, decimals)}
            </text>
          </g>
        ))}

        {at && (
          <line
            className="chart-guide"
            x1={x(at.index)}
            x2={x(at.index)}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
          />
        )}

        {/* Longest first, so the shortest — the one you read values off — is on top. */}
        {series.map((line, at) => (
          <path key={specLabel(averages[at])} className={`line s${at}`} d={linePath(line, x, y)} fill="none" />
        )).reverse()}

        {points}

        {at && (
          <circle
            className="point held"
            cx={x(at.index)}
            cy={Number.isFinite(at.time) ? y(at.time) : PAD.top - 3}
            r={5}
          />
        )}

        {marks.map((mark) => (
          <text
            key={mark}
            className="axis"
            x={x(mark - 1)}
            y={HEIGHT - 6}
            textAnchor={mark === 1 ? 'start' : mark === solves.length ? 'end' : 'middle'}
          >
            {mark}
          </text>
        ))}

        {/* Last, so it takes the pointer from everything under it — otherwise
            each dot would swallow its own events and the sweep would stutter. */}
        <rect
          className="chart-hit"
          x={PAD.left}
          y={PAD.top}
          width={plotWidth}
          height={plotHeight}
          onPointerMove={track}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {at && (
        <div
          className="chart-tip"
          style={{
            // Clamped off both edges, so the box never hangs outside the card.
            left: `${Math.min(88, Math.max(12, (x(at.index) / WIDTH) * 100))}%`,
            top: `${((Number.isFinite(at.time) ? y(at.time) : PAD.top) / HEIGHT) * 100}%`,
          }}
        >
          <b>
            #{at.index + 1}
            <span>{formatTime(at.time, decimals)}</span>
          </b>
          <i>{at.when.toLocaleDateString()} {at.when.toLocaleTimeString()}</i>
          <dl>
            {/* Already computed for the lines; the readout is only reading them off. */}
            {averages.map((spec, index) => (
              <div key={specLabel(spec)} className="chart-tip-row">
                <dt>{specLabel(spec)}</dt><dd>{formatTime(series[index][at.index], decimals)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
