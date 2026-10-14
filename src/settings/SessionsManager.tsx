import { useState } from 'react'
import { eventOf } from '../timer/events'
import {
  mergeSessions, moveSession, sortSessions, undoSessionOp, type SessionSort,
} from '../timer/sessionOps'
import { peekUndo, popUndo, pushUndo } from '../timer/undo'
import type { TimerStore } from '../timer/types'

const SORTS: { id: SessionSort; name: string }[] = [
  { id: 'name', name: 'name' },
  { id: 'newest', name: 'newest' },
  { id: 'solves', name: 'most solves' },
  { id: 'lastSolved', name: 'last solved' },
]

/**
 * Every session in order, to reorder or merge.
 *
 * The order here is the store's order, which is the order the picker and the
 * csTimer export use. A merge goes onto the timer's undo stack, so it can be
 * taken back from here or with the undo key on the timer.
 */
export default function SessionsManager({ store, onStore }: {
  store: TimerStore
  onStore: (next: TimerStore) => void
}) {
  /** What the last merge here said, while its undo is still the top of the stack. */
  const [done, setDone] = useState<string | null>(null)

  function merge(sourceId: string, targetId: string) {
    const source = store.sessions.find((item) => item.id === sourceId)
    const target = store.sessions.find((item) => item.id === targetId)
    if (!source || !target) return
    const count = source.solves.length
    if (!window.confirm(
      `Move ${count} ${count === 1 ? 'solve' : 'solves'} from "${source.name}" into "${target.name}" and delete "${source.name}"? You can undo this.`,
    )) return

    const outcome = mergeSessions(store, sourceId, targetId)
    if (!outcome) return
    pushUndo(outcome.undo)
    onStore(outcome.store)
    setDone(`Merged ${source.name} into ${target.name}.`)
  }

  function undo() {
    const top = peekUndo()
    if (!top || top.kind === 'solve') return
    const undone = undoSessionOp(store, top)
    popUndo()
    if (undone) onStore(undone.store)
    setDone(null)
  }

  const undoable = done !== null && peekUndo()?.kind === 'merge'

  return (
    <div className="sessions-manager">
      <div className="actions sessions-sort">
        <span>sort by</span>
        {SORTS.map((sort) => (
          <button key={sort.id} type="button" onClick={() => onStore(sortSessions(store, sort.id))}>
            {sort.name}
          </button>
        ))}
      </div>

      {done && (
        <p className="sessions-done" role="status">
          {done}
          {undoable && <button type="button" onClick={undo}>undo</button>}
        </p>
      )}

      <ol className="sessions-list">
        {store.sessions.map((session, index) => (
          <li key={session.id}>
            <span className="sessions-name">
              {session.name}
              <span className="mode-tag">{eventOf(session.event).short}</span>
            </span>
            <span className="sessions-count">{session.solves.length}</span>
            <span className="sessions-move">
              <button
                type="button"
                aria-label={`move ${session.name} up`}
                disabled={index === 0}
                onClick={() => onStore(moveSession(store, session.id, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`move ${session.name} down`}
                disabled={index === store.sessions.length - 1}
                onClick={() => onStore(moveSession(store, session.id, 1))}
              >
                ↓
              </button>
            </span>
            <select
              className="sessions-merge"
              value=""
              aria-label={`merge ${session.name} into another session`}
              disabled={store.sessions.length < 2}
              onChange={(change) => merge(session.id, change.target.value)}
            >
              <option value="">merge into…</option>
              {store.sessions
                .filter((other) => other.id !== session.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>{other.name}</option>
                ))}
            </select>
          </li>
        ))}
      </ol>
    </div>
  )
}
