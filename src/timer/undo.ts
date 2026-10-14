import type { Session, Solve } from './types'

/**
 * Things taken out of the timer's history, newest last, so they can be put back.
 *
 * Module state rather than component state for the same reason as the settings
 * page's remembered tab: the timer unmounts every time you look at another
 * page, and a delete you can only undo if you never left is barely an undo.
 * Not persisted — an undo that survived a reload would be a recycle bin.
 *
 * Three kinds share the one stack, so the undo key takes back whichever came
 * last: a deleted solve, a merge (which deletes a session), or a split.
 */
export type UndoEntry =
  | {
      kind: 'solve'
      sessionId: string
      /** Where it sat in the session, so it goes back in the same place. */
      index: number
      solve: Solve
    }
  | {
      kind: 'merge'
      /** The session merged away, as it was, and where it sat in the list. */
      source: Session
      index: number
      targetId: string
      /** The ids the moved solves have in the target, after any nudge. */
      movedIds: number[]
      /** Whether the source was the open session. */
      wasActive: boolean
    }
  | {
      kind: 'split'
      /** The session split, and the one made from its tail. */
      sessionId: string
      createdId: string
    }

const MAX = 20

const stack: UndoEntry[] = []

export function pushUndo(entry: UndoEntry): void {
  stack.push(entry)
  if (stack.length > MAX) stack.shift()
}

export function popUndo(): UndoEntry | undefined {
  return stack.pop()
}

/** The entry an undo would take back, without taking it. */
export function peekUndo(): UndoEntry | undefined {
  return stack[stack.length - 1]
}
