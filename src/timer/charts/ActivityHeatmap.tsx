import { useEffect, useMemo, useRef } from 'react'
import { dayCounts, dayKey } from '../stats'
import type { Solve } from '../types'
import { DAY, startOfDay, windowBounds, type TimeWindow } from './filters'
import { extent } from './scale'

/**
 * When you actually practised, a square per day.
 *
 * Every other chart on this page answers "how fast"; this one answers "how
 * often", which is the question the others quietly depend on. A month-long gap
 * explains a flat average better than any statistic about the solves themselves.
 *
 * Laid out a month to a block, each block exactly as many columns wide as that
 * month needs, with the 1st sitting on its real weekday. The blocks butt up
 * against each other on the same rhythm as the weeks inside them, so the seven
 * weekday rows run unbroken across the whole strip and a month boundary shows
 * as the notch where one month's last week meets the next month's first.
 *
 * Except when there is no notch to show. A month that ends on a Sunday hands
 * the next one a whole clean column to start on, so the two ran together as one
 * unbroken grid with nothing between them — the boundary the layout relies on
 * simply wasn't there. Those blocks get the space a notch would have taken.
 */

/** Monday first, to match the row order. Blanks are the rows that go unlabelled. */
const WEEKDAYS = ['mon', '', 'wed', '', 'fri', '', ''];

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/** One square. `count` of -1 means there is no day here to colour. */
interface Cell {
  key: string;
  count: number;
  label: string | null;
}

interface MonthBlock {
  key: string;
  label: string;
  /** Weeks, each exactly seven cells, Monday first. */
  columns: Cell[][];
  /**
   * Whether this month starts on a Monday — which is to say, whether the month
   * before it ended on a Sunday and left no notch between the two.
   */
  flush: boolean;
}

interface ActivityHeatmapProps {
  solves: Solve[]
  range: TimeWindow
  /** Owned by the page, so nothing here has to read the clock during a render. */
  now: number
}

/** 0 = Monday. JS starts its week on Sunday; the grid does not. */
function weekdayOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export default function ActivityHeatmap({ solves, range, now }: ActivityHeatmapProps) {
  const scroller = useRef<HTMLDivElement>(null);

  const { months, total, busiest } = useMemo(() => {
    const counts = dayCounts(solves);

    const bounds = windowBounds(range, solves, now);
    // Never past today, however far forward the window was typed.
    const today = startOfDay(Math.min(bounds.to, now));
    // All-time starts at the first solve, but never draws less than a month —
    // a single column of squares reads as a bug rather than as a new account.
    const earliest = solves.length > 0
      ? startOfDay(extent(solves.map((solve) => solve.id))?.low ?? now)
      : today;

    const from = bounds.from === null
      ? startOfDay(Math.min(earliest.getTime(), today.getTime() - 27 * DAY))
      : startOfDay(bounds.from);

    const blocks: MonthBlock[] = [];
    let running = 0;
    let peak = 0;

    // Whole months, always. A block that stopped halfway would be the one shape
    // on this chart that isn't a month, which is the thing it is meant to show.
    // Days outside the chosen range are drawn as absent rather than as empty,
    // so widening the range adds squares instead of recolouring them.
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 1);

    while (cursor <= last) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const first = new Date(year, month, 1);
      // Day 0 of the next month is the last day of this one.
      const length = new Date(year, month + 1, 0).getDate();

      const cells: Cell[] = [];
      const blank = (at: number): Cell => (
        { key: `${year}-${month}-blank-${at}`, count: -1, label: null }
      );

      // Lead-in, so the 1st lands on its own weekday row.
      for (let at = 0; at < weekdayOf(first); at += 1) cells.push(blank(cells.length));

      for (let day = 1; day <= length; day += 1) {
        const date = new Date(year, month, day);
        const key = dayKey(date.getTime());
        const inRange = date >= from && date <= today;
        const count = inRange ? (counts.get(key) ?? 0) : -1;

        cells.push({ key, count, label: key });
        if (count > 0) {
          running += count;
          peak = Math.max(peak, count);
        }
      }

      // Pad to a whole number of weeks so every column is seven tall.
      while (cells.length % 7 !== 0) cells.push(blank(cells.length));

      const columns: Cell[][] = [];
      for (let at = 0; at < cells.length; at += 7) columns.push(cells.slice(at, at + 7));

      blocks.push({
        key: `${year}-${month}`,
        // Never on the opening block: there is nothing to its left to be flush
        // against, and a strip that started with a gap would just look misaligned.
        flush: weekdayOf(first) === 0 && blocks.length > 0,
        // The year rides along on January and on the opening block, which is
        // the only place a bare month name would be ambiguous.
        label: month === 0 || blocks.length === 0
          ? `${MONTHS[month]} ’${String(year).slice(2)}`
          : MONTHS[month],
        columns,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { months: blocks, total: running, busiest: peak };
  }, [solves, range, now]);

  // Opened on the most recent month rather than the oldest. Over a year of
  // squares the interesting end is the right-hand one, and it was the end you
  // had to go and find.
  useEffect(() => {
    const box = scroller.current;
    if (box) box.scrollLeft = box.scrollWidth;
  }, [months]);

  /**
   * Which of the four fill steps a day earns. Split by share of the busiest day
   * rather than by fixed counts, so a 2x2 session of ninety solves and a 7x7
   * session of six both produce a readable chart.
   */
  function level(count: number): string {
    if (count <= 0) return 'a0';
    if (busiest <= 1) return 'a3';
    const share = count / busiest;
    if (share > 0.66) return 'a3';
    if (share > 0.33) return 'a2';
    return 'a1';
  }

  return (
    <div className="activity">
      <div className="activity-body">
        {/* Outside the scroller, so the labels stay put without having to be
            stuck to it — and one row per weekday on the same rhythm as the
            cells, so they line up by construction rather than by a padding
            figure that has to be re-guessed whenever a square changes size. */}
        <div className="activity-days">
          {WEEKDAYS.map((day, row) => <span key={row}>{day}</span>)}
        </div>

        <div className="activity-scroll" ref={scroller}>
          <div className="activity-grid">
            {months.map((month) => (
              <div
                className={month.flush ? 'activity-month-block flush' : 'activity-month-block'}
                key={month.key}
              >
                <span className="activity-month">{month.label}</span>

                {month.columns.map((week, at) => (
                  <div className="activity-week" key={`${month.key}-${at}`}>
                    {week.map((cell) => (
                      <i
                        key={cell.key}
                        className={cell.count < 0
                          ? 'activity-cell gap'
                          : `activity-cell ${level(cell.count)}`}
                        title={cell.count < 0
                          ? undefined
                          : `${cell.count} ${cell.count === 1 ? 'solve' : 'solves'} on ${cell.label}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="activity-foot">
        <span>{total} {total === 1 ? 'solve' : 'solves'}</span>
        <span className="activity-key">
          less
          {['a0', 'a1', 'a2', 'a3'].map((step) => (
            <i key={step} className={`activity-cell ${step}`} />
          ))}
          more
        </span>
      </p>
    </div>
  );
}
