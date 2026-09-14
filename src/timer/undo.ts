import type { Solve } from './types'

/**
 * Solves deleted from the timer, newest last, so a delete can be taken back.
 *
 * Module state rather than component state for the same reason as the settings
 * page's remembered tab: the timer unmounts every time you look at another
 * page, and a delete you can only undo if you never left is barely an undo.
 * Not persisted — an undo that survived a reload would be a recycle bin.
 */
export interface Deleted {
  sessionId: string
  /** Where it sat in the session, so it goes back in the same place. */
  index: number
  solve: Solve
}

const MAX = 20

const stack: Deleted[] = []

export function pushDeleted(entry: Deleted): void {
  stack.push(entry)
  if (stack.length > MAX) stack.shift()
}

export function popDeleted(): Deleted | undefined {
  return stack.pop()
}
