/**
 * Every keyboard shortcut the app answers to, and the one place that decides
 * which key means what.
 *
 * Nothing here touches the DOM. A key press is read as the five things a bind
 * cares about, so all of the matching can be checked without a browser — see
 * scripts/check-keys.ts.
 */

export interface KeyCombo {
  /**
   * `KeyboardEvent.code`: the physical key rather than the character it types.
   * Holding Shift turns "2" into "@" and Option turns "c" into "ç", and a bind
   * that stopped matching the moment a modifier was held would be no bind.
   */
  code: string;
  /** Ctrl or ⌘, either one, so a bind means the same thing on a Mac as off one. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

/** The parts of a KeyboardEvent a bind is matched against. */
export interface KeyPress {
  code: string;
  /** Only read when `code` is missing — see `codeOf`. */
  key?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export type ActionId =
  | 'deleteLast' | 'undoDelete' | 'plus2' | 'dnf' | 'clearPenalty'
  | 'prevScramble' | 'nextScramble' | 'copyScramble' | 'openEvent'
  | 'openSession' | 'goStats' | 'goTimer' | 'goSettings'
  | 'toggleInspection' | 'toggleRail' | 'toggleTopBar' | 'toggleScramble'
  | 'toggleComp' | 'togglePreview' | 'toggleGraph'
  | 'toggleListFloat' | 'toggleStatsFloat';

export type ActionGroup = 'solves' | 'scramble' | 'navigation' | 'toggles';

export interface Action {
  id: ActionId;
  label: string;
  group: ActionGroup;
  description?: string;
}

/** In the order the settings page lists them, which is also the order a
    clash between two saved binds is settled in. */
export const ACTIONS: Action[] = [
  { id: 'deleteLast', label: 'delete last solve', group: 'solves' },
  {
    id: 'undoDelete', label: 'undo delete', group: 'solves',
    description: 'Brings back the last solve deleted, whether by key or from the list.',
  },
  { id: 'plus2', label: '+2 on the last solve', group: 'solves', description: 'Press again to take it off.' },
  { id: 'dnf', label: 'DNF on the last solve', group: 'solves', description: 'Press again to take it off.' },
  { id: 'clearPenalty', label: 'clear penalty', group: 'solves' },

  { id: 'prevScramble', label: 'previous scramble', group: 'scramble' },
  { id: 'nextScramble', label: 'next scramble', group: 'scramble' },
  {
    id: 'copyScramble', label: 'copy scramble', group: 'scramble',
    description: 'Only while no text is selected, so copying a selection still works.',
  },
  { id: 'openEvent', label: 'event picker', group: 'scramble', description: 'Opens the event dropdown.' },

  { id: 'openSession', label: 'session picker', group: 'navigation', description: 'Opens the session dropdown.' },
  { id: 'goStats', label: 'statistics', group: 'navigation' },
  { id: 'goTimer', label: 'back to the timer', group: 'navigation', description: 'From any other page.' },
  { id: 'goSettings', label: 'settings', group: 'navigation' },

  { id: 'toggleInspection', label: 'inspection', group: 'toggles' },
  { id: 'toggleRail', label: 'sidebar', group: 'toggles' },
  { id: 'toggleTopBar', label: 'menu bar', group: 'toggles' },
  // The id is older than the label: it hid the whole scramble bar once, and
  // keeping it means a key someone already bound to it still does this.
  {
    id: 'toggleScramble', label: 'event + last / next', group: 'toggles',
    description: 'The row above the scramble. The scramble itself stays.',
  },
  { id: 'toggleComp', label: 'comp sim', group: 'toggles' },
  { id: 'togglePreview', label: 'cube preview', group: 'toggles' },
  { id: 'toggleGraph', label: 'session graph', group: 'toggles' },
  {
    id: 'toggleListFloat', label: 'float the solve list', group: 'toggles',
    description: 'A compact list in a box of its own, or back into the sidebar.',
  },
  { id: 'toggleStatsFloat', label: 'float the session stats', group: 'toggles' },
];

/** Two keys an action may answer to: a primary, and an alternate for the
    keyboard that doesn't have the first one — a Mac has no Delete. */
export type Slots = [KeyCombo | null, KeyCombo | null];
export type Binds = Record<ActionId, Slots>;

export interface Keymap {
  schemaVersion: 1;
  /** All of it off at once, for anyone who would rather letters did nothing. */
  enabled: boolean;
  binds: Binds;
}

function key(code: string, mods: Partial<Omit<KeyCombo, 'code'>> = {}): KeyCombo {
  return { code, mod: false, shift: false, alt: false, ...mods };
}

export const DEFAULT_KEYMAP: Keymap = {
  schemaVersion: 1,
  enabled: true,
  binds: {
    deleteLast: [key('Backspace'), key('Delete')],
    undoDelete: [key('KeyZ', { mod: true }), null],
    plus2: [key('Digit2'), null],
    dnf: [key('Digit3'), null],
    clearPenalty: [key('Digit1'), null],
    prevScramble: [key('ArrowLeft'), null],
    nextScramble: [key('ArrowRight'), null],
    copyScramble: [key('KeyC', { mod: true }), null],
    openEvent: [key('KeyA'), null],
    openSession: [key('KeyS'), null],
    goStats: [key('KeyD'), null],
    goTimer: [key('KeyF'), null],
    goSettings: [key('Comma'), null],
    toggleInspection: [key('KeyI'), null],
    toggleRail: [key('KeyQ'), null],
    toggleTopBar: [key('KeyW'), null],
    toggleScramble: [key('KeyE'), null],
    toggleComp: [key('KeyZ'), null],
    togglePreview: [key('KeyX'), null],
    toggleGraph: [key('KeyC'), null],
    toggleListFloat: [key('KeyR'), null],
    toggleStatsFloat: [key('KeyT'), null],
  },
};

export const KEYMAP_KEY = 'app.keys.v1';

/**
 * Keys nothing may be bound to. Space runs the clock; Escape backs out of
 * inspection and closes every sheet; Tab and Enter are how the page is used
 * without a mouse. A shortcut on any of them would break something else.
 */
const RESERVED = ['Space', 'Escape', 'Tab', 'Enter', 'NumpadEnter'];

/** Pressed on their own these are not a key yet — the recorder waits past them. */
const MODIFIERS = [
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'CapsLock', 'Fn', 'FnLock',
];

export function isReserved(code: string): boolean {
  return RESERVED.includes(code);
}

export function isModifier(code: string): boolean {
  return MODIFIERS.includes(code);
}

/** Characters whose key sits somewhere a `code` can name, for `codeOf`. */
const KEY_CODES: Record<string, string> = {
  ' ': 'Space', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight',
  '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period',
  '/': 'Slash', '`': 'Backquote',
  Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft', Meta: 'MetaLeft',
};

/**
 * Which key a press was.
 *
 * `code` whenever there is one, which is every physical keyboard. On-screen
 * keyboards, remote desktops and some accessibility tools send it empty or as
 * "Unidentified", and for those the key is worked back out from the character
 * it typed — close enough that a bind made on a real keyboard still answers.
 */
export function codeOf(press: KeyPress): string {
  if (press.code && press.code !== 'Unidentified') return press.code;

  const key = press.key ?? '';
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  // Named keys share their name with their code. Listed rather than guessed at:
  // `key` is also "Unidentified", "Dead" and "Process", none of which is a key.
  if (NAMED_KEYS.test(key)) return key;
  return KEY_CODES[key] ?? '';
}

const NAMED_KEYS =
  /^(Backspace|Delete|Arrow(Left|Right|Up|Down)|Escape|Tab|Enter|Home|End|PageUp|PageDown|Insert|CapsLock|F([1-9]|1\d|2[0-4]))$/;

/** A press as a bind, or null if it is a bare modifier or a reserved key. */
export function comboFrom(press: KeyPress): KeyCombo | null {
  const code = codeOf(press);
  if (!code || isModifier(code) || isReserved(code)) return null;
  return {
    code,
    mod: press.ctrlKey || press.metaKey,
    shift: press.shiftKey,
    alt: press.altKey,
  };
}

export function sameCombo(a: KeyCombo, b: KeyCombo): boolean {
  return a.code === b.code && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
}

/**
 * The action a press means, or null.
 *
 * Modifiers match exactly rather than loosely, so Shift+2 is not +2 and ⌘Z is
 * not the comp sim — a loose match would make every bind with a modifier fire
 * its bare twin as well.
 */
export function actionFor(keymap: Keymap, press: KeyPress): ActionId | null {
  const combo = comboFrom(press);
  if (!combo) return null;

  for (const { id } of ACTIONS) {
    if (keymap.binds[id].some((slot) => slot !== null && sameCombo(slot, combo))) return id;
  }
  return null;
}

/**
 * Binds `combo` to one slot of `action`, taking it off whatever held it before.
 *
 * Moving it rather than refusing is what a keymap editor is expected to do, but
 * silently is not: `displaced` names the action that lost it, so the page can
 * say so. Passing null clears the slot.
 */
export function assign(
  keymap: Keymap,
  action: ActionId,
  slot: 0 | 1,
  combo: KeyCombo | null,
): { keymap: Keymap; displaced?: ActionId } {
  const binds = { ...keymap.binds };
  let displaced: ActionId | undefined;

  if (combo) {
    for (const { id } of ACTIONS) {
      const slots = binds[id];
      const index = slots.findIndex((held) => held !== null && sameCombo(held, combo));
      if (index === -1 || (id === action && index === slot)) continue;

      binds[id] = index === 0 ? [null, slots[1]] : [slots[0], null];
      if (id !== action) displaced = id;
    }
  }

  const own = binds[action];
  binds[action] = slot === 0 ? [combo, own[1]] : [own[0], combo];
  return { keymap: { ...keymap, binds }, displaced };
}

/** One action back to its stock keys, moving them off anything that took them. */
export function restoreAction(keymap: Keymap, action: ActionId): { keymap: Keymap; displaced?: ActionId } {
  const [first, second] = DEFAULT_KEYMAP.binds[action];
  const one = assign(keymap, action, 0, first);
  const two = assign(one.keymap, action, 1, second);
  return { keymap: two.keymap, displaced: two.displaced ?? one.displaced };
}

export function isDefault(keymap: Keymap, action: ActionId): boolean {
  const same = (a: KeyCombo | null, b: KeyCombo | null) =>
    a === null || b === null ? a === b : sameCombo(a, b);
  const [a0, a1] = keymap.binds[action];
  const [b0, b1] = DEFAULT_KEYMAP.binds[action];
  return same(a0, b0) && same(a1, b1);
}

const MAC = typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

const NAMES: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Enter',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins', Home: 'Home', End: 'End',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
};

/** What a key is called on the keycap, near enough. */
export function codeLabel(code: string, mac = MAC): string {
  if (code === 'Backspace') return mac ? '⌫' : 'Backspace';
  if (code === 'Delete') return mac ? '⌦' : 'Del';
  if (NAMES[code]) return NAMES[code];

  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const pad = /^Numpad(\d)$/.exec(code);
  if (pad) return `Num ${pad[1]}`;
  return code;
}

/** ⇧⌘Z on a Mac, Ctrl+Shift+Z everywhere else — each the way its own menus write it. */
export function comboLabel(combo: KeyCombo, mac = MAC): string {
  const name = codeLabel(combo.code, mac);
  if (mac) {
    return `${combo.alt ? '⌥' : ''}${combo.shift ? '⇧' : ''}${combo.mod ? '⌘' : ''}${name}`;
  }
  const parts = [combo.mod && 'Ctrl', combo.shift && 'Shift', combo.alt && 'Alt', name];
  return parts.filter(Boolean).join('+');
}

/** The key worth quoting in a tooltip for `action`, or '' if there isn't one. */
export function keyHint(keymap: Keymap, action: ActionId): string {
  if (!keymap.enabled) return '';
  const combo = keymap.binds[action].find((slot) => slot !== null);
  return combo ? comboLabel(combo) : '';
}

/** A tooltip with the action's key after it, or just the tooltip. */
export function withHint(title: string, keymap: Keymap, action: ActionId): string {
  const hint = keyHint(keymap, action);
  return hint ? `${title} (${hint})` : title;
}

/** One bind out of an untrusted blob, or null. */
function comboOf(value: unknown): KeyCombo | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<KeyCombo>;
  if (typeof raw.code !== 'string' || !/^[A-Za-z0-9]{1,32}$/.test(raw.code)) return null;
  if (raw.code === 'Unidentified' || isModifier(raw.code) || isReserved(raw.code)) return null;
  return { code: raw.code, mod: raw.mod === true, shift: raw.shift === true, alt: raw.alt === true };
}

/**
 * A keymap out of an untrusted blob — a saved one, or one out of a backup file.
 *
 * Every bind is read on its own and dropped if it is not one, and a key held by
 * two actions stays only with the first. Actions the blob has never heard of —
 * ones added since it was written — take their stock keys, but only the ones
 * nothing saved has claimed since: your own binds outrank a default that
 * arrived later.
 */
export function readKeymap(input: unknown): Keymap {
  try {
    const parsed = input as { schemaVersion?: unknown; enabled?: unknown; binds?: unknown } | null;
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) return DEFAULT_KEYMAP;

    const saved = (parsed.binds && typeof parsed.binds === 'object' ? parsed.binds : {}) as
      Record<string, unknown>;
    const taken: KeyCombo[] = [];
    const binds = {} as Binds;

    const claim = (combo: KeyCombo | null): KeyCombo | null => {
      if (!combo || taken.some((held) => sameCombo(held, combo))) return null;
      taken.push(combo);
      return combo;
    };

    for (const { id } of ACTIONS) {
      const slots = saved[id];
      if (Array.isArray(slots)) binds[id] = [claim(comboOf(slots[0])), claim(comboOf(slots[1]))];
    }
    for (const { id } of ACTIONS) {
      if (binds[id]) continue;
      const [first, second] = DEFAULT_KEYMAP.binds[id];
      binds[id] = [claim(first), claim(second)];
    }

    return {
      schemaVersion: 1,
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
      binds,
    };
  } catch {
    return DEFAULT_KEYMAP;
  }
}

export function loadKeymap(): Keymap {
  try {
    const raw = localStorage.getItem(KEYMAP_KEY);
    return raw ? readKeymap(JSON.parse(raw)) : DEFAULT_KEYMAP;
  } catch {
    return DEFAULT_KEYMAP;
  }
}

export function saveKeymap(keymap: Keymap): void {
  localStorage.setItem(KEYMAP_KEY, JSON.stringify(keymap));
}
