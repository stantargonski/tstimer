/**
 * Asserts the keymap reads, matches and rebinds the way the settings page and
 * the timer rely on.
 *
 * Run with `npm run check:keys`.
 *
 * The listeners need a browser; deciding which action a press means does not,
 * and it is where the rules live — exact modifiers, reserved keys, one action
 * per key, and a saved keymap that can't be made to break the app.
 */
import {
  actionFor, assign, comboFrom, comboLabel, DEFAULT_KEYMAP, readKeymap, restoreAction,
  type KeyPress,
} from '../src/keys/keymap';

const failures: string[] = [];

function check(ok: boolean, message: string): void {
  if (!ok) failures.push(message);
}

function press(code: string, mods: Partial<Omit<KeyPress, 'code'>> = {}): KeyPress {
  return { code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods };
}

// ---- matching ----

check(actionFor(DEFAULT_KEYMAP, press('Digit2')) === 'plus2', '2 is +2');
check(actionFor(DEFAULT_KEYMAP, press('Digit2', { shiftKey: true })) === null, 'shift+2 is not +2');
check(actionFor(DEFAULT_KEYMAP, press('KeyZ')) === 'toggleComp', 'z is comp sim');
check(actionFor(DEFAULT_KEYMAP, press('KeyZ', { ctrlKey: true })) === 'undoDelete', 'ctrl+z is undo');
check(actionFor(DEFAULT_KEYMAP, press('KeyZ', { metaKey: true })) === 'undoDelete', '⌘z is undo too');
check(actionFor(DEFAULT_KEYMAP, press('KeyC', { metaKey: true })) === 'copyScramble', '⌘c copies');
check(actionFor(DEFAULT_KEYMAP, press('KeyC')) === 'toggleGraph', 'c is the graph');
check(actionFor(DEFAULT_KEYMAP, press('Backspace')) === 'deleteLast', 'backspace deletes');
check(actionFor(DEFAULT_KEYMAP, press('Delete')) === 'deleteLast', 'delete deletes');
check(actionFor(DEFAULT_KEYMAP, press('Space')) === null, 'space is never a shortcut');
check(actionFor(DEFAULT_KEYMAP, press('KeyJ')) === null, 'an unbound key is nothing');

// ---- presses with no `code`: on-screen keyboards, remote desktops ----

check(actionFor(DEFAULT_KEYMAP, press('', { key: '2' })) === 'plus2', 'a bare "2" with no code is still +2');
check(actionFor(DEFAULT_KEYMAP, press('', { key: 'z', metaKey: true })) === 'undoDelete', '⌘z with no code is undo');
check(actionFor(DEFAULT_KEYMAP, press('', { key: 'Z', ctrlKey: true, shiftKey: true })) === null, 'ctrl+shift+z is not undo');
check(actionFor(DEFAULT_KEYMAP, press('', { key: 'Backspace' })) === 'deleteLast', 'backspace with no code deletes');
check(actionFor(DEFAULT_KEYMAP, press('', { key: 'ArrowRight' })) === 'nextScramble', 'an arrow with no code still moves');
check(actionFor(DEFAULT_KEYMAP, press('Unidentified', { key: 'q' })) === 'toggleRail', '"Unidentified" falls back to the key');
check(actionFor(DEFAULT_KEYMAP, press('', { key: ' ' })) === null, 'a space with no code is still reserved');
check(comboFrom(press('', { key: 'Shift', shiftKey: true })) === null, 'a bare shift with no code is still a modifier');
check(comboFrom(press('', { key: 'ç' })) === null, 'a character no key code names binds nothing');
check(actionFor(DEFAULT_KEYMAP, press('', {})) === null, 'a press with neither code nor key is nothing');
check(comboFrom(press('', { key: 'Unidentified' })) === null, 'a key reported as "Unidentified" binds nothing');
check(comboFrom(press('Unidentified', { key: 'Unidentified' })) === null, 'nor does one with no code either');
check(comboFrom(press('', { key: 'Dead' })) === null, 'a dead key binds nothing');
check(comboFrom(press('', { key: 'Process' })) === null, 'an IME keystroke binds nothing');
check(comboFrom(press('', { key: 'F5' }))?.code === 'F5', 'a function key with no code is still itself');

// ---- recording ----

check(comboFrom(press('ShiftLeft', { shiftKey: true })) === null, 'a bare modifier is not a key yet');
check(comboFrom(press('MetaLeft', { metaKey: true })) === null, 'nor is a bare ⌘');
check(comboFrom(press('Space')) === null, 'space is reserved');
check(comboFrom(press('Escape')) === null, 'escape is reserved');
check(comboFrom(press('Enter')) === null, 'enter is reserved');
check(comboFrom(press('Tab')) === null, 'tab is reserved');
const recorded = comboFrom(press('KeyK', { ctrlKey: true, shiftKey: true }));
check(
  recorded !== null && recorded.mod && recorded.shift && !recorded.alt && recorded.code === 'KeyK',
  'ctrl+shift+k records as mod+shift+K',
);

// ---- rebinding ----

const graphKey = DEFAULT_KEYMAP.binds.toggleGraph[0];
const moved = assign(DEFAULT_KEYMAP, 'toggleComp', 0, graphKey);
check(moved.displaced === 'toggleGraph', 'taking the graph key names the graph as displaced');
check(moved.keymap.binds.toggleGraph[0] === null, 'and the graph loses it');
check(actionFor(moved.keymap, press('KeyC')) === 'toggleComp', 'c is now comp sim');
check(DEFAULT_KEYMAP.binds.toggleGraph[0] !== null, 'assign never edits the keymap it was given');

const swapped = assign(DEFAULT_KEYMAP, 'deleteLast', 0, DEFAULT_KEYMAP.binds.deleteLast[1]);
check(swapped.displaced === undefined, 'moving a key between one action\'s own slots displaces nothing');
check(swapped.keymap.binds.deleteLast[1] === null, 'and leaves the slot it came from empty');

const cleared = assign(DEFAULT_KEYMAP, 'plus2', 0, null);
check(actionFor(cleared.keymap, press('Digit2')) === null, 'a cleared slot matches nothing');

const back = restoreAction(moved.keymap, 'toggleGraph');
check(back.displaced === 'toggleComp', 'restoring the graph takes c back from comp sim');
check(actionFor(back.keymap, press('KeyC')) === 'toggleGraph', 'and c is the graph again');

// ---- reading saved keymaps ----

check(readKeymap(null) === DEFAULT_KEYMAP, 'nothing reads as the defaults');
check(readKeymap('junk') === DEFAULT_KEYMAP, 'junk reads as the defaults');
check(readKeymap({ schemaVersion: 9 }) === DEFAULT_KEYMAP, 'an unknown version reads as the defaults');

const partial = readKeymap({ schemaVersion: 1, enabled: false, binds: {} });
check(!partial.enabled, 'the master switch is kept');
check(actionFor(partial, press('Digit3')) === 'dnf', 'missing actions take their stock keys');

const rebound = readKeymap({
  schemaVersion: 1,
  binds: { toggleComp: [{ code: 'KeyC', mod: false, shift: false, alt: false }, null] },
});
check(actionFor(rebound, press('KeyC')) === 'toggleComp', 'a saved bind outranks a default for another action');
check(rebound.binds.toggleGraph[0] === null, 'the default it would have clashed with is dropped');
check(rebound.binds.toggleComp[1] === null, 'an empty slot stays empty');

const hostile = readKeymap({
  schemaVersion: 1,
  binds: {
    plus2: [{ code: 'Space' }, { code: 'KeyP' }],
    dnf: [{ code: 'KeyP' }, 'nonsense'],
    clearPenalty: [{ code: '<script>' }, null],
    madeUp: [{ code: 'KeyM' }, null],
  },
});
check(hostile.binds.plus2[0] === null, 'a reserved key saved in a blob is dropped');
check(actionFor(hostile, press('KeyP')) === 'plus2', 'a key saved twice stays with the first');
check(hostile.binds.dnf[0] === null && hostile.binds.dnf[1] === null, 'the second loses it, and junk is null');
check(hostile.binds.clearPenalty[0] === null, 'a code that is not a key code is dropped');
check(actionFor(hostile, press('KeyM')) === null, 'an unknown action binds nothing');

const unidentified = readKeymap({ schemaVersion: 1, binds: { toggleInspection: [{ code: 'Unidentified' }, null] } });
check(unidentified.binds.toggleInspection[0] === null, 'a saved "Unidentified" is dropped rather than bound');

// ---- the keys added with the floating panels ----

check(actionFor(DEFAULT_KEYMAP, press('Comma')) === 'goSettings', ', opens settings');
check(actionFor(DEFAULT_KEYMAP, press('', { key: ',' })) === 'goSettings', 'a bare "," with no code still opens settings');
check(actionFor(DEFAULT_KEYMAP, press('KeyR')) === 'toggleListFloat', 'r floats the solve list');
check(actionFor(DEFAULT_KEYMAP, press('KeyT')) === 'toggleStatsFloat', 't floats the stats');
check(actionFor(DEFAULT_KEYMAP, press('KeyY')) === 'toggleScrambleFloat', 'y floats the scramble');
check(
  actionFor(DEFAULT_KEYMAP, press('KeyE')) === 'toggleScramble',
  'e keeps its action id, so a key someone saved against it still works',
);
const older = readKeymap({ schemaVersion: 1, binds: { toggleScramble: [{ code: 'KeyE' }, null] } });
check(actionFor(older, press('Comma')) === 'goSettings', 'a keymap saved before , existed still picks it up');
check(actionFor(older, press('KeyR')) === 'toggleListFloat', 'and r');

// ---- labels ----

check(comboLabel({ code: 'KeyZ', mod: true, shift: true, alt: false }, true) === '⇧⌘Z', 'mac label');
check(comboLabel({ code: 'KeyZ', mod: true, shift: true, alt: false }, false) === 'Ctrl+Shift+Z', 'pc label');
check(comboLabel({ code: 'ArrowLeft', mod: false, shift: false, alt: false }) === '←', 'arrow label');
check(comboLabel({ code: 'Digit2', mod: false, shift: false, alt: false }) === '2', 'digit label');

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s):`);
  for (const message of failures) console.error(`  ${message}`);
  process.exit(1);
}

console.log('✓ every shortcut reads, matches and rebinds as it should');
