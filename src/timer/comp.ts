import { simpleMean, trimmedAverage } from './stats';
import type { WcaEvent } from './events';

/**
 * A competition round: how many solves it takes and how they're scored.
 *
 * 3x3 finals are an average of five with the best and worst dropped; 3BLD and
 * the big cubes are a mean of three with nothing dropped, which is why one DNF
 * is survivable in the first and fatal in the second. Which one an event uses
 * is a field on the event itself.
 */
export interface CompFormat {
  id: 'ao5' | 'mo3' | 'bo3';
  size: number;
  trimmed: boolean;
  /** Scored by the best attempt alone rather than by any average. */
  bestOf?: boolean;
}

export const FORMATS: Record<CompFormat['id'], CompFormat> = {
  ao5: { id: 'ao5', size: 5, trimmed: true },
  mo3: { id: 'mo3', size: 3, trimmed: false },
  bo3: { id: 'bo3', size: 3, trimmed: false, bestOf: true },
};

export function formatOf(event: WcaEvent): CompFormat {
  return FORMATS[event.format];
}

/** The round's score. NaN until every solve is in, Infinity for a DNF average. */
export function resultOf(format: CompFormat, times: number[]): number {
  if (times.length < format.size) return NaN;

  const round = times.slice(0, format.size);
  if (format.bestOf) return Math.min(...round);
  return format.trimmed ? trimmedAverage(round) : simpleMean(round);
}

/**
 * The slowest final solve that still reaches `target` — the number you actually
 * want on the wall going into the last solve of a round.
 *
 *   Infinity  the target is already safe: even a DNF can't lose it
 *   NaN       it's already gone: even a perfect 0.00 misses
 *
 * Found by bisection rather than algebra. The trim makes the answer piecewise —
 * which pieces get dropped changes as the last time moves past the others — but
 * it's monotone throughout, and going through `resultOf` means the cutoff can
 * never disagree with the average shown next to it about how a DNF is scored.
 */
export function needForTarget(done: number[], format: CompFormat, target: number): number {
  if (done.length !== format.size - 1 || !Number.isFinite(target)) return NaN;

  const scoreWith = (last: number) => resultOf(format, [...done, last]);

  if (scoreWith(Infinity) <= target) return Infinity;
  if (scoreWith(0) > target) return NaN;

  // Somewhere between "perfect" and "hopeless". Both ends are known good, so
  // walk the ceiling up until it fails, then close the gap to the millisecond.
  let low = 0;
  let high = 1000;
  while (scoreWith(high) <= target) high *= 2;

  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (scoreWith(middle) <= target) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * A goal worth chasing: a shade under what you're already averaging. Returns
 * NaN when there isn't enough history to base one on, so the caller can just
 * not offer it.
 */
export function suggestTarget(current: number): number {
  if (!Number.isFinite(current) || current <= 0) return NaN;
  return Math.round((current * 0.95) / 10) * 10;
}
