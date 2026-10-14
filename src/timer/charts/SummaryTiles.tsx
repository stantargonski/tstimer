import { useMemo, type CSSProperties } from 'react'
import { formatTime } from '../format'
import {
  bestAverageWindow, bestSingleIndex, durationText, mean, meanExec, meanMemo, specLabel, stdev,
  totalTime, trimFor, type AverageSpec,
} from '../stats'
import { effectiveMs, type Solve } from '../types'
import type { AverageView } from '../averageText'
import type { WcaEvent } from '../events'
import { TILES } from './tiles'

function Tile({ label, value, note, onOpen }: {
  label: string
  value: string
  note?: string
  onOpen?: () => void
}) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-value">
        {onOpen ? (
          <button type="button" className="ao-open" onClick={onOpen}>{value}</button>
        ) : value}
      </strong>
      {note && <span className="tile-note">{note}</span>}
    </div>
  )
}

interface SummaryTilesProps {
  solves: Solve[]
  decimals: 2 | 3
  event: WcaEvent
  averages: AverageSpec[]
  trimPercent: number
  /** Opens the solves behind one of the boxes. */
  onOpenAverage?: (view: AverageView) => void
}

export default function SummaryTiles({
  solves, decimals, event, averages, trimPercent, onOpenAverage,
}: SummaryTilesProps) {
  const time = (ms: number) => formatTime(ms, decimals)

  // Split events keep only the shortest average; the rest of the row is memo
  // and exec. Multi-blind has no averages at all (WCA 9f12).
  const shown = useMemo(() => {
    if (event.scramble.kind === 'mbf') return []
    return event.split ? averages.slice(0, 1) : averages
  }, [averages, event])

  // Computed once for the whole set: the best-window search walks the session
  // per size, and at a hundred that is not something to do per render.
  const figures = useMemo(() => ({
    best: shown.map((spec) => bestAverageWindow(solves, spec, trimPercent)),
    singleAt: bestSingleIndex(solves),
  }), [solves, shown, trimPercent])

  /** A box that opens the solves behind it, when there are any to open. */
  function opener(label: string, window: Solve[] | null, value: number, trim?: number) {
    if (!onOpenAverage || !window || window.length === 0 || Number.isNaN(value)) return undefined
    return () => onOpenAverage({ label, solves: window, value, trim })
  }

  function render(id: string) {
    switch (id) {
      case 'solves':
        return <Tile key={id} label="solves" value={String(solves.length)} />
      case 'time':
        return <Tile key={id} label="time solving" value={durationText(totalTime(solves))} />
      case 'best': {
        const at = figures.singleAt
        const value = at >= 0 ? effectiveMs(solves[at]) : NaN
        return (
          <Tile
            key={id}
            label="best single"
            value={time(value)}
            onOpen={opener('best single', at >= 0 ? solves.slice(at, at + 1) : null, value)}
          />
        )
      }
      case 'mean':
        return <Tile key={id} label="mean" value={time(mean(solves))} />
      case 'deviation':
        return <Tile key={id} label="deviation" value={time(stdev(solves))} />
      case 'averages':
        return shown.map((spec, at) => {
          const found = figures.best[at]
          const label = `best ${specLabel(spec)}`
          return (
            <Tile
              key={label}
              label={label}
              value={time(found.value)}
              onOpen={opener(
                label,
                found.start >= 0 ? solves.slice(found.start, found.start + spec.size) : null,
                found.value,
                trimFor(spec, trimPercent),
              )}
            />
          )
        })
      case 'memo':
        return <Tile key={id} label="memo" value={time(meanMemo(solves))} note="mean over split solves" />
      case 'exec':
        return <Tile key={id} label="exec" value={time(meanExec(solves))} note="mean over split solves" />
      default:
        return null
    }
  }

  const tiles = TILES
    .filter((tile) => !tile.only || tile.only === (event.split ? 'split' : 'unsplit'))
    .flatMap((tile) => render(tile.id))
  // Padded to whole rows of four, so the hairline grid never shows a gap. At
  // full width it is one row up to eight, then two.
  const padded = Math.ceil(tiles.length / 4) * 4
  const wide = padded <= 8 ? padded : padded / 2

  return (
    <div className="tiles-frame">
      <div className="tiles" style={{ '--tile-cols': wide } as CSSProperties}>
        {tiles}
        {Array.from({ length: padded - tiles.length }, (_, at) => (
          <div className="tile filler" key={`filler-${at}`} aria-hidden="true" />
        ))}
      </div>
    </div>
  )
}
