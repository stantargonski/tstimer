import { DEFAULT_RELAY, eventOf, type EventId, type WcaEvent } from '../events';
import { leadingFace, randomNxN, randomOrientation } from './nxn';
import {
  scrambleClock, scrambleMegaminx, scramblePyraminx, scrambleSkewb, scrambleSquare1,
} from './other';
import { isReady, randomStateScramble, warmUp } from './twoByTwo';

/**
 * A scramble, as tokens rather than as one string.
 *
 * `lines` is for the puzzles whose scrambles are written as several rows —
 * megaminx, and multi-blind's one scramble per cube.
 */
export interface Scramble {
  /** The tokens to apply, in order. */
  moves: string[];
  /** Pre-formatted rows, when a flat list of tokens isn't the right shape. */
  lines?: string[];
}

/** An empty scramble, for the moment before the first one is generated. */
export const NO_SCRAMBLE: Scramble = { moves: [] };

/** Anything about the current session a generator needs beyond the event itself. */
export interface ScrambleOptions {
  /** How many cubes a multi-blind attempt is for. Ignored by every other event. */
  mbldCount?: number;
  /** The puzzles in a custom relay. Ignored by every other event. */
  relay?: EventId[];
}

/**
 * The 2x2 needs a table built before it can give a real random-state scramble.
 * Asking early means it is usually ready by the time you finish reading the
 * first scramble, and asking twice costs nothing.
 */
export function prepare(event: WcaEvent): void {
  if (event.scramble.kind === 'nxn' && event.scramble.size === 2) warmUp();
}

export function scrambleFor(event: WcaEvent, options: ScrambleOptions = {}): Scramble {
  const spec = event.scramble;

  switch (spec.kind) {
    case 'nxn': {
      // The 2x2 gets a real random state when the table is up, and random moves
      // until then — never a wait.
      if (spec.size === 2) {
        warmUp();
        const state = isReady() ? randomStateScramble() : null;
        if (state) return { moves: state };
      }
      return { moves: randomNxN(spec.size, spec.length) };
    }

    // Blindfolded scrambles carry their reorientation as wide moves on the end,
    // so it travels with the scramble instead of being an instruction beside it.
    case 'nxnbf': {
      const orientation = randomOrientation();
      const before = leadingFace(orientation);
      return {
        moves: [
          ...randomNxN(spec.size, spec.length, before ? { before } : {}),
          ...orientation,
        ],
      };
    }

    // FMC scrambles are bracketed by R' U' F at both ends, so nobody can start
    // from a position handed to them already partly solved. The core is told
    // what it sits between, so neither join leaves a redundant turn.
    case 'fmc': {
      const core = randomNxN(3, 20, { after: 'F', before: 'R' });
      return { moves: ["R'", "U'", 'F', ...core, "R'", "U'", 'F'] };
    }

    case 'mbf': {
      const count = options.mbldCount ?? spec.count;
      const lines = Array.from({ length: count }, (_, index) => {
        const orientation = randomOrientation();
        const before = leadingFace(orientation);
        const moves = [...randomNxN(3, 20, before ? { before } : {}), ...orientation];
        return `${index + 1}) ${moves.join(' ')}`;
      });
      return { moves: [], lines };
    }

    case 'clock':
      return { moves: scrambleClock() };

    case 'minx':
      return { moves: [], lines: scrambleMegaminx() };

    case 'pyram':
      return { moves: scramblePyraminx() };

    case 'skewb':
      return { moves: scrambleSkewb() };

    case 'sq1':
      return { moves: scrambleSquare1() };

    // One line per puzzle, named, in the order they're solved. A puzzle whose
    // scramble is rows of its own (megaminx) gets its name on a line above them.
    case 'relay': {
      const lines = (spec.events ?? options.relay ?? DEFAULT_RELAY).flatMap((id) => {
        const part = eventOf(id);
        const sub = scrambleFor(part, options);
        return sub.lines
          ? [`${part.short}:`, ...sub.lines]
          : [`${part.short}: ${sub.moves.join(' ')}`];
      });
      return { moves: [], lines };
    }
  }
}

/** The whole thing as one line, for storing on a solve and for the clipboard. */
export function scrambleText(scramble: Scramble): string {
  if (scramble.lines) return scramble.lines.join('\n');
  return scramble.moves.join(' ');
}
