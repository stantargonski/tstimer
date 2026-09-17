/**
 * Speedcubing convention: truncate, never round — 12.999s is 12.99, not 13.00.
 * Minutes only appear once they exist, so most solves read "14.27".
 *
 * The two non-numbers come from stats.ts: Infinity is a DNF, NaN is "not enough
 * solves yet". Handling them here means no caller has to.
 */
export type Decimals = 0 | 1 | 2 | 3;

export function formatTime(ms: number, decimals: Decimals = 2): string {
  if (Number.isNaN(ms)) return '—';
  if (!Number.isFinite(ms)) return 'DNF';

  const unit = 10 ** (3 - decimals);      // ms per displayed tick
  const perSecond = 1000 / unit;
  const ticks = Math.floor(ms / unit);

  const fraction = ticks % perSecond;
  const seconds = Math.floor(ticks / perSecond) % 60;
  const minutes = Math.floor(ticks / (perSecond * 60));

  const pad = minutes > 0 && seconds < 10 ? '0' : '';
  // At zero places there is no fraction to separate, so there is no point either.
  const tail = decimals === 0
    ? `${pad}${seconds}`
    : `${pad}${seconds}.${String(fraction).padStart(decimals, '0')}`;
  return minutes > 0 ? `${minutes}:${tail}` : tail;
}

/**
 * Local calendar date as `2026-09-02`.
 *
 * Not toLocaleDateString: this ends up in text people paste somewhere else,
 * where an unlabelled 03/09 is ambiguous. Local rather than UTC, because the day
 * you remember solving on is the one your clock showed.
 */
export function dateStamp(when: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/**
 * The other direction, for a goal you type: "18.42", "1:23.4" and "83" all
 * parse. NaN means it isn't a time yet — which formatTime renders as an em
 * dash, so a half-typed goal shows as nothing rather than as a wrong number.
 */
export function parseTime(text: string): number {
  const match = /^(?:(\d+):)?(\d+)(?:[.,](\d+))?$/.exec(text.trim());
  if (!match) return NaN;

  const [, minutes, seconds, fraction] = match;
  // Padded, not parsed: ".4" is four tenths, so it has to become 400ms, and
  // anything past milliseconds is precision the timer never had.
  const ms = (fraction ?? '').slice(0, 3).padEnd(3, '0');
  return (Number(minutes ?? 0) * 60 + Number(seconds)) * 1000 + Number(ms);
}

/**
 * The most digits a typed time is allowed to carry: hh mm ss, then the fraction.
 *
 * Anything past this is a keypress that couldn't have been meant, and silently
 * dropping it beats letting a stray key turn 12.34 into two hours.
 */
export function maxEntryDigits(decimals: 2 | 3): number {
  return 6 + decimals;
}

/**
 * A stream of digits as a time, the way stackmat users type one.
 *
 * The digits fill from the right: the last two (or three, on a timer that
 * reports milliseconds) are the fraction, the next two seconds, then minutes,
 * then hours. So at two places "1234" is 12.34 and "12345" is 1:23.45, and
 * nobody has to reach for a colon or a full stop mid-solve.
 *
 * Which of the two it is, is the user's to say: a stackmat quotes hundredths
 * and most phone timers quote milliseconds, and reading one as the other is off
 * by a factor of ten every time.
 *
 * NaN for an empty string, which formatTime already renders as an em dash.
 */
export function parseDigits(digits: string, decimals: 2 | 3 = 2): number {
  const clean = digits.replace(/\D/g, '').slice(0, maxEntryDigits(decimals));
  if (clean === '') return NaN;

  // What the fraction's digits are worth: 10ms a tick at two places, 1ms at
  // three. The rest of the fields sit above it on the same scale.
  const scale = 10 ** decimals;
  const tick = 1000 / scale;

  const value = Number(clean);
  const fraction = value % scale;
  const seconds = Math.floor(value / scale) % 100;
  const minutes = Math.floor(value / (scale * 100)) % 100;
  const hours = Math.floor(value / (scale * 10_000));

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction * tick;
}

/**
 * The same digits as a clock face to type against, padded so the fraction is
 * always the last two or three.
 *
 * Empty for nothing typed. It used to read "0.00", which looked like a clock
 * showing a time rather than a box waiting for one, and left you deleting a
 * time that was never there. The box it sits in is drawn as a box now, so an
 * empty one still says where to type.
 */
export function digitsFace(digits: string, decimals: 2 | 3 = 2): string {
  const clean = digits.replace(/\D/g, '').slice(0, maxEntryDigits(decimals));
  if (clean === '') return '';

  const padded = clean.padStart(decimals + 1, '0');
  const fraction = padded.slice(-decimals);
  const rest = padded.slice(0, -decimals);     // seconds, then minutes, then hours

  const parts: string[] = [];
  let head = rest;
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  parts.unshift(head);

  // Only the leading group keeps its natural width; the rest are two-digit.
  return `${parts.join(':')}.${fraction}`;
}
