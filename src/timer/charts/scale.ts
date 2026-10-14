/**
 * The two pieces of drawing arithmetic the solve graphs share — the stats page's
 * full-size one and the small one that floats over the timer.
 */

/**
 * Rounds a span out to a readable step, so gridlines land on numbers people use.
 * `divisions` is roughly how many steps the span should break into.
 */
export function niceStep(span: number, divisions = 4): number {
  const rough = span / divisions;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const steps = [1, 2, 2.5, 5, 10];

  for (const step of steps) {
    if (rough <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/** A line that simply stops wherever the average isn't defined or is a DNF. */
export function linePath(
  values: number[],
  x: (index: number) => number,
  y: (ms: number) => number,
): string {
  let out = '';
  let open = false;

  values.forEach((value, index) => {
    if (!Number.isFinite(value)) { open = false; return; }
    out += `${open ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)} `;
    open = true;
  });
  return out.trim();
}

/**
 * The lowest and highest finite values, or null when there are none.
 *
 * A loop rather than `Math.min(...values)`: spreading an array into arguments
 * overflows the stack somewhere past a hundred thousand values, which an
 * all-time view of a big csTimer import can reach.
 */
export function extent(values: Iterable<number>): { low: number; high: number } | null {
  let low = Infinity;
  let high = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  return low <= high ? { low, high } : null;
}
