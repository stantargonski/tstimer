/**
 * Asserts every event produces a scramble the rest of the app can use.
 *
 * Run with `npm run check:scramble`.
 *
 * The thing worth checking is the join between the generators and the engine:
 * a scramble is only useful if the preview can parse it, and notation is exactly
 * the sort of thing that looks right and isn't — `U3w2` instead of `3Uw2` reads
 * fine in a list and fails the moment something tries to apply it.
 */
import { EVENTS, eventOf } from '../src/timer/events';
import { scrambleFor, scrambleText } from '../src/timer/scramble';
import { warmUp, isReady, randomStateScramble } from '../src/timer/scramble/twoByTwo';
import { randomOrientation } from '../src/timer/scramble/nxn';
import { solvedCube, stateAfter } from '../src/cube/nxn';
import { scrambleSquare1 } from '../src/timer/scramble/other';

const failures: string[] = [];

function check(ok: boolean, message: string): void {
  if (!ok) failures.push(message);
}

/** Every WCA face token, wherever it sits in the string. */
function faceOfToken(token: string): string | null {
  const match = /[UDLRFB]/.exec(token);
  return match ? match[0] : null;
}

function checkEveryEvent(): void {
  for (const event of EVENTS) {
    for (let trial = 0; trial < 200; trial += 1) {
      const scramble = scrambleFor(event);
      const text = scrambleText(scramble);

      check(text.trim() !== '', `${event.id}: produced an empty scramble`);

      // Whatever the preview claims it can draw, it has to actually draw.
      if (event.preview === 'nxn') {
        check(event.size !== undefined, `${event.id}: previewable but has no size`);
        try {
          const state = stateAfter(event.size!, scramble.moves);
          const counts = new Map<string, number>();
          for (const colour of state) counts.set(colour, (counts.get(colour) ?? 0) + 1);
          for (const [colour, count] of counts) {
            check(
              count === event.size! * event.size!,
              `${event.id}: ${count} ${colour} stickers, want ${event.size! * event.size!}`,
            );
          }
        } catch (error) {
          failures.push(`${event.id}: preview cannot parse "${scramble.moves.join(' ')}" — ${(error as Error).message}`);
        }
      }

      // 3BLD ends held at a random angle, written as up to two wide moves on
      // the end of the scramble rather than as an instruction beside it. Only
      // checkable on the 3x3, where nothing else emits a wide turn — a 4BLD
      // scramble is full of them.
      if (event.id === '333bf') {
        const wide = scramble.moves.filter((token) => /w/.test(token));
        check(
          wide.length <= 2 && wide.every((token) => /^(Rw|Fw|Uw)('|2)?$/.test(token)),
          `${event.id}: unexpected wide moves "${wide.join(' ')}"`,
        );
        check(
          scramble.moves.slice(scramble.moves.length - wide.length).join(' ') === wide.join(' '),
          `${event.id}: the reorientation is not on the end of ${scramble.moves.join(' ')}`,
        );
      }

      // Only meaningful for cubes: clock's `y2` is part of its own notation,
      // an instruction to turn the puzzle over, not a cube reorientation.
      if (event.preview === 'nxn') {
        check(
          !scramble.moves.some((token) => /^[xyz]/.test(token)),
          `${event.id}: a rotation leaked into the move list`,
        );
      }

      // No scrambler should ever emit the same face twice running.
      let prev: string | null = null;
      for (const token of scramble.moves) {
        const face = faceOfToken(token);
        if (face && event.preview === 'nxn') {
          check(face !== prev, `${event.id}: repeated face in ${scramble.moves.join(' ')}`);
        }
        prev = face;
      }
    }
  }
}

/**
 * All 24 orientations, each reachable.
 *
 * The suffix is generated before the scramble it joins onto precisely so that
 * filtering never narrows it — so the thing worth asserting is that nothing has
 * narrowed it. A blindfolded solver who can rule out four of the twenty-four
 * angles has been handed information the event is supposed to withhold.
 */
function checkOrientations(): void {
  const seen = new Set<string>();
  for (let trial = 0; trial < 20_000; trial += 1) {
    const orientation = randomOrientation();
    check(orientation.length <= 2, `orientation too long: ${orientation.join(' ')}`);
    check(
      orientation.every((token) => /^(Rw|Fw|Uw)('|2)?$/.test(token)),
      `orientation used an unexpected token: ${orientation.join(' ')}`,
    );
    seen.add(orientation.join(' '));
  }
  check(seen.size === 24, `only ${seen.size} of 24 orientations are reachable`);
}

/** Multi-blind scrambles one cube per line, as many as the timer asks for. */
function checkMultiBlind(): void {
  const event = eventOf('333mbf');
  for (const mbldCount of [2, 3, 7, 60]) {
    const scramble = scrambleFor(event, { mbldCount });
    check(
      scramble.lines?.length === mbldCount,
      `333mbf: asked for ${mbldCount} cubes, got ${scramble.lines?.length}`,
    );
    check(
      (scramble.lines ?? []).every((line, index) => line.startsWith(`${index + 1}) `)),
      '333mbf: lines are not numbered in order',
    );
  }
}

/** A scramble that leaves the puzzle solved is not a scramble. */
function checkNotSolved(): void {
  for (const event of EVENTS.filter((item) => item.preview === 'nxn')) {
    const solved = solvedCube(event.size!).join('');
    let identical = 0;

    for (let trial = 0; trial < 100; trial += 1) {
      if (stateAfter(event.size!, scrambleFor(event).moves).join('') === solved) identical += 1;
    }
    check(identical === 0, `${event.id}: ${identical} scrambles left the puzzle solved`);
  }
}

/**
 * The 2x2 table, once it exists, has to give optimal solutions — which is
 * checkable without a second solver: the mean optimal solution length over the
 * whole state space is a published constant, near 8.76 moves.
 */
async function checkTwoByTwo(): Promise<void> {
  warmUp();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check(isReady(), '2x2 table did not build');
  if (!isReady()) return;

  const solved = solvedCube(2).join('');
  let total = 0;
  const samples = 5000;

  for (let trial = 0; trial < samples; trial += 1) {
    const moves = randomStateScramble()!;
    total += moves.length;
    check(moves.length <= 11, `2x2 solution longer than God's number: ${moves.join(' ')}`);
    check(stateAfter(2, moves).join('') !== solved, `2x2 scramble did nothing: ${moves.join(' ')}`);
  }

  const mean = total / samples;
  check(
    mean > 8.5 && mean < 9.0,
    `2x2 mean optimal length ${mean.toFixed(2)}, expected about 8.76 — the solver is not optimal`,
  );
  console.log(`  2x2 mean optimal scramble length ${mean.toFixed(2)} over ${samples} samples`);
}

function checkEventTable(): void {
  for (const event of EVENTS) {
    check(eventOf(event.id).id === event.id, `${event.id}: not findable by its own id`);
    check(event.split === event.id.includes('bf'), `${event.id}: split disagrees with being blindfolded`);
    if (!event.inspection) {
      check(
        event.id.includes('bf') || event.id === '333fm',
        `${event.id}: skips inspection but is neither blindfolded nor FMC`,
      );
    }
  }
  check(eventOf('nonsense').id === '333', 'an unknown event id should fall back to 3x3');
}

/**
 * Every Square-1 slash has to be one a real puzzle can make.
 *
 * Replayed on a piece model of its own rather than the generator's cell flags:
 * each layer is twelve 30° cells holding a piece id, a corner filling two, and a
 * slash is legal only when no piece sits across either end of the cut.
 */
function checkSquare1(): void {
  const piece = (ids: string) => ids.split(' ');
  for (let trial = 0; trial < 2000; trial += 1) {
    let top = piece('c0 c0 e1 c2 c2 e3 c4 c4 e5 c6 c6 e7');
    let bottom = piece('e8 c9 c9 e10 c11 c11 e12 c13 c13 e14 c15 c15');
    const turn = (layer: string[], by: number) => layer.map((_, i) => layer[(((i - by) % 12) + 12) % 12]);
    const cut = (layer: string[]) => layer[11] !== layer[0] && layer[5] !== layer[6];
    const scramble = scrambleSquare1().join(' ');

    for (const match of scramble.matchAll(/\((-?\d+),(-?\d+)\)(\/?)/g)) {
      const [, a, b, slash] = match;
      check(!(a === '0' && b === '0'), `square-1: a (0,0) twist in ${scramble}`);
      top = turn(top, Number(a));
      bottom = turn(bottom, Number(b));
      if (!slash) continue;
      if (!cut(top) || !cut(bottom)) {
        check(false, `square-1: an impossible slash after (${a},${b}) in ${scramble}`);
        break;
      }
      const flipped = top.slice(6);
      top = [...top.slice(0, 6), ...bottom.slice(0, 6)];
      bottom = [...flipped, ...bottom.slice(6)];
    }
  }
}

checkEventTable();
checkSquare1();
checkEveryEvent();
checkNotSolved();
checkOrientations();
checkMultiBlind();
await checkTwoByTwo();

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s):`);
  for (const message of failures.slice(0, 20)) console.error(`  ${message}`);
  if (failures.length > 20) console.error(`  ... and ${failures.length - 20} more`);
  process.exit(1);
}

console.log(`✓ all ${EVENTS.length} events scramble, and every previewable one parses`);
