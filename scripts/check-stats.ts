/**
 * Asserts the averages say what they should, and in particular that adding
 * ao100 left ao5, ao12 and the competition simulator exactly where they were.
 *
 * Run with `npm run check:stats`.
 *
 * The trim used to be a hardcoded one from each end. It is now `trimCount(size)`
 * so that an ao100 can drop five and five like every other timer, and the thing
 * most worth pinning down is that this rescaling is invisible at the sizes that
 * already existed — a silent shift in ao5 would rewrite every session's history
 * without touching a single stored solve.
 */
import { FORMATS, resultOf } from '../src/timer/comp';
import {
  applyWindow, DAY, dateInput, inputDate, startOfDay, windowBounds,
} from '../src/timer/charts/filters';
import {
  average, best, bestAverage, bestAverageWindow, bestSingleIndex, mean, rollingAverages,
  stdev, trimCount, trimmedAverage,
} from '../src/timer/stats';
import { graphSeries } from '../src/timer/charts/sessionGraph';
import type { Penalty, Solve } from '../src/timer/types';

const failures: string[] = [];

function check(ok: boolean, message: string): void {
  if (!ok) failures.push(message);
}

function eq(actual: number, expected: number, why: string): void {
  // NaN and Infinity are results here, not errors, so they compare by identity;
  // a real time divides, so it compares with room for the last bit.
  const same = Number.isNaN(expected) || !Number.isFinite(expected)
    ? Object.is(actual, expected)
    : Math.abs(actual - expected) < 1e-6;
  check(same, `${why}: expected ${expected}, got ${actual}`);
}

/** A solve list from raw times, with `dnf` written as a penalty rather than a time. */
function solvesOf(times: (number | 'dnf')[]): Solve[] {
  return times.map((time, index) => {
    const penalty: Penalty = time === 'dnf' ? 'dnf' : 'none';
    return {
      id: 1_700_000_000_000 + index * 60_000,
      ms: time === 'dnf' ? 30_000 : time,
      memoMs: null,
      penalty,
      scramble: '',
      event: '333',
    };
  });
}

// ---- how much comes off each end ----

eq(trimCount(3), 1, 'an ao3 trims one apiece');
eq(trimCount(5), 1, 'an ao5 trims one apiece — the WCA rule');
eq(trimCount(12), 1, 'an ao12 trims one apiece');
eq(trimCount(19), 1, 'still one at nineteen, just under the 5% threshold');
eq(trimCount(20), 1, 'exactly one at twenty');
eq(trimCount(100), 5, 'an ao100 trims five apiece');

// ---- ao5 and ao12 are untouched by the rescaling ----

// 9, 10, 11, 12, 13: drop 9 and 13, mean 10, 11, 12.
eq(trimmedAverage([9000, 10_000, 11_000, 12_000, 13_000]), 11_000, 'ao5 of a run of five');
eq(average(solvesOf([9000, 10_000, 11_000, 12_000, 13_000]), 5), 11_000, 'ao5 through average()');

// Order must not matter — the window is sorted before it is trimmed.
eq(trimmedAverage([13_000, 9000, 12_000, 10_000, 11_000]), 11_000, 'ao5 ignores the order it arrives in');

const TWELVE = [
  10_000, 11_000, 12_000, 13_000, 14_000, 15_000,
  16_000, 17_000, 18_000, 19_000, 20_000, 21_000,
];
// Drop 10 and 21, mean the ten between them: 11..20 averages 15.5.
eq(average(solvesOf(TWELVE), 12), 15_500, 'ao12 of a run of twelve');

// ---- the competition simulator scores rounds exactly as before ----

eq(resultOf(FORMATS.ao5, [9000, 10_000, 11_000, 12_000, 13_000]), 11_000, 'an ao5 round');
eq(resultOf(FORMATS.mo3, [10_000, 11_000, 12_000]), 11_000, 'an mo3 round trims nothing');
eq(resultOf(FORMATS.ao5, [10_000, 11_000, 12_000]), NaN, 'an unfinished round has no result');
eq(
  resultOf(FORMATS.ao5, [9000, 10_000, 11_000, 12_000, Infinity]),
  11_000,
  'one DNF in a round is the trimmed worst',
);
eq(
  resultOf(FORMATS.ao5, [9000, 10_000, 11_000, Infinity, Infinity]),
  Infinity,
  'two DNFs in a round is a DNF',
);

// ---- ao100 ----

/** A hundred solves of 10.000 to 19.900, with `dnfs` of them failed. */
function hundred(dnfs: number): Solve[] {
  const times: (number | 'dnf')[] = [];
  for (let i = 0; i < 100; i += 1) times.push(i < dnfs ? 'dnf' : 10_000 + i * 100);
  return solvesOf(times);
}

eq(average(solvesOf([10_000]), 100), NaN, 'no ao100 from one solve');
eq(average(hundred(0).slice(0, 99), 100), NaN, 'no ao100 from ninety-nine solves');
check(Number.isFinite(average(hundred(0), 100)), 'an ao100 lands the moment the hundredth solve does');
check(Number.isFinite(average(hundred(5), 100)), 'five DNFs are exactly absorbed by the trim');
eq(average(hundred(6), 100), Infinity, 'a sixth DNF outlives the trim and the average is a DNF');

// The five fastest and five slowest are gone, so the two ends cannot move it.
const clean = hundred(0);
const skewed = solvesOf([
  ...Array.from({ length: 5 }, () => 1),
  ...clean.slice(5, 95).map((solve) => solve.ms),
  ...Array.from({ length: 5 }, () => 600_000),
]);
eq(
  average(skewed, 100),
  average(clean, 100),
  'five absurd solves at each end are trimmed away entirely',
);

// ---- best-of and rolling, at the new size ----

const RUN = solvesOf([12_000, 11_000, 10_000, 11_000, 12_000, 30_000, 31_000, 32_000]);
eq(best(RUN), 10_000, 'best single');
eq(bestAverage(RUN, 5), average(solvesOf([12_000, 11_000, 10_000, 11_000, 12_000]), 5),
  'the best ao5 is the first window, not the last');
eq(bestAverage(RUN, 100), NaN, 'no best ao100 without a hundred solves');
eq(bestAverage(hundred(0), 100), average(hundred(0), 100), 'one window means best equals current');

const rolling = rollingAverages(hundred(0), 100);
eq(rolling.length, 100, 'a rolling series is aligned with the solves');
check(rolling.slice(0, 99).every(Number.isNaN), 'the rolling ao100 is blank until the hundredth');
eq(rolling[99], average(hundred(0), 100), 'and its last point is the current ao100');

// ---- the windows behind the figures ----
// Every "best" on screen is now a link to the solves that made it, so the index
// these return is as load-bearing as the value. A window that agreed on the
// number but pointed at the wrong solves would be wrong in the one way nobody
// would think to check.

const bestFive = bestAverageWindow(RUN, 5);
eq(bestFive.value, bestAverage(RUN, 5), 'the window search agrees with the plain best');
eq(bestFive.start, 0, 'and reports where it found it');
eq(
  average(RUN.slice(bestFive.start, bestFive.start + 5), 5),
  bestAverage(RUN, 5),
  'the window it points at really does average to that',
);
eq(bestAverageWindow(RUN, 100).start, -1, 'no window at all when there are too few solves');
eq(bestAverageWindow(RUN, 100).value, NaN, 'and no value with it');

eq(bestSingleIndex(RUN), RUN.findIndex((solve) => solve.ms === 10_000), 'the best single by index');
eq(bestSingleIndex(solvesOf([])), -1, 'no index without solves');
// An all-DNF run has a best *result* — DNF — but no best solve to open.
eq(bestSingleIndex(solvesOf(['dnf', 'dnf'])), -1, 'nothing to point at when every solve is a DNF');

// ---- the rest of the panel, guarded against collateral damage ----

eq(mean(solvesOf([10_000, 11_000, 12_000])), 11_000, 'the mean trims nothing');
// The session mean skips DNFs rather than becoming one. simpleMean, which the
// comp round scorer uses, still does the WCA thing — checked in check-timer.
eq(mean(solvesOf([10_000, 'dnf'])), 10_000, 'a DNF is left out of the mean, not the whole of it');
eq(mean(solvesOf([10_000, 'dnf', 12_000])), 11_000, 'and the rest still average normally');
eq(mean(solvesOf(['dnf', 'dnf'])), NaN, 'no mean at all when nothing finished');
eq(best(solvesOf([])), NaN, 'no best without solves');
eq(stdev(solvesOf([11_000, 11_000, 11_000])), 0, 'no deviation in a flat run');

// ---- the window the charts are looking through ----

/** Solves at a day apart, oldest first, the most recent one `now`. */
function daily(count: number, now: number): Solve[] {
  return Array.from({ length: count }, (unused, index) => ({
    id: now - (count - 1 - index) * DAY,
    ms: 12_000,
    memoMs: null,
    penalty: 'none' as Penalty,
    scramble: '',
    event: '333' as const,
  }));
}

const NOW = new Date(2026, 2, 15, 12, 0, 0).getTime();
const TEN = daily(10, NOW);

eq(applyWindow(TEN, { kind: 'all' }, NOW).length, 10, 'all time keeps everything');
eq(applyWindow([], { kind: 'all' }, NOW).length, 0, 'and an empty history stays empty');
eq(applyWindow(TEN, { kind: 'days', days: 1 }, NOW).length, 1, 'a one-day window is today');
eq(applyWindow(TEN, { kind: 'days', days: 7 }, NOW).length, 7, 'a week is seven of them');
eq(applyWindow(TEN, { kind: 'days', days: 365 }, NOW).length, 10,
  'a window wider than the history is the whole history');

eq(applyWindow(TEN, { kind: 'lastN', n: 3 }, NOW).length, 3, 'last three is three');
check(
  applyWindow(TEN, { kind: 'lastN', n: 3 }, NOW)[2].id === TEN[9].id,
  'last three counts back from the most recent, not forward from the first',
);
eq(applyWindow(TEN, { kind: 'lastN', n: 99 }, NOW).length, 10,
  'asking for more solves than exist gives all of them');

// Both ends included: a range of one day is that day, not nothing.
const midday = (at: number) => TEN[at].id;
eq(
  applyWindow(TEN, { kind: 'dates', from: midday(9), to: midday(9) }, NOW).length, 1,
  'a single-day range holds that day',
);
eq(
  applyWindow(TEN, { kind: 'dates', from: midday(2), to: midday(5) }, NOW).length, 4,
  'a date range includes the day at each end',
);
eq(
  applyWindow(TEN, { kind: 'dates', from: NOW + 30 * DAY, to: NOW + 40 * DAY }, NOW).length, 0,
  'a range in the future holds nothing',
);

// A DNF is never dropped by a window: the trimmed averages rely on one sorting
// last, so a window that quietly removed them would rewrite every ao5 drawn.
const withDnf = solvesOf([10_000, 'dnf', 12_000, 13_000, 14_000]);
eq(applyWindow(withDnf, { kind: 'lastN', n: 5 }, NOW).length, 5,
  'a window keeps DNFs rather than filtering them out');

// `from` of null means "as far back as there is anything" — the charts decide
// what to draw for that, and must be able to tell it from a real date.
check(windowBounds({ kind: 'all' }, TEN, NOW).from === null, 'all time has no lower bound');
check(
  windowBounds({ kind: 'lastN', n: 99 }, TEN, NOW).from === null,
  'nor does a lastN wider than the history',
);
check(
  windowBounds({ kind: 'lastN', n: 3 }, TEN, NOW).from === startOfDay(TEN[7].id).getTime(),
  'a lastN that fits starts on the day of its oldest solve',
);
check(
  windowBounds({ kind: 'days', days: 1 }, TEN, NOW).from === startOfDay(NOW).getTime(),
  'a one-day window starts this morning, not 24 hours ago',
);

// The date fields round-trip in local time. Parsed as UTC, picking today would
// land on yesterday for anyone west of Greenwich.
check(inputDate(dateInput(NOW)) === startOfDay(NOW).getTime(), 'a date survives the round trip');
check(inputDate('not a date') === null, 'and a value that is not a date is rejected');

// ---- the timer's graph ----

// The lines are worked out over the session and then cut to the window, so the
// first points of "last 12" still carry an average instead of starting blank.
const BASE = Array.from({ length: 30 }, (_, index) => 10_000 + (index % 7) * 500);
const THIRTY = solvesOf(BASE);
const last12 = graphSeries(THIRTY, 12);
eq(last12.offset, 18, 'last 12 of 30 starts at the nineteenth solve');
eq(last12.times.length, 12, 'and draws twelve of them');
eq(last12.ao5[0], average(THIRTY.slice(14, 19), 5), 'its first ao5 reaches back before the window');
eq(last12.ao12[0], average(THIRTY.slice(7, 19), 12), 'as does its first ao12');
eq(graphSeries(THIRTY, 0).times.length, 30, 'span 0 draws the whole session');
eq(graphSeries(THIRTY.slice(0, 5), 50).offset, 0, 'a span wider than the session is all of it');

// A PB in the window is a PB of the session, not merely of what is on screen.
const withPbs = [...BASE];
withPbs[0] = 5000;
withPbs[25] = 4000;
const pbs = graphSeries(solvesOf(withPbs), 12).isPb;
check(
  pbs.filter(Boolean).length === 1 && pbs[7],
  'only a solve that beats the whole session so far is marked a PB',
);

// Two DNFs in one ao5 make it a DNF, and the line breaks there rather than leaping.
const withDnfs: (number | 'dnf')[] = [...BASE];
withDnfs[20] = 'dnf';
withDnfs[21] = 'dnf';
const broken = graphSeries(solvesOf(withDnfs), 12);
check(!Number.isFinite(broken.times[2]), 'a DNF is drawn as one');
check(!Number.isFinite(broken.ao5[3]), 'two DNFs in an ao5 make it a DNF');
check(Number.isFinite(broken.ao5[7]), 'and the line picks up once one of them has left the window');

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s):`);
  for (const message of failures) console.error(`  ${message}`);
  process.exit(1);
}

console.log(
  '✓ averages hold, ao5 and ao12 unchanged by the ao100 trim; windows cut where they say; '
  + 'the timer graph reaches back for its averages and PBs',
);
