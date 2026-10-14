import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * A store kept in React and written to localStorage a moment after it changes.
 *
 * The debounce is why this exists, and also what it has to make safe:
 *
 * - A write still waiting when the tab is hidden or closed is done there and
 *   then. Waiting it out lost the last solve of a session closed within the
 *   debounce.
 * - Another tab's write is read back in. Each tab used to save its own copy
 *   over the other's, so twenty solves in one tab went the moment you did one
 *   in the next. Hiding a tab flushes it, so the tab you come back to has
 *   nothing pending to lose when it reloads.
 * - Anything in this tab that writes storage behind React's back (a backup
 *   import) flushes first and then calls `announceReplaced`, so the old copy
 *   is never written back over the new one.
 */

const pending = new Set<() => void>();
const REPLACED = 'tstimer:replaced';
let suspended = false;

/** Writes everything still waiting on its debounce, now. */
export function flushPendingSaves(): void {
  for (const write of [...pending]) {
    try {
      write();
    } catch {
      // One store out of room is no reason to drop the others' writes.
    }
  }
}

/** Tells every store, and anything else listening, that storage was rewritten
    under it and should be read again. */
export function announceReplaced(): void {
  window.dispatchEvent(new Event(REPLACED));
}

/** Runs `handler` whenever storage was rewritten under the app. */
export function useOnReplaced(handler: () => void): void {
  useEffect(() => {
    window.addEventListener(REPLACED, handler);
    return () => window.removeEventListener(REPLACED, handler);
  }, [handler]);
}

/**
 * Reloads the page with nothing written on the way out.
 *
 * For a restore or an erase, which rewrite storage wholesale: the flush on
 * `pagehide` would otherwise put the state still in React straight back.
 */
export function reloadPage(): void {
  suspended = true;
  pending.clear();
  window.location.reload();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSaves();
  });
}

export function usePersistedStore<T>(
  key: string,
  load: () => T,
  save: (value: T) => void,
  delay = 400,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(load);
  /** The value storage is known to hold, so reading one in doesn't write it
      straight back out. */
  const stored = useRef(value);

  useEffect(() => {
    if (value === stored.current) return;
    const write = () => {
      clearTimeout(timer);
      pending.delete(write);
      if (suspended) return;
      stored.current = value;
      save(value);
    };
    const timer = setTimeout(write, delay);
    pending.add(write);
    return () => {
      clearTimeout(timer);
      pending.delete(write);
    };
  }, [value, save, delay]);

  const reload = useCallback(() => {
    const next = load();
    stored.current = next;
    setValue(next);
  }, [load]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      // A null key is another tab clearing everything.
      if (event.storageArea === localStorage && (event.key === key || event.key === null)) reload();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, reload]);

  useOnReplaced(reload);

  return [value, setValue];
}
