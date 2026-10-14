import { cleanName } from '../data/limits';
import type { UndoEntry } from './undo';
import type { Session, TimerStore } from './types';

/**
 * Merging, splitting and reordering sessions, and taking each back.
 *
 * Pure, so the settings page and the timer share one version and the checks can
 * run it without a browser. Every operation that loses a session returns the
 * undo entry that restores it; the caller pushes it onto the one undo stack.
 *
 * Undo works from what moved rather than from a copy of the store, the same
 * rule as `undoImport`: a copy would also take back every solve timed since.
 */

export interface Outcome {
  store: TimerStore;
  undo: UndoEntry;
}

/**
 * Every solve in `sourceId` moved into `targetId`, and the source deleted.
 *
 * The target keeps its name, event and relay; each solve keeps the event it
 * was timed under, which it already stores. Ids are identities and the target's
 * are left alone, so an incoming solve that collides is nudged forward a
 * millisecond, as the csTimer import does. Null when either session is missing
 * or they are the same one.
 */
export function mergeSessions(store: TimerStore, sourceId: string, targetId: string): Outcome | null {
  if (sourceId === targetId) return null;
  const index = store.sessions.findIndex((session) => session.id === sourceId);
  const target = store.sessions.find((session) => session.id === targetId);
  if (index === -1 || !target) return null;
  const source = store.sessions[index];

  const taken = new Set(target.solves.map((solve) => solve.id));
  const moved = source.solves.map((solve) => {
    let id = solve.id;
    while (taken.has(id)) id += 1;
    taken.add(id);
    return id === solve.id ? solve : { ...solve, id };
  });

  const merged: Session = {
    ...target,
    // Chronological, oldest first, because everything downstream reads it so.
    solves: [...target.solves, ...moved].sort((a, b) => a.id - b.id),
  };

  const wasActive = store.activeId === sourceId;
  return {
    store: {
      ...store,
      sessions: store.sessions
        .filter((session) => session.id !== sourceId)
        .map((session) => (session.id === targetId ? merged : session)),
      activeId: wasActive ? targetId : store.activeId,
    },
    undo: {
      kind: 'merge',
      source,
      index,
      targetId,
      movedIds: moved.map((solve) => solve.id),
      wasActive,
    },
  };
}

/**
 * The solve `fromId` and every one after it moved into a new session, placed
 * just after the old one and named "<name> (2)", with the same event and relay.
 *
 * Null when the solve isn't there, or is the first — a split there would only
 * rename the session.
 */
export function splitSession(store: TimerStore, sessionId: string, fromId: number): Outcome | null {
  const at = store.sessions.findIndex((session) => session.id === sessionId);
  if (at === -1) return null;
  const session = store.sessions[at];
  const cut = session.solves.findIndex((solve) => solve.id === fromId);
  if (cut <= 0) return null;

  const used = new Set(store.sessions.map((item) => item.id));
  let id = `${session.id}-split`;
  while (used.has(id)) id += 'x';

  const tail = session.solves.slice(cut);
  const created: Session = {
    ...session,
    id,
    name: cleanName(`${session.name} (2)`, 'Session'),
    createdAt: tail[0].id,
    solves: tail,
  };

  const sessions = [...store.sessions];
  sessions.splice(at, 1, { ...session, solves: session.solves.slice(0, cut) }, created);

  return {
    store: { ...store, sessions },
    undo: { kind: 'split', sessionId, createdId: id },
  };
}

/**
 * The store with a merge or split taken back, and a line saying what happened.
 *
 * Solve deletes are the timer's own business and are not handled here. Null
 * when there is nothing left to restore it into.
 */
export function undoSessionOp(
  store: TimerStore,
  entry: UndoEntry,
): { store: TimerStore; message: string } | null {
  if (entry.kind === 'merge') {
    // Already back — a second undo of the same entry must not double it.
    if (store.sessions.some((session) => session.id === entry.source.id)) return null;

    const moved = new Set(entry.movedIds);
    const sessions = store.sessions.map((session) => (
      session.id === entry.targetId
        ? { ...session, solves: session.solves.filter((solve) => !moved.has(solve.id)) }
        : session
    ));
    sessions.splice(Math.min(entry.index, sessions.length), 0, entry.source);

    return {
      store: {
        ...store,
        sessions,
        activeId: entry.wasActive ? entry.source.id : store.activeId,
      },
      message: `${entry.source.name} unmerged`,
    };
  }

  if (entry.kind === 'split') {
    const home = store.sessions.find((session) => session.id === entry.sessionId);
    const created = store.sessions.find((session) => session.id === entry.createdId);
    if (!home || !created) return null;

    const taken = new Set(home.solves.map((solve) => solve.id));
    const back = created.solves.filter((solve) => !taken.has(solve.id));
    const sessions = store.sessions
      .filter((session) => session.id !== entry.createdId)
      .map((session) => (
        session.id === entry.sessionId
          ? { ...session, solves: [...session.solves, ...back].sort((a, b) => a.id - b.id) }
          : session
      ));

    return {
      store: {
        ...store,
        sessions,
        activeId: store.activeId === entry.createdId ? entry.sessionId : store.activeId,
      },
      message: `${home.name} rejoined`,
    };
  }

  return null;
}

/** Ways the sessions list can be put in order. */
export type SessionSort = 'name' | 'newest' | 'solves' | 'lastSolved';

/** When a session was last solved in; never-solved sessions sort last. */
function lastSolved(session: Session): number {
  return session.solves.length > 0 ? session.solves[session.solves.length - 1].id : -Infinity;
}

/**
 * The sessions in a new order, which is the order everything lists them in —
 * the picker, the importer and the csTimer export alike. Stable, so a tie keeps
 * the order it had.
 */
export function sortSessions(store: TimerStore, by: SessionSort): TimerStore {
  const compare: Record<SessionSort, (a: Session, b: Session) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    newest: (a, b) => b.createdAt - a.createdAt,
    solves: (a, b) => b.solves.length - a.solves.length,
    lastSolved: (a, b) => lastSolved(b) - lastSolved(a) || 0,
  };
  return { ...store, sessions: [...store.sessions].sort(compare[by]) };
}

/** One session moved one place up (-1) or down (+1). */
export function moveSession(store: TimerStore, id: string, by: -1 | 1): TimerStore {
  const at = store.sessions.findIndex((session) => session.id === id);
  const to = at + by;
  if (at === -1 || to < 0 || to >= store.sessions.length) return store;

  const sessions = [...store.sessions];
  [sessions[at], sessions[to]] = [sessions[to], sessions[at]];
  return { ...store, sessions };
}
