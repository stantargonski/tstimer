import { between, pick } from './random';

/**
 * The puzzles that aren't cubes.
 *
 * Each of these is random-move rather than random-state: the WCA generates
 * Pyraminx, Skewb and Square-1 scrambles from a solver, and these will
 * occasionally be easier than a competition scramble would be. The notation is
 * the official notation in every case.
 */

/** Signed turn amounts, written the way each puzzle writes them. */
function signed(amount: number): string {
  return amount > 0 ? `${amount}+` : `${-amount}-`;
}

/**
 * Clock.
 *
 * Nine dial positions from the front, then the cube is flipped and four more
 * plus an all-dials turn, then the pin configuration. Every dial reads -5 to +6
 * because that is the full range of the twelve-hour face relative to zero.
 */
const CLOCK_FRONT = ['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL'];
const CLOCK_BACK = ['U', 'R', 'D', 'L', 'ALL'];

export function scrambleClock(): string[] {
  const dial = () => {
    const amount = between(-5, 6);
    return amount === 0 ? '0+' : signed(amount);
  };

  const moves = CLOCK_FRONT.map((face) => `${face}${dial()}`);
  moves.push('y2');
  moves.push(...CLOCK_BACK.map((face) => `${face}${dial()}`));

  // Which pins are up going in. All four down is a legal state and does come up.
  const pins = Array.from({ length: 4 }, () => pick(['U', 'd'])).join('');
  moves.push(pins);
  return moves;
}

/**
 * Megaminx, in the Pochmann notation every scrambler uses.
 *
 * Seven lines of ten alternating R and D turns — which are always double turns
 * on a megaminx, hence the doubled sign — each finished with a U or U'. The
 * alternation is fixed, not random: it is what makes the scramble applicable
 * without regripping.
 */
export function scrambleMegaminx(): string[] {
  const lines: string[] = [];

  for (let line = 0; line < 7; line += 1) {
    const moves: string[] = [];
    for (let pair = 0; pair < 5; pair += 1) {
      moves.push(`R${pick(['++', '--'])}`);
      moves.push(`D${pick(['++', '--'])}`);
    }
    moves.push(pick(["U", "U'"]));
    lines.push(moves.join(' '));
  }
  return lines;
}

/**
 * Pyraminx: the four large turns, then the tips.
 *
 * Tips are listed last and each is optional, because a tip that is already
 * solved is not worth a move — which is exactly how the official scrambles
 * write them.
 */
const TRIANGLE = ['U', 'L', 'R', 'B'] as const;

export function scramblePyraminx(): string[] {
  const moves = randomFaces(TRIANGLE, 10);

  for (const tip of ['u', 'l', 'r', 'b']) {
    const turn = pick(['', "'", '2']);
    // '2' on a tip is the same as its inverse, so only two states are worth writing.
    if (turn !== '2') moves.push(`${tip}${turn}`);
  }
  return moves;
}

export function scrambleSkewb(): string[] {
  return randomFaces(TRIANGLE, 11);
}

/** `length` turns of the given axes, never twice on the same one in a row. */
function randomFaces(faces: readonly string[], length: number): string[] {
  const moves: string[] = [];
  let prev: string | null = null;

  for (let i = 0; i < length; i += 1) {
    const face = pick(faces.filter((item) => item !== prev));
    moves.push(`${face}${pick(['', "'"])}`);
    prev = face;
  }
  return moves;
}

/**
 * Square-1, in slash notation.
 *
 * `(a,b)` turns the top layer a twelfths and the bottom b twelfths; the slash
 * flips half the puzzle over. A slash is only possible when neither layer has a
 * corner across the cut, so the layers are tracked as the scramble is built and
 * a twist is drawn again until it leaves both cut-aligned. Picking twists blind
 * produced scrambles with an impossible slash in almost every one.
 *
 * Each layer is twelve 30° cells, clockwise; a 1 marks the first cell of a
 * corner, which runs on into the next. The model is csTimer's, so the twists
 * read the same way round as everyone else's.
 */
const SQ1_SOLVED = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];

/** Whether turning top by `top` and bottom by `bottom` leaves a slash possible. */
export function sq1CanSlashAfter(cells: readonly number[], top: number, bottom: number): boolean {
  const at = (layer: number, turn: number, index: number) =>
    cells[layer * 12 + (((index - turn) % 12) + 12) % 12];
  // A corner starting in cell 5 or 11 would sit across the cut.
  return !at(0, top, 5) && !at(0, top, 11) && !at(1, bottom, 5) && !at(1, bottom, 11);
}

/** The layers after a twist. */
export function sq1Twist(cells: readonly number[], top: number, bottom: number): number[] {
  return cells.map((_, i) => {
    const layer = i < 12 ? 0 : 1;
    const turn = layer === 0 ? top : bottom;
    return cells[layer * 12 + (((i % 12) - turn) % 12 + 12) % 12];
  });
}

/** The layers after a slash: the right half of each layer swaps over. */
export function sq1Slash(cells: readonly number[]): number[] {
  const next = [...cells];
  for (let i = 0; i < 6; i += 1) {
    next[i + 6] = cells[i + 12];
    next[i + 12] = cells[i + 6];
  }
  return next;
}

export function scrambleSquare1(): string[] {
  const twists = between(11, 13);
  const moves: string[] = [];
  let cells = [...SQ1_SOLVED];

  for (let i = 0; i < twists; i += 1) {
    let top: number;
    let bottom: number;
    // (0,0) would put two slashes back to back, which undo each other.
    do {
      top = between(-5, 6);
      bottom = between(-5, 6);
    } while ((top === 0 && bottom === 0) || !sq1CanSlashAfter(cells, top, bottom));

    cells = sq1Twist(cells, top, bottom);
    const last = i === twists - 1;
    if (!last) cells = sq1Slash(cells);
    // The slash rides on the twist before it, the way the notation is written.
    moves.push(`(${top},${bottom})${last ? '' : '/'}`);
  }
  return moves;
}
