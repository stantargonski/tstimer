import { formatTime } from './format';
import { trimCount, trimmedAverage } from './stats';
import { effectiveMs, type Solve } from './types';

/**
 * The solves behind one average, as text you can take somewhere else.
 *
 * An ao12 on its own is a number someone has to trust. This is the working:
 * every solve in the window, in order, with the ones the trim threw away in
 * parentheses — the convention every other timer writes averages in, so a block
 * pasted from here reads correctly to anyone who asks where the number came
 * from.
 *
 * Separate from the component that shows it so that file exports nothing but a
 * component — which is what keeps fast refresh working — and so the format can
 * be checked without a browser.
 */

/** What a detail window is asking about: `ao12`, and the twelve solves it covers. */
export interface AverageView {
  label: string;
  solves: Solve[];
  /**
   * The headline figure, when it isn't the trimmed average of `solves`.
   *
   * A window of one — the best single — trims to nothing and would otherwise
   * read as an em dash, and a selection of solves picked by hand has no average
   * worth quoting at all. Left out, the average is computed as before.
   */
  value?: number;
}

export function averageText(
  label: string,
  solves: Solve[],
  decimals: 2 | 3,
  value?: number,
): string {
  const times = solves.map(effectiveMs);
  const result = value ?? trimmedAverage(times);

  // Which entries the average dropped, by position rather than by value: two
  // solves can tie on time, and only one of them was trimmed.
  const dropped = new Set<number>();
  if (times.length >= 3) {
    const order = times.map((_, index) => index).sort((a, b) => times[a] - times[b]);
    const trim = trimCount(times.length);
    for (const index of order.slice(0, trim)) dropped.add(index);
    for (const index of order.slice(order.length - trim)) dropped.add(index);
  }

  const shown = times.map((value, index) => {
    const text = formatTime(value, decimals);
    return dropped.has(index) ? `(${text})` : text;
  });

  const numWidth = String(solves.length).length;
  const timeWidth = Math.max(...shown.map((text) => text.length));

  const lines = solves.map((solve, index) => {
    const number = String(index + 1).padStart(numWidth);
    return `${number}. ${shown[index].padEnd(timeWidth)}  ${solve.scramble}`.trimEnd();
  });

  return [
    `${label}: ${formatTime(result, decimals)}`,
    '',
    ...lines,
  ].join('\n');
}
