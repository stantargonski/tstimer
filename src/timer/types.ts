import { DEFAULT_EVENT, eventOf, STARTER_EVENTS, type EventId } from './events';

export type Penalty = 'none' | 'plus2' | 'dnf';

export interface Solve {
  id: number;        // Date.now() at the moment the solve stopped — also its timestamp
  ms: number;        // the raw total, never adjusted
  /** Time from start to the memo split, or null for a solve that wasn't split.
      Execution is always `ms - memoMs`, so it's never stored twice. */
  memoMs: number | null;
  penalty: Penalty;
  scramble: string;
  /** Which event this was timed under. Stored per solve rather than read off the
      session, so switching a session's event never re-files the history behind it
      and an all-time best can be asked of the solves themselves. */
  event: EventId;
  /**
   * How a multi-blind attempt went. Absent on every other event, and on the
   * multi-blind solves recorded before this existed.
   *
   * Optional rather than a new schema version: the reader fills missing fields
   * from defaults, so an older store loads unchanged and an older build reading
   * a newer store simply ignores this.
   */
  mbld?: MbldResult;
  /**
   * A note on the solve, cleaned like a session name and at most
   * `MAX_COMMENT` characters. Absent rather than empty, and optional for the
   * same reason as `mbld`: older stores load without it.
   */
  comment?: string;
}

/** Cubes solved out of cubes attempted, for a multi-blind attempt. */
export interface MbldResult {
  solved: number;
  attempted: number;
}

/**
 * WCA points: one for each cube solved, less one for each missed.
 *
 * The scoring rule is the whole reason multi-blind has to ask rather than just
 * time you — the clock says nothing about whether the attempt counted.
 */
export function mbldPoints(result: MbldResult): number {
  return result.solved - (result.attempted - result.solved);
}

/**
 * WCA 9f12: an attempt scoring under one point is a DNF, which also catches
 * solving one cube out of two.
 */
export function mbldIsDnf(result: MbldResult): boolean {
  return mbldPoints(result) < 1;
}

export interface Session {
  id: string;
  name: string;
  /** What this session is timing. Drives the scramble, the phase machine and
      the stats — a blindfolded session splits memo from execution and skips
      inspection, a 3x3 one does neither. */
  event: EventId;
  /** The puzzles in a custom relay, in order. Only read when `event` is the
      custom relay; absent everywhere else. */
  relay?: EventId[];
  createdAt: number;
  /** Chronological, oldest first. The list UI reverses for display; the stats
      helpers rely on this order so `slice(-n)` means "the most recent n". */
  solves: Solve[];
}

export interface TimerStore {
  schemaVersion: 4;
  sessions: Session[];
  activeId: string;
}

/**
 * The one number every average and best is derived from. Penalties live beside
 * the raw time rather than baked into it, so toggling +2 off restores the
 * original reading exactly.
 *
 * DNF as Infinity is deliberate: it sorts and compares as the worst possible
 * time, which is precisely how WCA averages are supposed to treat it, so the
 * trimming code needs no special case.
 */
export function effectiveMs(solve: Solve): number {
  if (solve.penalty === 'dnf') return Infinity;
  return solve.penalty === 'plus2' ? solve.ms + 2000 : solve.ms;
}

/**
 * What a solve is ranked by: lower is better.
 *
 * The time for every event but multi-blind, which the WCA ranks by points
 * first and time second (9f12c) — 10/10 in 55:00 beats 2/2 in 10:00. A scored
 * attempt is pushed below every time by its points, so `best` and friends need
 * no branch of their own. An unscored multi-blind solve, from before results
 * were asked for, ranks by its time like anything else.
 */
export function rankOf(solve: Solve): number {
  const time = effectiveMs(solve);
  if (!solve.mbld || !Number.isFinite(time)) return time;
  return -mbldPoints(solve.mbld) * MBLD_RANK_STEP + time;
}

/** Wider than any multi-blind time can be (the hour limit plus +2s), so a
    point always outranks any difference in time. */
const MBLD_RANK_STEP = 10 * 3_600_000;

/** Execution time, derived rather than stored so it can never disagree. */
export function execMs(solve: Solve): number | null {
  return solve.memoMs === null ? null : solve.ms - solve.memoMs;
}

export function newSolve(
  ms: number,
  memoMs: number | null,
  scramble: string,
  event: EventId,
  penalty: Penalty = 'none',
  mbld?: MbldResult,
): Solve {
  const solve: Solve = { id: Date.now(), ms, memoMs, penalty, scramble, event };
  // Set rather than spread as undefined, so a non-multi solve carries no key at
  // all and round-trips through JSON exactly as it always did.
  if (mbld) solve.mbld = mbld;
  return solve;
}

/**
 * `seed` disambiguates sessions created in the same millisecond — ten starter
 * sessions built in one tick would otherwise all share an id, and the active
 * one would be whichever the lookup happened to find first.
 */
export function newSession(name: string, event: EventId = DEFAULT_EVENT, seed = 0): Session {
  const createdAt = Date.now();
  return {
    id: `s${createdAt.toString(36)}${seed > 0 ? `-${seed}` : ''}`,
    name,
    event,
    createdAt,
    solves: [],
  };
}

/** Ten empty sessions, one per common event, with 3x3 open. */
export function emptyTimerStore(): TimerStore {
  const sessions = STARTER_EVENTS.map((id, index) => newSession(eventOf(id).name, id, index));
  return { schemaVersion: 4, sessions, activeId: sessions[0].id };
}

/** Storage guarantees at least one session, so this always returns one. */
export function activeSession(store: TimerStore): Session {
  return store.sessions.find((session) => session.id === store.activeId) ?? store.sessions[0];
}
