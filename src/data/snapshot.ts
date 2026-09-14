/**
 * A copy of everything stored, taken once, the first time a new build runs.
 *
 * The readers in this app are careful — every one of them falls back field by
 * field rather than throwing — but "careful" and "reversible" are different
 * properties. If a build ever does read something wrong, the old bytes are
 * already gone by the time anyone notices, because the app rewrites what it
 * loaded. This keeps the bytes.
 *
 * Two details are load-bearing:
 *
 * It lives in IndexedDB, not localStorage. The solve history is one blob
 * against a ~5 MB origin budget, and a second copy beside it could be the write
 * that pushes the original over.
 *
 * The capture is *synchronous*. Everything before the first `await` below runs
 * in the same tick as the call, which is what makes this safe: App.tsx re-saves
 * the migrated timer store 400ms after mount, so a snapshot that waited on the
 * database would photograph the new shape rather than the old one.
 */

import { SLOT_KEYS } from './backup';
import { idbDelete, idbGet, idbPut } from './idb';
import { clearBackground, getBackground, putBackground } from '../theme/imageStore';

/**
 * Bump this on any release that changes how stored data is read or written.
 *
 * It is not a schema version and nothing branches on its value — it is only the
 * "have I run here before?" marker that decides whether to take a snapshot.
 */
export const APP_BUILD = '2026-09-03';

const BUILD_SEEN_KEY = 'app.build.seen';
const SNAPSHOT_KEY = 'pre-migration-snapshot';

export interface Snapshot {
  /** The build that was starting up when this was taken. */
  build: string;
  /** The build that wrote the data, or null if it predates this marker. */
  previousBuild: string | null;
  takenAt: string;
  /** Raw localStorage strings, verbatim. Never re-serialised, never migrated. */
  data: Record<string, string>;
}

/** Guards against a double invocation in React's development strict mode. */
let started = false;

/**
 * Photographs every slot if this build hasn't run on this browser before.
 *
 * Call it before the first render. Failures are swallowed on purpose: a browser
 * that won't open a database is a browser that gets no safety net, which is not
 * a reason to refuse to start.
 */
export async function takeSnapshotIfNewBuild(): Promise<void> {
  if (started) return;
  started = true;

  // Synchronous, and that is the point: this must finish reading before the app
  // renders and starts rewriting what it loaded.
  const snapshot = capture();
  if (!snapshot) return;

  try {
    await idbPut(SNAPSHOT_KEY, snapshot);
  } catch {
    // Out of quota, or a blocked database. The app still works.
  } finally {
    // Marked either way. Retrying a write that failed for a structural reason
    // on every single load costs more than the snapshot is worth.
    markSeen();
  }
}

/** Reads every slot as it stands right now. Never async — see above. */
function capture(): Snapshot | null {
  try {
    const previousBuild = localStorage.getItem(BUILD_SEEN_KEY);
    if (previousBuild === APP_BUILD) return null;

    const data = readSlots();

    // A fresh install has nothing worth a snapshot; just remember the build.
    if (Object.keys(data).length === 0) {
      markSeen();
      return null;
    }

    return {
      build: APP_BUILD,
      previousBuild,
      takenAt: new Date().toISOString(),
      data,
    };
  } catch {
    // No localStorage at all. Nothing to protect.
    return null;
  }
}

/** Every slot's raw string as it stands right now. Synchronous, and throws
    only where localStorage itself does. */
function readSlots(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of SLOT_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw !== null) data[key] = raw;
  }
  return data;
}

function markSeen(): void {
  try {
    localStorage.setItem(BUILD_SEEN_KEY, APP_BUILD);
  } catch {
    // Full or unavailable; the snapshot above is the part that mattered.
  }
}

export async function getSnapshot(): Promise<Snapshot | null> {
  const value = await idbGet<Snapshot>(SNAPSHOT_KEY);
  if (!value || typeof value !== 'object') return null;
  if (typeof value.data !== 'object' || value.data === null) return null;
  return value;
}

/**
 * Puts the photographed bytes back exactly as they were.
 *
 * Writes raw strings rather than parsed objects, so a restore returns the slot
 * to the state the old build left it in rather than to this build's reading of
 * it. The caller reloads afterwards — half this app's state is already in React
 * by the time anyone can press the button.
 */
export async function restoreSnapshot(): Promise<boolean> {
  const snapshot = await getSnapshot();
  if (!snapshot) return false;

  try {
    for (const [key, raw] of Object.entries(snapshot.data)) {
      if (typeof raw === 'string') localStorage.setItem(key, raw);
    }
    return true;
  } catch {
    return false;
  }
}

export async function clearSnapshot(): Promise<void> {
  await idbDelete(SNAPSHOT_KEY);
}

/**
 * The same idea for a backup import: a copy of everything, taken just before
 * the import writes over it, so the import can be taken back.
 *
 * Kept in IndexedDB beside the snapshot, for the same budget reason, and kept
 * across the reload an import needs — the undo is offered again afterwards.
 * One copy only: a second import replaces it, and undo means the last one.
 */
const IMPORT_COPY_KEY = 'pre-import-copy';

export interface ImportCopy {
  takenAt: string;
  /** Raw localStorage strings, verbatim, like the snapshot's. */
  data: Record<string, string>;
  /** The background picture, which lives outside localStorage. */
  background: Blob | null;
}

/** Throws if the copy could not be kept; the caller decides whether to go on. */
export async function takeImportCopy(): Promise<void> {
  // Read before the first await, so nothing can write in between.
  const data = readSlots();
  const copy: ImportCopy = {
    takenAt: new Date().toISOString(),
    data,
    background: await getBackground(),
  };
  await idbPut(IMPORT_COPY_KEY, copy);
}

export async function getImportCopy(): Promise<ImportCopy | null> {
  const value = await idbGet<ImportCopy>(IMPORT_COPY_KEY);
  if (!value || typeof value !== 'object') return null;
  if (typeof value.data !== 'object' || value.data === null) return null;
  return value;
}

/**
 * Puts everything back as it was before the last import, then forgets the copy.
 *
 * Slots the copy doesn't hold are removed rather than left alone: they are ones
 * the import created, and leaving them would be half an undo. The caller
 * reloads afterwards, as it does after the import itself.
 */
export async function restoreImportCopy(): Promise<boolean> {
  const copy = await getImportCopy();
  if (!copy) return false;

  try {
    for (const key of SLOT_KEYS) {
      const raw = copy.data[key];
      if (typeof raw === 'string') localStorage.setItem(key, raw);
      else localStorage.removeItem(key);
    }
    if (copy.background instanceof Blob) await putBackground(copy.background);
    else await clearBackground();
    await idbDelete(IMPORT_COPY_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes every trace of this app from this browser.
 *
 * The snapshot goes with it, and that is the point worth being deliberate
 * about: leaving it behind would mean "delete everything" quietly kept a full
 * copy of everything, and the restore button in Settings would offer to bring
 * it all back. A delete that can be undone by accident is not a delete.
 *
 * The build marker goes too, so the next load is treated as a first run rather
 * than photographing the empty state over the top of nothing.
 */
export async function eraseEverything(): Promise<void> {
  try {
    for (const key of SLOT_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(BUILD_SEEN_KEY);
  } catch {
    // Nothing readable to remove.
  }

  await clearSnapshot();
  await idbDelete(IMPORT_COPY_KEY);
  await clearBackground();
}
