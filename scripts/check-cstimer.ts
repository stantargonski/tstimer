/**
 * Asserts a csTimer export survives the trip into this app's shape, and that a
 * file built to cause trouble doesn't.
 *
 * Run with `npm run check:cstimer`.
 *
 * An import is the one operation a user cannot check by eye: nobody re-reads a
 * thousand solves to confirm the +2s came across. So the awkward parts are
 * pinned here — csTimer bakes the two seconds into a +2 and this app doesn't,
 * its dates are seconds where a solve id is milliseconds, two solves in the
 * same second would otherwise collide, and a memo split only means something
 * for a blindfolded event.
 *
 * The second half is the hostile file. `src/data/limits.ts` argues for each
 * bound; this checks the code actually holds to them, because a limit nobody
 * tests is a comment.
 */
import { cleanName, cleanScramble, MAX_NAME, MAX_SCRAMBLE } from '../src/data/limits';
import {
  applyImport, countSolves, eventFromScramble, looksImported, NEW_SESSION, parseCsTimer,
  undoImport, type ImportRow,
} from '../src/timer/cstimer';
import { effectiveMs, emptyTimerStore, newSession, newSolve, type TimerStore } from '../src/timer/types';

const failures: string[] = [];

function check(ok: boolean, message: string): void {
  if (!ok) failures.push(message);
}

const SECOND = 1_697_588_946;

const FILE = JSON.stringify({
  session1: [
    [[0, 12_340], "R U R' U'", '', SECOND],
    // The same whole second as the solve before it, which csTimer allows.
    [[2000, 14_500], "L D L' D'", 'a comment', SECOND],
    [[-1, 20_000], 'F B', '', SECOND + 60],
    'not a solve at all',
  ],
  session2: [],                                    // csTimer ships fifteen of these
  session4: [[[0, 60_000, 25_000], 'U2 F2', '', SECOND + 120]],
  session9: [[[0, 5708], 'R U', '', SECOND + 180]],
  properties: {
    // The nested string really is how csTimer writes this.
    sessionData: JSON.stringify({
      1: { name: 1, opt: {} },
      2: { name: 2, opt: { scrType: '222so' } },
      4: { name: 'blind', opt: { scrType: '333ni' } },
      9: { name: 9, opt: { scrType: '444wca' } },
    }),
  },
});

const file = parseCsTimer(FILE);

/** Every row ticked, each into a new session — the importer's own default. */
function rowsOf(store: TimerStore, changes: Partial<ImportRow>[] = []): ImportRow[] {
  return file.sessions.map((source, index) => ({
    source,
    include: !looksImported(store, source),
    name: source.name,
    event: source.event,
    destination: NEW_SESSION,
    ...changes[index],
  }));
}

// ---- what the file says it holds ----

check(file.sessions.length === 3, `an empty session is not offered (got ${file.sessions.length})`);
check(file.skipped === 1, `the unreadable record is counted (got ${file.skipped})`);
check(file.trimmed === 0, 'nothing here needed shortening');
check(
  file.sessions.map((session) => session.key).join() === 'session1,session4,session9',
  "sessions come back in csTimer's own order",
);
check(file.sessions[0].name === 'csTimer 1', 'a session csTimer named by number says where it came from');
check(file.sessions[1].name === 'blind', 'a renamed session keeps its name');
check(countSolves(rowsOf(emptyTimerStore())) === 5, 'every readable solve is offered');

// ---- the event, guessed from the scrambler ----

check(file.sessions[0].event === '333', 'no scrambler recorded means 3x3');
check(file.sessions[1].event === '333bf', '333ni is 3BLD');
check(file.sessions[2].event === '444', '444wca is 4x4');

check(eventFromScramble('222so') === '222', '222so is 2x2');
check(eventFromScramble('555wca') === '555', '555wca is 5x5');
check(eventFromScramble('444ni') === '444bf', '444ni is 4BLD');
check(eventFromScramble('r3ni') === '333mbf', 'r3ni is multi-blind');
check(eventFromScramble('333fm') === '333fm', '333fm is fewest moves');
check(eventFromScramble('pyrso') === 'pyram', 'every pyr* scrambler is Pyraminx');
check(eventFromScramble('skbso') === 'skewb', 'every skb* scrambler is Skewb');
check(eventFromScramble('sq1h') === 'sq1', 'sq1h is Square-1');
check(eventFromScramble('mgmp') === 'minx', 'mgmp is Megaminx');
check(eventFromScramble('clkwca') === 'clock', 'clkwca is Clock');
check(eventFromScramble('zbll') === '333', 'an unknown 3x3 subset lands on 3x3, not nowhere');
check(eventFromScramble('') === '333', 'nothing recorded lands on 3x3');
// The file names an event; it never becomes one.
check(eventFromScramble('__proto__') === '333', 'a scrambler named after a prototype is just unknown');
check(eventFromScramble('constructor') === '333', 'so is one named after a constructor');

// ---- the solves themselves ----

const empty: TimerStore = emptyTimerStore();
const fresh = applyImport(empty, rowsOf(empty));
const built = fresh.store.sessions[empty.sessions.length];
const blind = fresh.store.sessions[empty.sessions.length + 1];
const [plain, plus2, dnf] = built.solves;

check(plain.ms === 12_340, 'a clean time comes across as it was');
check(plain.scramble === "R U R' U'", 'the scramble comes with it');
check(plain.event === '333', "the solve is filed under the row's event");

// csTimer stores what a judge would read; here the penalty sits beside the raw
// time, so the two seconds have to come back out or every +2 gains two seconds
// on every reload.
check(plus2.penalty === 'plus2', 'a 2000 flag is a +2');
check(plus2.ms === 12_500, `a +2 keeps its raw time (got ${plus2.ms})`);
check(effectiveMs(plus2) === 14_500, 'and still reads as csTimer had it');

check(dnf.penalty === 'dnf', 'a -1 flag is a DNF');
check(dnf.ms === 20_000, 'a DNF keeps the time under it');

check(plain.id === SECOND * 1000, 'a date in seconds becomes an id in milliseconds');
check(plus2.id === plain.id + 1, 'two solves in one second do not collide');
check(dnf.id > plus2.id, 'ids stay in solving order');
check(built.createdAt === plain.id, 'a session dates from its first solve, not from the import');

check(plain.memoMs === null, 'a 3x3 solve has no memo split');
check(blind.solves[0].memoMs === 25_000, 'a multi-phase blind solve keeps its memo split');
check(blind.solves[0].ms === 60_000, 'and its total is still the total');

// The same session re-labelled as 3x3: a phase split only means memo when the
// event has one.
const sighted = applyImport(empty, rowsOf(empty, [{}, { event: '333' }]));
check(
  sighted.store.sessions[empty.sessions.length + 1].solves[0].memoMs === null,
  'a split is only a memo on a blindfolded event',
);

// ---- what it does to a store ----

check(
  fresh.store.sessions.length === empty.sessions.length + 3,
  'imported sessions are added to the ones already there, not swapped for them',
);
check(
  empty.sessions.every((session) => fresh.store.sessions.some((kept) => kept.id === session.id)),
  'nothing already stored is lost',
);
check(
  new Set(fresh.store.sessions.map((s) => s.id)).size === fresh.store.sessions.length,
  'ids stay unique',
);
check(fresh.store.activeId === built.id, 'the first imported session is the one left open');
check(fresh.added === 5 && fresh.skipped === 0, 'the report counts what it added');
check(fresh.results[0].created && fresh.results[0].name === 'csTimer 1', 'the report names where it landed');
check(
  applyImport(empty, rowsOf(empty).map((row) => ({ ...row, include: false }))).store === empty,
  'importing nothing changes nothing',
);

// ---- choosing where the solves go ----

const named = applyImport(empty, rowsOf(empty, [{ name: 'my 3x3 history' }]));
check(
  named.store.sessions[empty.sessions.length].name === 'my 3x3 history',
  'a new session takes the name you gave it',
);

const target = empty.sessions[0].id;
const into = applyImport(empty, rowsOf(empty, [{ destination: target }]));
const merged = into.store.sessions.find((session) => session.id === target)!;
check(into.store.sessions.length === empty.sessions.length + 2, 'appending creates no session of its own');
check(merged.solves.length === 3, 'the solves landed in the session that was chosen');
check(merged.name === empty.sessions[0].name, 'and that session keeps its own name');
check(!into.results[0].created, 'the report says it was an append');

// The same file again, into the same place: this is what re-importing an
// updated export has to do, and doubling a history is the thing to avoid.
const twice = applyImport(into.store, rowsOf(into.store, [{ destination: target, include: true }]));
const settled = twice.store.sessions.find((session) => session.id === target)!;
check(settled.solves.length === 3, `a second read adds nothing new (got ${settled.solves.length})`);
check(twice.results[0].skipped === 3, 'and says all three were already there');

// A destination deleted in another tab since the file was read.
const stale = applyImport(empty, rowsOf(empty, [{ destination: 'no-such-session' }]));
check(
  stale.results[0].created && stale.store.sessions.length === empty.sessions.length + 3,
  'a destination that has gone falls back to a new session',
);

// Solves already in a session are never renumbered to make room for imported
// ones; only the arriving solve moves.
const busy: TimerStore = { ...empty, sessions: [...empty.sessions] };
busy.sessions[0] = {
  ...newSession('busy'),
  id: busy.sessions[0].id,
  solves: [{ id: SECOND * 1000, ms: 999, memoMs: null, penalty: 'none', scramble: '', event: '333' }],
};
const shoved = applyImport(busy, rowsOf(busy, [{ destination: busy.sessions[0].id, include: true }]));
const host = shoved.store.sessions.find((session) => session.id === busy.sessions[0].id)!;
check(host.solves[0].ms === 999, 'the solve that was already there keeps its id and its place');
check(host.solves.length === 4, 'and the arriving ones are nudged past it');
check(new Set(host.solves.map((s) => s.id)).size === 4, 'with no two sharing an id');

// ---- files that aren't this ----

function refuses(text: string, why: string): void {
  try {
    parseCsTimer(text);
    failures.push(`${why}: it was accepted`);
  } catch {
    // Refusing is the whole assertion.
  }
}

refuses('not json at all', 'plain text is not an export');
refuses('[1, 2, 3]', 'a JSON array is not an export');
refuses('null', 'null is not an export');
refuses('{"app":"rubiks-trainer","data":{}}', "this app's own backup is not a csTimer export");
refuses('{"properties":{},"session1":[]}', 'an export with nothing timed in it');
refuses(`{"session1":[${'[[0,1000],"R","",1700000000],'.repeat(50_001).slice(0, -1)}]}`, 'a file past the solve cap');

// ---- files built to cause trouble ----

/** Parses, and returns the one session it produced. */
function hostile(session: unknown[], meta?: Record<string, unknown>) {
  return parseCsTimer(JSON.stringify({
    session1: session,
    properties: meta ? { sessionData: JSON.stringify(meta) } : {},
  })).sessions[0];
}

const clean = [[0, 1000], 'R', '', SECOND];

// A name is drawn in the session picker, the stats header and the row above,
// where a bidi override or a newline is a spoofing tool rather than a name.
// Written by code point rather than typed: these are characters chosen for
// being invisible, and a test that relies on them surviving a copy-paste is a
// test that quietly stops testing.
const RLO = String.fromCharCode(0x202e);        // right-to-left override
const ZWSP = String.fromCharCode(0x200b);       // zero-width space
const NEWLINE = String.fromCharCode(10);
const spoofed = hostile([clean], {
  1: { name: `good${RLO}reversed${ZWSP}${NEWLINE}and a second line`, opt: {} },
});
check(
  ![RLO, ZWSP, NEWLINE].some((character) => spoofed.name.includes(character)),
  `a name is stripped of the characters that let it lie (got ${JSON.stringify(spoofed.name)})`,
);
check(spoofed.name.length <= MAX_NAME + 1, 'and of any length that would break a row');

const huge = hostile([clean], { 1: { name: 'A'.repeat(100_000), opt: {} } });
check(huge.name.length <= MAX_NAME + 1, `a hundred-thousand-character name is cut (got ${huge.name.length})`);
check(cleanName('   ', 'fallback') === 'fallback', 'a name of nothing falls back');
check(cleanName(42, 'fallback') === 'fallback', 'so does a name that is not a string');
check(cleanName('ok', 'fallback') === 'ok', 'and a real one is left alone');

const long = hostile([[[0, 1000], 'R'.repeat(200_000), '', SECOND]]);
check(long.solves[0].scramble.length === MAX_SCRAMBLE, 'a two-hundred-thousand-move scramble is cut');
check(cleanScramble(null) === '', 'a scramble that is not a string becomes none');

// Times and dates are ids, axes and averages. Impossible ones are refused
// rather than drawn.
const times = hostile([
  [[0, 1000], 'R', '', SECOND],
  [[0, 0], 'R', '', SECOND],
  [[0, -5000], 'R', '', SECOND],
  [[0, 1e18], 'R', '', SECOND],
  [[0, 1000], 'R', '', 1e15],          // a date in the year 33658
  [[0, 1000], 'R', '', -1e12],         // and one before there were timers
]);
check(times.solves.length === 3, `only real times survive (got ${times.solves.length})`);
check(times.solves.every((solve) => solve.ms > 0 && solve.ms <= 86_400_000), 'and they are all plausible');
check(
  times.solves.filter((solve) => solve.at === 0).length === 2,
  'an impossible date is dropped, and the solve keeps its place',
);

const dated = applyImport(empty, [{
  source: times, include: true, name: times.name, event: '333', destination: NEW_SESSION,
}]);
const landed = dated.store.sessions[empty.sessions.length].solves;
check(
  landed.every((solve) => Number.isFinite(new Date(solve.id).getTime())),
  'every id that comes out is a date a formatter can draw',
);
check(new Set(landed.map((s) => s.id)).size === landed.length, 'and no two are the same');

// JSON.parse gives `__proto__` as an ordinary own property, and it stays one:
// nothing here spreads a parsed object into its own.
const polluted = parseCsTimer(JSON.stringify({
  session1: [clean],
  __proto__: { polluted: true },
  properties: { sessionData: JSON.stringify({ 1: { name: 'fine', opt: { scrType: '333' } }, __proto__: { x: 1 } }) },
}));
check(polluted.sessions.length === 1, 'a file carrying a __proto__ key still reads');
check(({} as Record<string, unknown>).polluted === undefined, 'and moves nothing onto Object.prototype');
check(({} as Record<string, unknown>).x === undefined, 'including through the nested session data');

// A session with a hostile shape rather than hostile contents.
const odd = parseCsTimer(JSON.stringify({
  session1: [clean, [], [[0]], [['nope', 'nope']], null, 42, { 0: [0, 1000] }],
  properties: { sessionData: '{ not json' },
}));
check(odd.sessions[0].solves.length === 1, 'only the one real solve is taken');
check(odd.sessions[0].name === 'csTimer 1', 'and unreadable session data just means default names');

// The store budget: localStorage throws on the write, long after this returns,
// so the refusal has to happen here.
const big = parseCsTimer(JSON.stringify({
  session1: Array.from({ length: 40_000 }, (_, index) => [[0, 12_345], 'R U R\' U\' '.repeat(12), '', SECOND + index]),
}));
try {
  applyImport(emptyTimerStore(), [{
    source: big.sessions[0], include: true, name: 'huge', event: '333', destination: NEW_SESSION,
  }]);
  failures.push('an import too big for localStorage was accepted');
} catch (problem) {
  check(
    (problem as Error).message.includes('more than the browser will keep'),
    'an oversized import is refused in words that say what to do',
  );
}

// Undo takes out exactly what an import put in: a session it created goes
// whole, a session it added to loses only the solves it added.
{
  const parsed = parseCsTimer(FILE);
  const mine = { ...newSession('mine', '333'), solves: [{ ...newSolve(9_000, null, 'R', '333', 'none'), id: 1_800_000_000_000 }] };
  const before: TimerStore = { ...emptyTimerStore(), sessions: [mine], activeId: mine.id };
  const rows: ImportRow[] = [
    { source: parsed.sessions[0], include: true, name: 'fresh', event: '333', destination: NEW_SESSION },
    { source: parsed.sessions[0], include: true, name: '', event: '333', destination: mine.id },
  ];

  const done = applyImport(before, rows);
  check(done.store.sessions.length === 2, 'the undo fixture imports into a new session and an existing one');
  const undone = undoImport(done.store, done.results);
  check(
    JSON.stringify(undone.sessions) === JSON.stringify(before.sessions),
    'undoing an import puts the sessions back exactly as they were',
  );
  check(undone.activeId === mine.id, 'and moves the active session off the one it removed');

  // A solve timed after the import is not the import's to take back.
  const later = { ...newSolve(11_000, null, 'U', '333', 'none'), id: mine.solves[0].id + 1 };
  const grown: TimerStore = {
    ...done.store,
    sessions: done.store.sessions.map((session) => (
      session.id === mine.id ? { ...session, solves: [...session.solves, later] } : session
    )),
  };
  const kept = undoImport(grown, done.results).sessions.find((session) => session.id === mine.id);
  check(
    kept !== undefined && kept.solves.length === 2 && kept.solves.some((solve) => solve.id === later.id),
    'a solve timed since the import survives its undo',
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s):`);
  for (const message of failures) console.error(`  ${message}`);
  process.exit(1);
}

console.log('✓ csTimer exports import intact, and hostile ones are bounded at every edge');
