/**
 * The bounds every imported file is held to, and the reasoning behind them.
 *
 * A file arrives because someone chose it, and "chosen" is not "trusted":
 * exports get mailed around, posted in Discord and downloaded from strangers,
 * and a file that is merely corrupt arrives through the same input as one built
 * to cause trouble. So nothing read from a file is believed — it is bounded.
 *
 * There is no HTML sink anywhere in this app (React escapes every string it
 * draws and nothing calls innerHTML or eval), so the interesting attacks are
 * not script injection. They are:
 *
 *   exhaustion — a hundred megabytes of JSON, or a session holding ten million
 *     solves, freezing the tab for as long as it takes to parse and render;
 *   eviction — an import large enough to blow the ~5 MB localStorage allowance,
 *     which does not fail loudly but leaves the store unwritable, so the next
 *     reload silently loses the solves you already had;
 *   spoofing — a session "name" carrying bidi overrides or ten thousand
 *     characters, which React will faithfully draw straight through the picker
 *     and out the other side of the layout.
 *
 * Each limit below answers one of those. They are deliberately generous — a
 * real csTimer history has to pass — but they are finite, which is the point.
 */

/** Twenty megabytes of JSON: comfortably past any real export, short of a bomb. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Long enough for any name worth having, short enough to draw in a row. */
export const MAX_NAME = 60;

/** A solve's comment: a sentence or two, the length csTimer users write. */
export const MAX_COMMENT = 200;

/** A 7x7 WCA scramble is about 500 characters; a 5BLD one with a rotation, less. */
export const MAX_SCRAMBLE = 1000;

/** Nobody has ever timed a solve for a day. A bigger number is a broken record. */
export const MAX_SOLVE_MS = 24 * 60 * 60 * 1000;

/** Speedcubing timers postdate this comfortably; anything earlier is a bad date. */
export const MIN_SOLVE_DATE = Date.UTC(2000, 0, 1);

/**
 * How far past now a stored solve date may sit before it reads as junk.
 *
 * Generous on purpose. This is a filter against a corrupt file writing a
 * year-275760 date into a chart axis, not a clock-accuracy check — and it runs
 * on every load, over records already saved. A tight bound here means someone
 * whose machine clock was running fast records a solve, fixes their clock, and
 * finds that solve quietly deleted the next time the app starts.
 */
export const MAX_CLOCK_SKEW = 365 * 24 * 60 * 60 * 1000;

/**
 * What a store is allowed to grow to, in characters of JSON.
 *
 * Browsers give an origin about 5 MB of localStorage and enforce it by throwing
 * on the write — which, for this app, happens inside a debounced effect long
 * after the import looked like it worked. Refusing beforehand turns a silent
 * loss of the whole history into a sentence explaining what to do instead.
 */
export const STORE_BUDGET = 4_500_000;

/**
 * Characters that let text lie about what it is: the C0 and C1 controls, the
 * bidi overrides and isolates, zero-width joiners and spaces, and the byte
 * order mark. None of them belong in a session name, and all of them can make
 * one render as something other than what it holds.
 */
function isDeceptive(code: number): boolean {
  return (
    code < 0x20 ||                        // C0 controls, newlines and tabs included
    (code >= 0x7f && code <= 0x9f) ||     // DEL and the C1 controls
    (code >= 0x200b && code <= 0x200f) || // zero-width spaces and the bidi marks
    (code >= 0x2028 && code <= 0x202e) || // separators and the bidi overrides
    (code >= 0x2060 && code <= 0x206f) || // invisible formatting
    code === 0xfeff                       // byte order mark
  );
}

/**
 * A name from a file, as something safe to draw.
 *
 * Escaping is React's job and it does it; this is about the things escaping
 * doesn't touch — a right-to-left override rewriting the row around it, a
 * newline breaking the layout, or a name long enough to push every other column
 * off the screen.
 */
export function cleanName(value: unknown, fallback: string, max = MAX_NAME): string {
  if (typeof value !== 'string') return fallback;

  // Cut before inspecting, not after: a name arriving as ten megabytes of text
  // is refused for the price of a slice rather than a walk.
  let flat = '';
  for (const character of value.slice(0, max * 4)) {
    flat += isDeceptive(character.codePointAt(0) ?? 0) ? ' ' : character;
  }

  flat = flat.replace(/\s+/g, ' ').trim();
  if (flat === '') return fallback;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * A solve's comment, cleaned the way a name is, or undefined when there is
 * nothing left — so a solve with no comment carries no key at all.
 */
export function cleanComment(value: unknown): string | undefined {
  const clean = cleanName(value, '', MAX_COMMENT);
  if (clean === '') return undefined;
  // cleanName marks a cut with an ellipsis past its limit; this one is a hard cap.
  return clean.length > MAX_COMMENT ? `${clean.slice(0, MAX_COMMENT - 1)}…` : clean;
}

/**
 * A scramble, cut to a length that can be stored and shown.
 *
 * Only the length is touched: a scramble is never executed or parsed on this
 * path — it is text in a list and text in the clipboard — so odd characters in
 * one cost nothing, while an unbounded one costs the storage budget.
 */
export function cleanScramble(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length > MAX_SCRAMBLE ? value.slice(0, MAX_SCRAMBLE) : value;
}

/** A duration that could have come off a stopwatch. */
export function isSaneMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_SOLVE_MS;
}

/**
 * A timestamp that could be a solve's.
 *
 * Bounded at both ends because a date is also an id and a chart's x axis: a
 * year-275760 date is an Invalid Date in every formatter that touches it, and a
 * date in 1970 drags three years of history into one unreadable pixel.
 */
export function isSaneDate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_SOLVE_DATE &&
    value <= Date.now() + MAX_CLOCK_SKEW
  );
}

/** "20 MB", "1.4 MB" — for saying what a limit was in the message that refuses. */
export function describeBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/**
 * The one thing worth checking before a file is even read into memory.
 *
 * `File.size` is known without touching the contents, so an absurd file is
 * refused for the price of a property read rather than the price of decoding it.
 */
export function tooBig(bytes: number): boolean {
  return bytes > MAX_FILE_BYTES;
}
