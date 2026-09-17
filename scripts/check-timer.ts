/**
 * Asserts the clock says the right thing in every state it can be in.
 *
 * Run with `npm run check:timer`.
 *
 * The timer's moving parts are requestAnimationFrame loops and key handlers,
 * which need a browser. What the clock *reads* given a state does not, and it is
 * where the branching lives: inspection counting down, turning into a penalty,
 * the three running-display modes, and the rule that the previous solve stays on
 * screen until the next one starts.
 */
import { clockPhase, clockText, isInspecting, penaltyFor } from '../src/timer/display';
import { INSPECT_DNF_MS, INSPECT_MS } from '../src/timer/useTimer';
import { formatTime } from '../src/timer/format';
import { averageText } from '../src/timer/averageText';
import { sessionCsv, solveLine, solvesCsv } from '../src/data/backup';
import { newSession, type Solve } from '../src/timer/types';
import {
  BESIDE_MIN, FIT_GAP, STACK_GAP, clampPlace, clearOf, fitPanel, overlaps,
  type FrameBox, type PanelBox, type Rect,
} from '../src/timer/panelFit';
import { SNAP, snapMove, snapResize } from '../src/timer/panelSnap';
import { PREVIEW_MARGIN } from '../src/timer/settings';

const failures: string[] = [];

function check(ok: boolean, message: string): void {
  if (!ok) failures.push(message);
}

function reads(input: Partial<Parameters<typeof clockText>[0]>, expected: string, why: string): void {
  const actual = clockText({
    phase: 'idle', ms: 0, inspectMs: 0, decimals: 2, runningDisplay: 'tenths', ...input,
  });
  check(actual === expected, `${why}: expected "${expected}", got "${actual}"`);
}

// ---- the previous time survives until the next solve begins ----

const PREVIOUS = 12_345;
for (const phase of ['idle', 'holding', 'ready'] as const) {
  reads(
    { phase, ms: PREVIOUS },
    formatTime(PREVIOUS, 2),
    `${phase} should still show the last solve`,
  );
}
// ...and is gone the instant it starts, because the hook zeroes ms there.
reads({ phase: 'running', ms: 0 }, '0.0', 'a running solve starts from zero');

// ---- running display modes ----

reads({ phase: 'running', ms: 12_345, runningDisplay: 'tenths' }, '12.3', 'tenths');
reads({ phase: 'running', ms: 12_345, runningDisplay: 'seconds' }, '12', 'seconds');
reads({ phase: 'running', ms: 12_345, runningDisplay: 'hidden' }, 'solve', 'hidden');
reads({ phase: 'memo', ms: 12_345, runningDisplay: 'hidden' }, 'solve', 'hidden during memo');
// The setting is about the live readout only — a finished solve is always full.
reads({ phase: 'idle', ms: 12_345, runningDisplay: 'hidden' }, '12.34', 'a finished solve is never hidden');
reads({ phase: 'idle', ms: 12_345, decimals: 3 }, '12.345', 'three decimals when asked');

// ---- inspection ----

reads({ phase: 'inspecting', inspectMs: 0 }, '15', 'inspection starts at 15');
reads({ phase: 'inspecting', inspectMs: 1 }, '15', 'a millisecond in is still 15');
reads({ phase: 'inspecting', inspectMs: 1000 }, '14', 'one second in reads 14');
reads({ phase: 'inspecting', inspectMs: 14_999 }, '1', 'the last second reads 1');
reads({ phase: 'inspecting', inspectMs: INSPECT_MS }, '+2', 'fifteen seconds exactly is +2');
reads({ phase: 'inspecting', inspectMs: 16_500 }, '+2', 'still +2 before seventeen');
reads({ phase: 'inspecting', inspectMs: INSPECT_DNF_MS }, 'DNF', 'seventeen seconds is a DNF');
reads({ phase: 'inspecting', inspectMs: 30_000 }, 'DNF', 'and stays a DNF');

// The countdown carries through the hold that ends inspection, and through the
// armed pause after it — getting ready is part of your fifteen seconds, not a
// pause in them. 'ready' is the case that used to drop back to the last solve's
// time a moment before the next one started.
reads({ phase: 'holding', inspectMs: 3000, ms: PREVIOUS }, '12', 'the hold keeps counting down');
reads({ phase: 'ready', inspectMs: 3000, ms: PREVIOUS }, '12', 'an armed timer keeps counting down');
reads({ phase: 'ready', inspectMs: INSPECT_MS }, '+2', 'and still names the penalty it earned');
// But a hold or an arm with no inspection behind it shows the last solve.
reads({ phase: 'holding', inspectMs: 0, ms: PREVIOUS }, formatTime(PREVIOUS, 2), 'no inspection, no countdown');
reads({ phase: 'ready', inspectMs: 0, ms: PREVIOUS }, formatTime(PREVIOUS, 2), 'nor when armed without it');

check(isInspecting('inspecting', 0), 'inspecting is inspecting even at zero elapsed');
check(isInspecting('holding', 1), 'a hold during inspection still counts as inspecting');
check(isInspecting('ready', 1), 'and so does the arm that follows it');
check(!isInspecting('holding', 0), 'a plain hold is not inspection');
check(!isInspecting('ready', 0), 'nor is a plain arm');
check(!isInspecting('running', 5000), 'a running solve is not inspection');

// ---- penalties ----

check(penaltyFor(0) === 'none', 'no penalty at the start');
check(penaltyFor(INSPECT_MS - 1) === 'none', 'no penalty just under fifteen');
check(penaltyFor(INSPECT_MS) === 'plus2', '+2 at fifteen');
check(penaltyFor(INSPECT_DNF_MS - 1) === 'plus2', '+2 just under seventeen');
check(penaltyFor(INSPECT_DNF_MS) === 'dnf', 'DNF at seventeen');

// ---- the colour the clock wears ----

check(clockPhase('idle', 0) === 'idle', 'idle looks idle');
check(clockPhase('holding', 0) === 'holding', 'holding looks holding');
check(clockPhase('inspecting', 1000) === 'inspecting', 'a healthy countdown looks normal');
check(clockPhase('inspecting', INSPECT_MS) === 'over', 'a countdown past fifteen looks wrong');
check(clockPhase('inspecting', INSPECT_DNF_MS) === 'over', 'and past seventeen too');

// ---- the CSV, and the block an average copies out as ----

/** A run of solves with known times, so the text they produce is known too. */
function solvesOf(times: number[]): Solve[] {
  return times.map((ms, index) => ({
    id: 1_700_000_000_000 + index * 60_000,
    ms,
    memoMs: null,
    penalty: 'none' as const,
    scramble: `R U R' scramble ${index + 1}`,
    event: '333' as const,
  }));
}

const sample = solvesOf([12_340, 15_010, 13_500, 11_020, 14_770]);
const session = { ...newSession('test'), solves: sample };

// sessionCsv delegates to solvesCsv now. The point of the split is that it
// changed nothing about what a session exports.
check(
  sessionCsv(session) === solvesCsv(sample),
  'a session exports exactly what its solves export',
);
check(
  sessionCsv(session).split('\n').length === sample.length + 1,
  'the CSV is a header plus one row per solve',
);
check(
  sessionCsv(session).startsWith('no,event,time,penalty,effective,memo,exec,date,scramble'),
  'the CSV columns are unchanged',
);

const block = averageText('ao5', sample, 2);
const lines = block.split('\n');

check(lines[0] === 'ao5: 13.53', `the block opens with the average, got "${lines[0]}"`);
check(lines[1] === '', 'a blank line separates the average from its solves');
// Headline, blank, one line per solve.
check(lines.length === sample.length + 2, 'one line per solve, in the order they happened');
check(!block.includes('tstimer'), 'and nothing says where it came from');
// The reason the headline can be pinned at all: a one-solve window trims away
// to nothing, so the average of it is not a number worth printing.
check(
  averageText('best single', [sample[0]], 2, 12340).split('\n')[0] === 'best single: 12.34',
  'an explicit headline overrides the trimmed average',
);
// An ao5 trims one from each end: the 11.02 and the 15.01, and nothing else.
check(
  lines.filter((line) => line.includes('(')).length === 2,
  'exactly the trimmed pair is bracketed',
);
// Headline, blank — so the first solve is line 2.
check(lines[5].includes('(11.02)'), 'the best of the five is bracketed as trimmed');
check(lines[3].includes('(15.01)'), 'the worst of the five is bracketed as trimmed');
check(lines[2].includes("R U R' scramble 1"), 'each line carries its own scramble');

// One solve, copied: when on the first line, then puzzle, time and scramble.
const copied = solveLine(sample[0], 2).split('\n');
check(copied.length === 2, `a copied solve is two lines, got ${copied.length}`);
check(
  copied[1] === `3x3  12.34  ${sample[0].scramble}`,
  `the second line is the event, the time and the scramble; got "${copied[1]}"`,
);
check(!copied[0].includes('tstimer') && /\d/.test(copied[0]), `the first line is the date and time, got "${copied[0]}"`);

// ---- the floating panels, fitted to the room beside the rail ----

// The stock sizes and places, on a 13" laptop's half-screen window and on a
// full HD one. The rail is 329 wide at stock text size, not its 300px basis.
const PREVIEW: PanelBox = { width: 320, height: 268, right: 16, bottom: 16 };
const GRAPH: PanelBox = { width: 320, height: 150, right: 348, bottom: 16 };
const WIDE: FrameBox = { width: 1920, height: 1000, left: 329, top: 150 };
const NARROW: FrameBox = { width: 860, height: 704, left: 329, top: 149 };

check(
  JSON.stringify(fitPanel(PREVIEW, WIDE)) === JSON.stringify(PREVIEW),
  'a panel with room to spare is drawn exactly as saved',
);
check(
  fitPanel(GRAPH, { width: 0, height: 0, left: 0, top: 0 }) === GRAPH,
  'an unmeasured frame passes the panel through untouched',
);

const squeezed = fitPanel({ ...PREVIEW, width: 680 }, NARROW);
check(
  squeezed.width === NARROW.width - NARROW.left - 2 * FIT_GAP,
  `a panel wider than the column shrinks to it, got ${squeezed.width}`,
);
const graphNarrow = fitPanel(GRAPH, NARROW);
check(
  NARROW.width - graphNarrow.right - graphNarrow.width >= NARROW.left,
  'a panel is never drawn over the rail',
);
check(graphNarrow.width === GRAPH.width, 'a panel that fits is moved, not shrunk');
const high = fitPanel({ ...GRAPH, bottom: 4000 }, NARROW);
check(high.bottom + high.height <= NARROW.height, 'a panel never rises above the top of the frame');
check(
  fitPanel({ ...PREVIEW, right: PREVIEW_MARGIN }, NARROW).right === PREVIEW_MARGIN,
  'a panel can still be tucked off the right edge',
);

// The graph's stock place is beside the preview, which a narrow window has no
// room for: kept off the rail, it lands on the preview instead.
const previewNarrow = fitPanel(PREVIEW, NARROW);
check(overlaps(graphNarrow, previewNarrow), 'the narrow window pushes the graph onto the preview');
const beside = clearOf(graphNarrow, previewNarrow, GRAPH, PREVIEW, NARROW);
check(!overlaps(beside, previewNarrow), 'an overlap the window caused is undone');
check(
  beside.bottom === previewNarrow.bottom && beside.width >= BESIDE_MIN && beside.width < GRAPH.width,
  `with room for it, the graph goes beside the preview, narrowed; got ${JSON.stringify(beside)}`,
);
check(
  NARROW.width - beside.right - beside.width >= NARROW.left,
  'and narrowing it keeps it off the rail',
);

// Thirty pixels less and beside would be too thin to read, so it goes above.
const NARROWER: FrameBox = { ...NARROW, width: 830 };
const previewNarrower = fitPanel(PREVIEW, NARROWER);
const stacked = clearOf(fitPanel(GRAPH, NARROWER), previewNarrower, GRAPH, PREVIEW, NARROWER);
check(!overlaps(stacked, previewNarrower), 'too narrow to sit beside, the graph still clears the preview');
check(
  stacked.bottom === previewNarrower.bottom + previewNarrower.height + STACK_GAP
    && stacked.width === GRAPH.width,
  `it stacks just above the preview at its own width; got ${JSON.stringify(stacked)}`,
);

const chosen = { ...GRAPH, right: 100, bottom: 100 };
const chosenFit = fitPanel(chosen, NARROW);
check(
  clearOf(chosenFit, previewNarrow, chosen, PREVIEW, NARROW) === chosenFit,
  'an overlap the user dragged into is left alone',
);

// ---- the clock and its averages ----

// Measured off the timer at 860×760 with the rail docked: the clock, its delta,
// and the ao5 / ao12 line under it, in frame coordinates.
const CLOCK: Rect = { left: 405, top: 300, right: 699, bottom: 475 };

const overClock = fitPanel(PREVIEW, NARROW);
check(
  overClock.width === previewNarrow.width && overClock.height === previewNarrow.height,
  'a panel put over the clock keeps its size',
);

// At 830 the graph has no room beside the preview, and above it is the clock.
const graphNarrower = fitPanel(GRAPH, NARROWER);
check(
  clearOf(graphNarrower, previewNarrower, GRAPH, PREVIEW, NARROWER, { keepOut: CLOCK }) === graphNarrower,
  'the graph is never stacked onto the clock to clear the preview',
);

// ---- a rail that ends under the stats ----

const SHORT: FrameBox = { ...WIDE, railBottom: 260 };
const low = clampPlace(4000, 100, { width: 260, height: 320 }, SHORT);
check(
  WIDE.width - low.right - 260 === 0,
  `a box below the rail reaches the frame's left edge; its left is at ${WIDE.width - low.right - 260}`,
);
const nextToRail = clampPlace(4000, 500, { width: 260, height: 320 }, SHORT);
check(
  WIDE.width - nextToRail.right - 260 === SHORT.left,
  'a box any of which is beside the rail is kept to its right',
);
check(
  fitPanel({ width: 1900, height: 200, right: 16, bottom: 16 }, SHORT).width === WIDE.width - 2 * FIT_GAP,
  'a box below the rail is fitted to the whole width',
);
const underRail = snapMove({ left: FIT_GAP + 5, top: 600, right: FIT_GAP + 205, bottom: 700 }, [], SHORT);
check(underRail.rect.left === FIT_GAP, 'an edge near the frame below the rail lands a margin off it');
const besideRail = snapMove({ left: SHORT.left + FIT_GAP + 5, top: 200, right: SHORT.left + FIT_GAP + 205, bottom: 300 }, [], SHORT);
check(besideRail.rect.left === SHORT.left + FIT_GAP, 'beside the rail it still lands a margin off the rail');

// ---- snapping ----

const ROOM: FrameBox = { width: 1000, height: 800, left: 300, top: 150 };
const PREVIEW_AT: Rect = { left: 600, top: 500, right: 900, bottom: 700 };
const OTHERS = [{ id: 'preview', rect: PREVIEW_AT }];

// 8px short of sitting a gap to the preview's left.
const near: Rect = { left: 380, top: 520, right: 580, bottom: 620 };
const pulled = snapMove(near, OTHERS, ROOM);
check(
  pulled.rect.right === PREVIEW_AT.left - STACK_GAP,
  `a box ${SNAP - 2}px off sits exactly a gap beside the other; got right ${pulled.rect.right}`,
);
check(
  pulled.rect.right - pulled.rect.left === 200 && pulled.rect.bottom - pulled.rect.top === 100,
  'moving never changes its size',
);
check(
  pulled.guides.some((guide) => guide.axis === 'x' && guide.at === PREVIEW_AT.left - STACK_GAP),
  'and a guide marks the line it landed on',
);
const far = snapMove({ ...near, left: 377, right: 577 }, OTHERS, ROOM);
check(far.rect.right === 577 && far.guides.length === 0, `${SNAP + 1}px off pulls nothing`);
const railSide = snapMove({ ...near, left: ROOM.left + FIT_GAP + 6, right: ROOM.left + FIT_GAP + 206 }, [], ROOM);
check(railSide.rect.left === ROOM.left + FIT_GAP, 'an edge near the rail lands a margin off it');

// Resizing from the top-left: 5px short of the preview's 300 width.
const grown = snapResize(
  { left: 285, top: 520, right: 580, bottom: 620 }, ['left', 'top'], OTHERS, ROOM,
);
check(grown.rect.right === 580 && grown.rect.bottom === 620, 'the pinned corner stays put');
check(
  grown.rect.right - grown.rect.left === 300 && grown.matched.includes('preview'),
  `the width pulls to the preview's; got ${grown.rect.right - grown.rect.left}`,
);
check(grown.guides.length === 0, 'a matched size draws no line of its own');

// From the right edge instead: 4px short of the preview's width, left edge pinned.
const widened = snapResize({ left: 300, top: 150, right: 596, bottom: 250 }, ['right'], OTHERS, ROOM);
check(
  widened.rect.left === 300 && widened.rect.right === 600 && widened.matched.includes('preview'),
  `the right edge pulls to the preview's width too; got ${JSON.stringify(widened.rect)}`,
);
check(
  widened.rect.top === 150 && widened.rect.bottom === 250,
  'and a side resize leaves the other axis alone',
);

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s):`);
  for (const message of failures) console.error(`  ${message}`);
  process.exit(1);
}

console.log('✓ the clock reads correctly in every state, inspection and penalties included');
