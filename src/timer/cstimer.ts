import {
  cleanName, cleanScramble, describeBytes, isSaneDate, isSaneMs,
  MAX_FILE_BYTES, STORE_BUDGET,
} from '../data/limits';
import { DEFAULT_EVENT, eventOf, type EventId } from './events';
import { emptyTimerStore, type Penalty, type Session, type Solve, type TimerStore } from './types';

/**
 * Reading a csTimer export.
 *
 * csTimer's "export to file" writes one JSON object: a `sessionN` key per
 * session holding an array of solves, plus a `properties` blob whose
 * `sessionData` field — itself a *string* of JSON — carries the names and the
 * scramble type each session was set to.
 *
 * A solve is `[[penalty, total, ...phases], scramble, comment, seconds]`:
 *   penalty  0 normal, 2000 a +2, -1 a DNF
 *   total    what a judge would read — a +2 already has its two seconds in it
 *   phases   multi-phase split points, cumulative from the start of the solve
 *   seconds  unix seconds, not milliseconds
 *
 * Everything here treats that file as hostile until proved otherwise: see
 * `../data/limits` for what is bounded and why. Nothing in this module writes
 * to storage or decides anything the importer can't show you first — parsing
 * produces a description of the file, `planImport` turns it into a proposal you
 * can edit, and `applyImport` is the only step that changes a store.
 */

/** One solve as csTimer wrote it, before an event has been settled on. */
export interface RawSolve {
  ms: number;
  penalty: Penalty;
  scramble: string;
  /** Epoch milliseconds, or 0 when the export carried no usable date. */
  at: number;
  /** Multi-phase split points, cumulative from the start of the solve. */
  phases: number[];
}

export interface ImportedSession {
  /** csTimer's own key, "session1" — the row's identity in the picker. */
  key: string;
  name: string;
  /** Guessed from the scramble type, and overridable before the import runs. */
  event: EventId;
  /** csTimer's scramble type, kept so the UI can say where the guess came from. */
  scrType: string;
  solves: RawSolve[];
}

export interface CsTimerFile {
  sessions: ImportedSession[];
  /** Entries across the whole file that weren't readable as solves. */
  skipped: number;
  /** Scrambles that were longer than this app keeps and were cut. */
  trimmed: number;
}

/** Past these a file is not a history, it is an attack or a mistake. */
const MAX_SESSIONS = 200;
const MAX_SOLVES = 50_000;
/** csTimer allows four phases; a few more costs nothing and bounds the array. */
const MAX_PHASES = 8;

/**
 * Scramble types that don't say their event in the first three characters.
 * `ni` is csTimer for blindfolded, and `r3ni` is its multi-blind generator.
 */
const EXACT: Record<string, EventId> = {
  '333ni': '333bf',
  '333fm': '333fm',
  '333oh': '333oh',
  '444ni': '444bf',
  '444bld': '444bf',
  '555ni': '555bf',
  '555bld': '555bf',
  'r3ni': '333mbf',
};

/**
 * Everything else goes by prefix, because csTimer has a dozen generators per
 * puzzle — `pyrso`, `pyro`, `pyrm` and `pyrl` are all Pyraminx — and the puzzle
 * is what this app files a solve under.
 */
const PREFIXES: [string, EventId][] = [
  ['222', '222'],
  ['333', '333'],
  ['444', '444'],
  ['555', '555'],
  ['666', '666'],
  ['777', '777'],
  ['clk', 'clock'],
  ['mgm', 'minx'],
  ['minx', 'minx'],
  ['pyr', 'pyram'],
  ['skb', 'skewb'],
  ['sq1', 'sq1'],
  ['sqr', 'sq1'],
];

/**
 * csTimer's scramble type as one of this app's events.
 *
 * Falls back to 3x3 rather than refusing: an unknown generator is nearly always
 * a 3x3 subset — `zbll`, `lse`, `edges` — and a session sitting under the wrong
 * event is one dropdown away from being right, where a session that refused to
 * import is a file you have to go and find again.
 *
 * Note that this can only ever return an id from this app's own table: the
 * file's string selects an event, it never becomes one.
 */
export function eventFromScramble(scrType: string): EventId {
  const type = scrType.trim().toLowerCase();
  if (type === '') return DEFAULT_EVENT;
  if (Object.hasOwn(EXACT, type)) return EXACT[type];

  for (const [prefix, id] of PREFIXES) {
    if (type.startsWith(prefix)) return id;
  }
  return DEFAULT_EVENT;
}

interface SessionMeta {
  name?: unknown;
  scrType?: unknown;
}

/**
 * The names and scramble types, out of the JSON-inside-JSON they're kept in.
 *
 * A Map rather than an object, and `hasOwn` rather than `in`, so a file
 * carrying a key called `__proto__` or `constructor` is a lookup that misses
 * rather than a prototype that moves.
 */
function readMeta(root: Record<string, unknown>): Map<string, SessionMeta> {
  const out = new Map<string, SessionMeta>();
  const properties = Object.hasOwn(root, 'properties')
    ? (root.properties as { sessionData?: unknown } | null)
    : null;
  const raw = properties && typeof properties === 'object' ? properties.sessionData : undefined;

  let data: unknown = raw;
  if (typeof raw === 'string') {
    // Bounded like the file itself: this string is attacker-shaped too.
    if (raw.length > MAX_FILE_BYTES) return out;
    try {
      data = JSON.parse(raw);
    } catch {
      return out;   // names are a nicety; the solves are the point
    }
  }
  if (!data || typeof data !== 'object') return out;

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    if (out.size >= MAX_SESSIONS) break;

    const record = value as { name?: unknown; opt?: { scrType?: unknown } | null };
    const opt = record.opt && typeof record.opt === 'object' ? record.opt : null;
    out.set(key, { name: record.name, scrType: opt?.scrType });
  }
  return out;
}

/**
 * csTimer names a session with its own number until you rename it, so a bare
 * number is a default and gets labelled as one — a picker full of sessions
 * called "1" through "12" would say nothing about where they came from.
 */
function sessionName(meta: SessionMeta | undefined, number: string): string {
  return cleanName(meta?.name, `csTimer ${number}`);
}

interface ReadSolve {
  solve: RawSolve;
  /** The scramble was longer than this app stores and was cut. */
  trimmed: boolean;
}

function readSolve(entry: unknown): ReadSolve | null {
  if (!Array.isArray(entry)) return null;

  const [time, scramble, , date] = entry as unknown[];
  const parts = Array.isArray(time)
    // Sliced before filtering: the length of this array is the file's choice.
    ? time.slice(0, 2 + MAX_PHASES).filter((part): part is number => typeof part === 'number')
    : typeof time === 'number'
      ? [0, time]           // the oldest exports wrote a bare time and no penalty
      : null;
  if (!parts || parts.length < 2) return null;

  const [flag, total] = parts;
  // A time of zero, a negative, a NaN or a fortnight is not a solve. Rejecting
  // it here keeps every downstream average, axis and formatter honest.
  if (!isSaneMs(total) || total <= 0) return null;

  // The penalty lives beside the raw time here rather than baked into it, so
  // the two seconds csTimer added come back out and toggling the +2 off
  // restores the original reading.
  const penalty: Penalty = flag === -1 ? 'dnf' : flag === 2000 ? 'plus2' : 'none';
  const ms = penalty === 'plus2' ? Math.max(0, total - 2000) : total;

  // A date is also an id and a point on an axis, so an impossible one is
  // dropped rather than carried: the solve keeps its place in the order and
  // gets a synthetic id instead.
  const at = typeof date === 'number' ? Math.round(date * 1000) : 0;
  const raw = typeof scramble === 'string' ? scramble : '';
  const kept = cleanScramble(raw);

  return {
    solve: {
      ms,
      penalty,
      scramble: kept,
      at: isSaneDate(at) ? at : 0,
      phases: parts.slice(2).filter(isSaneMs),
    },
    trimmed: kept.length < raw.length,
  };
}

/**
 * What a csTimer export holds, without changing anything.
 *
 * Throws when the file isn't a csTimer export at all, and when it is too big to
 * be one. Past that, a record that can't be read is counted and skipped: one
 * bad solve in a thousand shouldn't cost you the other nine hundred and
 * ninety-nine.
 */
export function parseCsTimer(text: string): CsTimerFile {
  if (text.length > MAX_FILE_BYTES) {
    throw new Error(`That file is larger than ${describeBytes(MAX_FILE_BYTES)} — too big to be a csTimer export.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't JSON. csTimer's is the .txt from Export → Export to file.");
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('That file is JSON, but not a csTimer export.');
  }

  const root = parsed as Record<string, unknown>;
  const meta = readMeta(root);
  const sessions: ImportedSession[] = [];
  let skipped = 0;
  let trimmed = 0;
  let total = 0;
  let sawSession = false;

  for (const [key, value] of Object.entries(root)) {
    // The only keys ever read are the ones matching this shape, which is also
    // why no `__proto__` or `constructor` from the file reaches anything.
    const match = /^session(\d+)$/.exec(key);
    if (!match || !Array.isArray(value)) continue;
    sawSession = true;

    if (sessions.length >= MAX_SESSIONS) {
      throw new Error(`That export holds more than ${MAX_SESSIONS} sessions, which is more than this can be.`);
    }

    const solves: RawSolve[] = [];
    for (const entry of value) {
      const read = readSolve(entry);
      if (!read) {
        skipped += 1;
        continue;
      }

      total += 1;
      if (total > MAX_SOLVES) {
        throw new Error(
          `That export holds more than ${MAX_SOLVES.toLocaleString()} solves — more than a browser will store. Split it in csTimer and import the halves.`,
        );
      }

      if (read.trimmed) trimmed += 1;
      solves.push(read.solve);
    }
    // csTimer ships fifteen empty sessions nobody has ever used. Offering them
    // would bury the two that actually hold solves.
    if (solves.length === 0) continue;

    const info = meta.get(match[1]);
    const scrType = typeof info?.scrType === 'string' ? info.scrType.slice(0, 32) : '';
    solves.sort((a, b) => a.at - b.at);
    sessions.push({
      key,
      name: sessionName(info, match[1]),
      event: eventFromScramble(scrType),
      scrType,
      solves,
    });
  }

  if (!sawSession) {
    throw new Error('That file has no csTimer sessions in it — nothing named "session1".');
  }
  if (sessions.length === 0) {
    throw new Error('That is a real export, but every session in it is empty.');
  }

  sessions.sort((a, b) => Number(a.key.slice(7)) - Number(b.key.slice(7)));
  return { sessions, skipped, trimmed };
}

/** The destination for a row that should become a session of its own. */
export const NEW_SESSION = 'new';

/**
 * One row of the importer, as you have it set.
 *
 * The parse result is left alone and this carries the decisions, so changing
 * your mind about an event or a destination never means re-reading the file.
 */
export interface ImportRow {
  source: ImportedSession;
  /** Unticked rows are described but not imported. */
  include: boolean;
  /** Used when the destination is a new session; ignored when appending. */
  name: string;
  event: EventId;
  /** `NEW_SESSION`, or the id of an existing session to add these solves to. */
  destination: string;
}

/**
 * Whether a session that looks like this one is already here.
 *
 * Same name and same number of solves is what a second read of the same file
 * looks like. It's a guess, so it only unticks a row rather than hiding it —
 * two sessions can legitimately match, and the fix is one click.
 */
export function looksImported(store: TimerStore, session: ImportedSession): boolean {
  return store.sessions.some(
    (existing) => existing.name === session.name && existing.solves.length === session.solves.length,
  );
}

/** The importer's opening proposal: everything new, each as its own session. */
export function planImport(file: CsTimerFile, store: TimerStore): ImportRow[] {
  return file.sessions.map((source) => ({
    source,
    include: !looksImported(store, source),
    name: source.name,
    event: source.event,
    destination: NEW_SESSION,
  }));
}

/** How many solves the ticked rows would bring in, before any deduplication. */
export function countSolves(rows: ImportRow[]): number {
  return rows.reduce((total, row) => total + (row.include ? row.source.solves.length : 0), 0);
}

/**
 * csTimer's solves as this app's, under the event the row settled on.
 *
 * A solve's id is also its timestamp and its key in every list, so ids have to
 * be unique and ascending. csTimer records whole seconds, which two solves can
 * easily share, so a collision is nudged forward a millisecond rather than
 * being left to shadow the solve before it.
 */
function toSolves(raws: RawSolve[], event: EventId, base: number): Solve[] {
  const split = eventOf(event).split;
  const out: Solve[] = [];
  let last = 0;

  for (const raw of raws) {
    let id = raw.at > 0 ? raw.at : base + out.length;
    if (id <= last) id = last + 1;
    last = id;

    // Only a blindfolded event has a memo to split off, and only a multi-phase
    // csTimer session ever recorded one. The first split is where memo ended.
    const memo = split ? raw.phases.find((phase) => phase > 0 && phase < raw.ms) : undefined;

    out.push({
      id,
      ms: raw.ms,
      memoMs: memo ?? null,
      penalty: raw.penalty,
      scramble: raw.scramble,
      event,
    });
  }
  return out;
}

/** What one row did, once the import has run. */
export interface ImportResult {
  /** The session the solves are in now. */
  name: string;
  sessionId: string;
  event: EventId;
  /** A session of its own, or added to one that was already here. */
  created: boolean;
  added: number;
  /** Solves the destination already had, left alone rather than doubled. */
  skipped: number;
  /** The ids the added solves ended up with, so an undo takes out exactly
      these and nothing timed alongside them. */
  addedIds: number[];
}

export interface ImportOutcome {
  store: TimerStore;
  results: ImportResult[];
  added: number;
  skipped: number;
}

/**
 * Adding solves to a session that already has some.
 *
 * A solve already there — same millisecond, same time — is skipped rather than
 * doubled, which is what makes re-importing an updated export pick up only what
 * is new. A collision that *isn't* a duplicate moves the incoming solve, never
 * the one already stored: an id is an identity, and rewriting the ids of solves
 * someone has been looking at for a year to make room is the wrong trade.
 */
function appendTo(
  target: Session,
  incoming: Solve[],
): { session: Session; added: number; skipped: number; addedIds: number[] } {
  const taken = new Set(target.solves.map((solve) => solve.id));
  const same = new Set(target.solves.map((solve) => `${solve.id}:${solve.ms}`));
  const kept: Solve[] = [];
  let skipped = 0;

  for (const solve of incoming) {
    if (same.has(`${solve.id}:${solve.ms}`)) {
      skipped += 1;
      continue;
    }

    let id = solve.id;
    while (taken.has(id)) id += 1;
    taken.add(id);
    kept.push({ ...solve, id });
  }

  return {
    session: {
      ...target,
      // Chronological, oldest first, because everything downstream reads it so.
      solves: [...target.solves, ...kept].sort((a, b) => a.id - b.id),
    },
    added: kept.length,
    skipped,
    addedIds: kept.map((solve) => solve.id),
  };
}

/**
 * The store with the ticked rows imported, and a report of what happened.
 *
 * Added, never substituted: an import is something you do *to* a history, and a
 * csTimer file arriving is no reason to lose what this app has already timed.
 * The refusal at the end is the important part — localStorage fails by throwing
 * on a write that happens well after this returns, so a store too big to save
 * has to be refused here, while there is still something to refuse.
 */
export function applyImport(store: TimerStore, rows: ImportRow[]): ImportOutcome {
  const chosen = rows.filter((row) => row.include);
  if (chosen.length === 0) return { store, results: [], added: 0, skipped: 0 };

  const base = Date.now();
  const sessions = [...store.sessions];
  const used = new Set(sessions.map((session) => session.id));
  const results: ImportResult[] = [];

  if (sessions.length + chosen.length > MAX_SESSIONS) {
    throw new Error(`That would leave more than ${MAX_SESSIONS} sessions. Import fewer at a time.`);
  }

  chosen.forEach((row, index) => {
    const solves = toSolves(row.source.solves, row.event, base + index);
    const at = sessions.findIndex((session) => session.id === row.destination);

    if (at === -1) {
      // A new session — including when the chosen destination has been deleted
      // in another tab since the file was read.
      let id = `cs${base.toString(36)}-${index}`;
      while (used.has(id)) id += 'x';
      used.add(id);

      const session: Session = {
        id,
        name: cleanName(row.name, row.source.name),
        event: row.event,
        // The day the solving started, not the day it was imported.
        createdAt: solves[0]?.id ?? base,
        solves,
      };
      sessions.push(session);
      results.push({
        name: session.name, sessionId: id, event: row.event,
        created: true, added: solves.length, skipped: 0,
        addedIds: solves.map((solve) => solve.id),
      });
      return;
    }

    const merged = appendTo(sessions[at], solves);
    sessions[at] = merged.session;
    results.push({
      name: merged.session.name, sessionId: merged.session.id, event: row.event,
      created: false, added: merged.added, skipped: merged.skipped,
      addedIds: merged.addedIds,
    });
  });

  const next: TimerStore = { ...store, sessions, activeId: results[0].sessionId };

  const size = JSON.stringify(next).length;
  if (size > STORE_BUDGET) {
    throw new Error(
      `That would make about ${describeBytes(size)} of solves, more than the browser will keep for one site. Import fewer sessions, or export and clear some of what is here first.`,
    );
  }

  return {
    store: next,
    results,
    added: results.reduce((total, result) => total + result.added, 0),
    skipped: results.reduce((total, result) => total + result.skipped, 0),
  };
}

/**
 * The store with one import taken back out.
 *
 * Works from what the import *added* rather than from a copy of the store as it
 * was: a copy would also take back every solve timed since, and every rename.
 * Sessions the import created go whole; sessions it added to lose exactly the
 * solves it put there and nothing else.
 */
export function undoImport(store: TimerStore, results: ImportResult[]): TimerStore {
  const created = new Set<string>();
  const added = new Map<string, Set<number>>();
  for (const result of results) {
    if (result.created) {
      created.add(result.sessionId);
      continue;
    }
    // Two rows can land in the same session, so their ids are pooled.
    const ids = added.get(result.sessionId) ?? new Set<number>();
    for (const id of result.addedIds) ids.add(id);
    added.set(result.sessionId, ids);
  }

  const sessions = store.sessions
    .filter((session) => !created.has(session.id))
    .map((session) => {
      const ids = added.get(session.id);
      return ids ? { ...session, solves: session.solves.filter((solve) => !ids.has(solve.id)) } : session;
    });

  // Never leave the store with nothing to render.
  if (sessions.length === 0) return emptyTimerStore();
  const activeId = sessions.some((session) => session.id === store.activeId)
    ? store.activeId
    : sessions[0].id;
  return { ...store, sessions, activeId };
}
