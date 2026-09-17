import { describeBytes, MAX_FILE_BYTES, STORE_BUDGET } from './limits';
import { migrate as migratePairs, PAIRS_KEY, PAIRS_VERSIONS } from '../bld/letterPairs/storage';
import { CFOP_KEY, CFOP_VERSIONS, normalizeCfopStore } from '../cfop/storage';
import { readSettings, SETTINGS_KEY } from '../settings/defaults';
import { readTimerSettings, TIMER_SETTINGS_KEY } from '../timer/settings';
import { migrate as migrateTimer, TIMER_KEY, TIMER_STORE_VERSIONS } from '../timer/storage';
import { effectiveMs, execMs, type Session, type Solve } from '../timer/types';
import { eventOf } from '../timer/events';
import { dateStamp, formatTime, type Decimals } from '../timer/format';
import { APPEARANCE_KEY, readAppearance } from '../theme/theme';
import { KEYMAP_KEY, readKeymap } from '../keys/keymap';
import {
  clearBackground, fromDataUrl, getBackground, putBackground, toDataUrl,
} from '../theme/imageStore';

export const BACKUP_APP = 'rubiks-trainer';
export const BACKUP_VERSION = 1;

/**
 * One storage slot and the gate an incoming copy of it has to pass.
 *
 * `accept` returns what to store, or null to leave the slot alone. Nothing here
 * validates by hand: every slot reuses the same reader the app already trusts
 * on startup, so an imported file can only ever produce a state the app was
 * already able to load.
 */
interface Slot {
  key: string;
  label: string;
  accept: (value: unknown) => unknown;
}

/**
 * A store has to *look* like itself before it goes anywhere near the migrator.
 * The migrators fall back to an empty store on junk, which is right on startup
 * — better an empty library than a blank screen — and exactly wrong here, where
 * it would trade a full library for an empty one on the strength of a typo.
 */
function looksLikeStore(value: unknown, versions: number[], field: string): boolean {
  if (!value || typeof value !== 'object') return false;

  const raw = value as Record<string, unknown>;
  return (
    typeof raw.schemaVersion === 'number' &&
    versions.includes(raw.schemaVersion) &&
    typeof raw[field] === 'object' &&
    raw[field] !== null
  );
}

const SLOTS: Slot[] = [
  {
    key: PAIRS_KEY,
    label: 'letter pairs',
    accept: (value) => (looksLikeStore(value, PAIRS_VERSIONS, 'pairs') ? migratePairs(value) : null),
  },
  {
    key: SETTINGS_KEY,
    label: 'buffers',
    accept: (value) => readSettings(value),
  },
  {
    key: TIMER_KEY,
    label: 'sessions and solves',
    accept: (value) => (looksLikeStore(value, TIMER_STORE_VERSIONS, 'sessions') ? migrateTimer(value) : null),
  },
  {
    key: TIMER_SETTINGS_KEY,
    label: 'timer settings',
    accept: (value) => readTimerSettings(value),
  },
  {
    key: CFOP_KEY,
    label: 'CFOP algs',
    accept: (value) => (looksLikeStore(value, CFOP_VERSIONS, 'cases') ? normalizeCfopStore(value) : null),
  },
  {
    key: APPEARANCE_KEY,
    label: 'appearance',
    accept: (value) => readAppearance(value),
  },
  {
    key: KEYMAP_KEY,
    label: 'keyboard shortcuts',
    accept: (value) => readKeymap(value),
  },
];

/**
 * Every localStorage slot this app owns.
 *
 * Exported so the pre-migration snapshot in src/data/snapshot.ts copies exactly
 * what a backup would. A slot added to SLOTS is picked up by both without
 * anyone having to remember the second place.
 */
export const SLOT_KEYS: string[] = SLOTS.map((slot) => slot.key);

export interface Backup {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
  /** The background picture as a data URL — the one thing not kept in localStorage. */
  background?: string;
}

/**
 * Everything this app has stored, as one file's worth of text.
 *
 * Async only because of the background picture, which lives in IndexedDB. It's
 * carried inline rather than left behind: "export everything" that quietly
 * means "everything except your wallpaper" is the kind of thing you find out
 * about after a reinstall.
 */
export async function exportAll(): Promise<string> {
  const data: Record<string, unknown> = {};

  for (const slot of SLOTS) {
    const raw = localStorage.getItem(slot.key);
    if (raw === null) continue;

    try {
      data[slot.key] = JSON.parse(raw);
    } catch {
      // One corrupt slot shouldn't cost you a backup of the other five.
    }
  }

  const backup: Backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };

  const picture = await getBackground();
  if (picture) {
    try {
      backup.background = await toDataUrl(picture);
    } catch {
      // An unreadable picture is not worth losing the rest of the backup over.
    }
  }

  return JSON.stringify(backup, null, 2);
}

export type SlotOutcome = 'restored' | 'missing' | 'rejected';

export interface ImportReport {
  results: { key: string; label: string; outcome: SlotOutcome }[];
  restored: number;
}

/**
 * Restores what the file holds and reports on each slot. Throws only when the
 * file isn't a backup at all — past that point a bad slot is skipped and named
 * rather than aborting the rest, because a partial restore is still a restore
 * and you can see exactly what didn't come back.
 */
export async function importAll(text: string): Promise<ImportReport> {
  // Checked before it is parsed: a file this size is not a backup, and finding
  // that out should not cost a hundred megabytes of parse tree first.
  if (text.length > MAX_FILE_BYTES) {
    throw new Error(`That file is larger than ${describeBytes(MAX_FILE_BYTES)} — too big to be a backup.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't JSON.");
  }

  const backup = parsed as Partial<Backup> | null;
  if (!backup || typeof backup !== 'object' || backup.app !== BACKUP_APP) {
    throw new Error(`That file isn't a ${BACKUP_APP} backup.`);
  }
  if (backup.version !== BACKUP_VERSION) {
    throw new Error(
      `That backup is version ${String(backup.version)}; this app reads ${BACKUP_VERSION}.`,
    );
  }

  const data = (backup.data ?? {}) as Record<string, unknown>;
  const results: ImportReport['results'] = [];
  let restored = 0;
  /** Characters of JSON written so far, against the one budget they share. */
  let spent = 0;

  for (const slot of SLOTS) {
    if (!(slot.key in data)) {
      results.push({ key: slot.key, label: slot.label, outcome: 'missing' });
      continue;
    }

    let accepted: unknown;
    try {
      accepted = slot.accept(data[slot.key]);
    } catch {
      accepted = null;
    }

    if (accepted === null) {
      results.push({ key: slot.key, label: slot.label, outcome: 'rejected' });
      continue;
    }

    // Every slot has passed its own reader by now, which says the shape is
    // right but nothing about the size. localStorage answers an oversized write
    // by throwing, and it throws on the *next* write too, so one slot that does
    // not fit would take the rest of the restore down with it.
    const encoded = JSON.stringify(accepted);
    spent += encoded.length;
    if (spent > STORE_BUDGET) {
      spent -= encoded.length;
      results.push({ key: slot.key, label: slot.label, outcome: 'rejected' });
      continue;
    }

    localStorage.setItem(slot.key, encoded);
    results.push({ key: slot.key, label: slot.label, outcome: 'restored' });
    restored += 1;
  }

  // The picture is restored last and never blocks the rest: it's the only
  // slot whose failure costs you nothing you can't fetch again.
  if (typeof backup.background === 'string') {
    try {
      await putBackground(await fromDataUrl(backup.background));
      results.push({ key: 'background', label: 'background picture', outcome: 'restored' });
      restored += 1;
    } catch {
      results.push({ key: 'background', label: 'background picture', outcome: 'rejected' });
    }
  } else {
    await clearBackground();
  }

  return { results, restored };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Seconds to three places — a number a spreadsheet will chart, not a label. */
function seconds(ms: number | null): string {
  if (ms === null) return '';
  return Number.isFinite(ms) ? (ms / 1000).toFixed(3) : 'DNF';
}

/**
 * Any run of solves as a spreadsheet. Penalty and raw time are kept in separate
 * columns from the effective one, so the arithmetic behind an average stays
 * visible instead of being baked in.
 *
 * Takes solves rather than a session so that a single average exports in exactly
 * the columns the session it came out of does — one format to learn, and one
 * place it is written.
 */
export function solvesCsv(solves: Solve[]): string {
  const rows = [
    ['no', 'event', 'time', 'penalty', 'effective', 'memo', 'exec', 'date', 'scramble'],
    ...solves.map((solve, index) => [
      String(index + 1),
      solve.event,
      seconds(solve.ms),
      solve.penalty,
      seconds(effectiveMs(solve)),
      seconds(solve.memoMs),
      seconds(execMs(solve)),
      new Date(solve.id).toISOString(),
      solve.scramble,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

/** One whole session, in those same columns. */
export function sessionCsv(session: Session): string {
  return solvesCsv(session.solves);
}

/**
 * One solve as two lines you can paste somewhere: when, then the puzzle, the
 * time and the scramble.
 *
 * The four things that turn a number into a claim someone else can check. The
 * date comes from the solve's own id, which is the millisecond it stopped, and
 * it is written in local time because that is the day you remember solving on.
 */
export function solveLine(solve: Solve, decimals: Decimals): string {
  const when = new Date(solve.id);
  const stamped = `${when.toLocaleDateString()} ${when.toLocaleTimeString()}`;
  return [
    stamped,
    [eventOf(solve.event).name, formatTime(effectiveMs(solve), decimals), solve.scramble].join('  '),
  ].join('\n');
}

/**
 * A filename-safe stamp: 2026-09-01.
 *
 * Local rather than UTC: it used to be UTC, which meant an export made late in
 * the evening could be filed under tomorrow.
 */
export function stamp(): string {
  return dateStamp();
}

/** Filenames can't hold most of what a session name can. */
export function slug(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return cleaned === '' ? 'session' : cleaned;
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
