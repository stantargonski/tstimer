/**
 * What the timer's floating graph draws: the latest `span` solves of a session,
 * with the averages and personal bests they carry.
 */

import { rollingAverages, type AverageSpec } from '../stats';
import { effectiveMs, type Solve } from '../types';
import type { GraphSpan } from '../settings';

export interface GraphSeries {
  /** Where the window starts in the session, so a readout can number a solve
      the way the solve list does. */
  offset: number;
  times: number[];
  /** One line per average asked for, aligned with `times`. */
  averages: number[][];
  /** Whether each solve was the session's best at the moment it was done. */
  isPb: boolean[];
}

/**
 * The window, and everything drawn over it.
 *
 * The averages are worked out with the solves just before the window in view,
 * then cut to it — otherwise "last 12" would draw an ao12 line with one point
 * and an ao5 line missing its first four. The personal bests are the same: a
 * solve inside the window is only a PB if it beat everything before it in the
 * session, not merely everything before it on screen.
 */
export function graphSeries(
  solves: Solve[],
  span: GraphSpan,
  averages: AverageSpec[] = [{ kind: 'ao', size: 5 }, { kind: 'ao', size: 12 }],
  trimPercent?: number,
): GraphSeries {
  const offset = span === 0 ? 0 : Math.max(0, solves.length - span);
  // The widest average drawn, less one: how far before the window it reaches.
  const lead = Math.max(0, ...averages.map((spec) => spec.size - 1));
  const start = Math.max(0, offset - lead);
  const context = solves.slice(start);
  const skip = offset - start;

  const times = solves.slice(offset).map(effectiveMs);

  let running = Infinity;
  for (let index = 0; index < offset; index++) {
    running = Math.min(running, effectiveMs(solves[index]));
  }
  const isPb = times.map((value) => {
    const better = Number.isFinite(value) && value < running;
    if (better) running = value;
    return better;
  });

  return {
    offset,
    times,
    averages: averages.map((spec) => rollingAverages(context, spec, trimPercent).slice(skip)),
    isPb,
  };
}
