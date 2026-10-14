import { cleanName, cleanScramble, isSaneDate, isSaneMs } from '../data/limits';
import { DEFAULT_EVENT, isEventId, RELAY_CHOICES, type EventId } from './events';
import {
  emptyTimerStore, type MbldResult, type Session, type Solve, type TimerStore,
} from './types';
import { MBLD_MAX, MBLD_MIN } from './settings';

export const TIMER_KEY = 'timer.store.v1';   // storage slot; the version lives inside the JSON

/**
 * Every schema version this build can still read.
 *
 * One list, exported, because two places check it: the migrator below and the
 * backup importer in src/data/backup.ts. They were separate literals, and a
 * bump that missed one would have had the importer quietly report every solve
 * you own as 'rejected'.
 *
 * Adding a *field* never belongs here — readSolve and migrate fill missing
 * fields from defaults, so a new field needs no new version. Add to this list
 * only when the shape of something already stored actually changes, and add
 * rather than replace: the old numbers are what existing installs still hold.
 */
export const TIMER_STORE_VERSIONS = [1, 2, 3, 4];

export function loadTimerStore(): TimerStore {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return emptyTimerStore();
    return migrate(JSON.parse(raw));
  } catch {
    return emptyTimerStore();
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

/**
 * Writes the store, and says so if it couldn't.
 *
 * `setItem` throws when the origin is out of room, and this is called from a
 * debounced effect — so an unguarded throw here surfaces nowhere, and the app
 * carries on looking like it is saving solves it is actually dropping. Losing
 * the write is bad; losing it silently is the part worth fixing.
 *
 * Deliberately no size check before the attempt: the budget in data/limits.ts
 * is a conservative figure for deciding whether to accept an *import*, and
 * refusing a write here that the browser would have taken would cost the very
 * solves it was meant to protect.
 */
export function saveTimerStore(store: TimerStore): SaveResult {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason:
        'There was no room to save your most recent solves. Export a backup from ' +
        'Settings, then delete a session you no longer need.',
    };
  }
}

/**
 * v1 → v2: sessions gained `mode` and solves gained `memoMs`.
 * v2 → v3: `mode` becomes a full WCA `event`, so '3bld' reads as '333bf' and
 * everything else as '333'.
 * v3 → v4: a solve records its own `event`. Older solves inherit their session's,
 * which is the best answer available and the one the app was already assuming.
 * Every step is a pure widening — no solve is ever dropped for being older than
 * the schema.
 *
 * This runs on every load, so it has to be idempotent: a v4 store passes
 * through unchanged. It also doubles as the integrity pass — a session of
 * solves is the one thing in this app you cannot retype, and one bad record
 * from a hand-edit shouldn't blank the history. Unreadable entries are dropped;
 * everything valid survives.
 */
export function migrate(input: unknown): TimerStore {
  if (!input || typeof input !== 'object') return emptyTimerStore();

  // Deliberately not Partial<TimerStore>: that types schemaVersion as the
  // literal 4, which makes the older checks unreachable. Incoming JSON can be
  // any version, so it has to be read as a plain number.
  const raw = input as { schemaVersion?: number; sessions?: unknown; activeId?: unknown };
  if (!TIMER_STORE_VERSIONS.includes(raw.schemaVersion as number)) return emptyTimerStore();
  if (!Array.isArray(raw.sessions)) return emptyTimerStore();

  const sessions: Session[] = raw.sessions
    .filter((session): session is Session & { mode?: unknown } =>
      !!session && typeof session.id === 'string')
    .map((session) => {
      const event = readEvent(session);
      return {
        id: session.id,
        name: cleanName(session.name, 'Session'),
        event,
        ...readRelay(session),
        createdAt: typeof session.createdAt === 'number' ? session.createdAt : 0,
        solves: Array.isArray(session.solves)
          ? session.solves.map((solve) => readSolve(solve, event)).filter(isSolve)
          : [],
      };
    });

  if (sessions.length === 0) return emptyTimerStore();

  // A dangling activeId would leave the UI with no session to render.
  const active = sessions.find((session) => session.id === raw.activeId);
  return { schemaVersion: 4, sessions, activeId: (active ?? sessions[0]).id };
}

/** v3's `event` if it's there and real, otherwise v2's `mode`, otherwise 3x3. */
/** A custom relay's list, kept only if every entry is still an event the relay
    can hold; anything else leaves the session on the default. */
function readRelay(session: { relay?: unknown }): { relay?: EventId[] } {
  const list = session.relay;
  if (!Array.isArray(list) || list.length === 0 || list.length > RELAY_CHOICES.length * 2) return {};
  if (!list.every((id) => RELAY_CHOICES.includes(id as EventId))) return {};
  return { relay: list as EventId[] };
}

function readEvent(session: { event?: unknown; mode?: unknown }): EventId {
  if (isEventId(session.event)) return session.event;
  return session.mode === '3bld' ? '333bf' : DEFAULT_EVENT;
}

/**
 * Fills in the fields older schemas didn't have. A v1 solve has no memoMs at
 * all; null is correct. Anything before v4 has no event of its own, so it takes
 * the session's — which is exactly what every reader used to assume.
 */
function readSolve(value: unknown, sessionEvent: EventId): unknown {
  if (!value || typeof value !== 'object') return value;
  const solve = value as Partial<Solve>;

  const built: Record<string, unknown> = {
    ...solve,
    scramble: cleanScramble(solve.scramble),
    memoMs: isSaneMs(solve.memoMs) ? solve.memoMs : null,
    event: isEventId(solve.event) ? solve.event : sessionEvent,
  };

  // Checked rather than carried through on the spread: it arrives from the same
  // untrusted places everything else here does.
  const mbld = readMbld(solve.mbld);
  if (mbld) built.mbld = mbld;
  else delete built.mbld;

  return built;
}

/**
 * A multi-blind result, or undefined if the blob isn't one.
 *
 * Bounded by the same cube limits the counter offers, so a hand-edited backup
 * cannot claim ten thousand cubes and have a stats page try to draw it.
 */
function readMbld(value: unknown): MbldResult | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const { solved, attempted } = value as Partial<MbldResult>;
  if (typeof solved !== 'number' || typeof attempted !== 'number') return undefined;
  if (!Number.isInteger(solved) || !Number.isInteger(attempted)) return undefined;
  if (attempted < MBLD_MIN || attempted > MBLD_MAX) return undefined;
  if (solved < 0 || solved > attempted) return undefined;

  return { solved, attempted };
}

function isSolve(value: unknown): value is Solve {
  const solve = value as Partial<Solve> | null;
  return (
    !!solve &&
    // Bounded, not merely typed: an id is a timestamp and a chart's x axis, and
    // a time is every average downstream of it, so a hand-edited backup or a
    // corrupt slot can't put a year-275760 date or a fortnight-long solve where
    // a formatter has to draw it.
    isSaneDate(solve.id) &&
    isSaneMs(solve.ms) &&
    (solve.memoMs === null || isSaneMs(solve.memoMs)) &&
    (solve.penalty === 'none' || solve.penalty === 'plus2' || solve.penalty === 'dnf') &&
    typeof solve.scramble === 'string' &&
    isEventId(solve.event)
  );
}
