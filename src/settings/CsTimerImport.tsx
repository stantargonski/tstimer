import { useRef, useState } from 'react'
import { describeBytes, MAX_FILE_BYTES, MAX_NAME, tooBig } from '../data/limits'
import {
  applyImport, countSolves, looksImported, NEW_SESSION, parseCsTimer, undoImport,
  type CsTimerFile, type ImportedSession, type ImportResult, type ImportRow,
} from '../timer/cstimer'
import { EVENTS, eventOf, type EventId } from '../timer/events'
import type { TimerStore } from '../timer/types'

interface CsTimerImportProps {
  store: TimerStore
  onImport: (next: TimerStore) => void
  /** Takes you to the timer, where the solves now are. */
  onOpenTimer: () => void
}

/** "12 Oct 2023 – 1 Sep 2026", or nothing when the export carried no dates. */
function span(session: ImportedSession): string {
  const dated = session.solves.filter((solve) => solve.at > 0)
  if (dated.length === 0) return ''

  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  const first = new Date(dated[0].at).toLocaleDateString(undefined, options)
  const last = new Date(dated[dated.length - 1].at).toLocaleDateString(undefined, options)
  return first === last ? first : `${first} – ${last}`
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Bringing a csTimer history in.
 *
 * The file is read, described and then waited on: every session it holds is
 * listed with its solve count, its dates, the event this app guessed and where
 * the solves are about to go, and nothing is written until you say so. That
 * middle step is the whole point — csTimer only records which *scrambler* a
 * session used, so the event is a guess, and a guess you can see and correct
 * beats one you find out about later when your 4x4 times are in the 3x3 chart.
 *
 * The file itself is treated as hostile throughout; `../data/limits` says what
 * that means and why.
 */
export default function CsTimerImport({ store, onImport, onOpenTimer }: CsTimerImportProps) {
  const picker = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<CsTimerFile | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [dragging, setDragging] = useState(false)
  /** Whether the last thing that happened here was an undo, to say so. */
  const [undone, setUndone] = useState(false)

  async function read(chosen: File) {
    setError(null)
    setResults(null)
    setUndone(false)

    // The one check worth making before the file is read at all: `size` is free,
    // and decoding a hundred megabytes to discover it isn't an export is not.
    if (tooBig(chosen.size)) {
      setError(`That file is ${describeBytes(chosen.size)}, past the ${describeBytes(MAX_FILE_BYTES)} limit for an export.`)
      setFile(null)
      return
    }

    try {
      const parsed = parseCsTimer(await chosen.text())
      setFile(parsed)
      setRows(parsed.sessions.map((source) => ({
        source,
        // A session already here under this name and count is one this file has
        // been read into before, so it starts unticked rather than doubling.
        include: !looksImported(store, source),
        name: source.name,
        event: source.event,
        destination: NEW_SESSION,
      })))
    } catch (problem) {
      setFile(null)
      setRows([])
      setError((problem as Error).message)
    }
  }

  function edit(key: string, change: Partial<ImportRow>) {
    setRows((current) => current.map((row) => (row.source.key === key ? { ...row, ...change } : row)))
  }

  function clear() {
    setFile(null)
    setRows([])
    setError(null)
  }

  function run() {
    setError(null)
    // The receipt from a previous import goes now rather than when this one
    // succeeds: a green tick above a red refusal reads as though both are true.
    setResults(null)
    try {
      const outcome = applyImport(store, rows)
      onImport(outcome.store)
      setResults(outcome.results)
      setFile(null)
      setRows([])
    } catch (problem) {
      // Nothing has been written at this point: applyImport builds the whole
      // store before it refuses, so a refusal costs you the click and no more.
      setError((problem as Error).message)
    }
  }

  const chosen = rows.filter((row) => row.include)
  const solves = countSolves(rows)
  const added = results?.reduce((total, result) => total + result.added, 0) ?? 0
  const alreadyThere = results?.reduce((total, result) => total + result.skipped, 0) ?? 0

  return (
    <div
      className={dragging ? 'cstimer-import dropping' : 'cstimer-import'}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const dropped = event.dataTransfer.files[0]
        if (dropped) void read(dropped)
      }}
    >
      <div className="actions">
        <button type="button" onClick={() => picker.current?.click()}>
          {file ? 'choose another file' : 'import from csTimer'}
        </button>
        {file && <button type="button" onClick={clear}>cancel</button>}
      </div>

      <input
        ref={picker}
        type="file"
        accept=".txt,.json,text/plain,application/json"
        hidden
        onChange={(event) => {
          const dropped = event.target.files?.[0]
          // Cleared so choosing the same file twice still fires a change event.
          event.target.value = ''
          if (dropped) void read(dropped)
        }}
      />

      {error && <p className="data-error">{error}</p>}

      {results && (
        <div className="cstimer-done">
          <p className="cstimer-done-head">
            ✓ {plural(added, 'solve')} imported
            {alreadyThere > 0 && ` · ${alreadyThere} already there, left alone`}
          </p>
          <ul>
            {results.map((result) => (
              <li key={result.sessionId}>
                <b>{result.name}</b>
                <span>
                  {result.created ? 'new session' : 'added to an existing session'} ·{' '}
                  {plural(result.added, 'solve')}
                  {result.skipped > 0 && ` · ${result.skipped} skipped as duplicates`}
                </span>
              </li>
            ))}
          </ul>

          <div className="cstimer-done-actions">
            {/* The import ends where the solves now are, rather than on a report
                about them. */}
            <button type="button" className="ghost" onClick={onOpenTimer}>
              open the timer
            </button>
            {/* Takes out exactly what this import added, so solves timed since
                are safe — and the store it works on is the live one, not a
                copy from before the import. */}
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onImport(undoImport(store, results))
                setResults(null)
                setUndone(true)
              }}
            >
              undo import
            </button>
          </div>
        </div>
      )}

      {undone && <p className="cstimer-done-head">Import undone. Those solves are gone again.</p>}

      {file && (
        <div className="cstimer-preview">
          <p className="cstimer-summary">
            {plural(file.sessions.length, 'session')} in this file
            {file.skipped > 0 && ` · ${plural(file.skipped, 'record')} unreadable and skipped`}
            {file.trimmed > 0 && ` · ${plural(file.trimmed, 'scramble')} shortened`}
          </p>

          <ul className="cstimer-rows">
            {rows.map((row) => {
              const target = store.sessions.find((session) => session.id === row.destination)
              return (
                <li key={row.source.key}>
                  <div className="cstimer-row-head">
                    <label className="cstimer-pick">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={() => edit(row.source.key, { include: !row.include })}
                      />
                      <span className="cstimer-name">{row.source.name}</span>
                    </label>
                    <span className="cstimer-count">
                      {plural(row.source.solves.length, 'solve')}
                      {looksImported(store, row.source) && <em> · already here</em>}
                    </span>
                    <span className="cstimer-span">{span(row.source)}</span>
                  </div>

                  <div className="cstimer-row-controls">
                    <label>
                      <span>as</span>
                      <select
                        value={row.event}
                        // csTimer's own scrambler name, so a wrong guess is
                        // traceable to what it was guessed from.
                        title={row.source.scrType
                          ? `csTimer scrambler: ${row.source.scrType}`
                          : 'no scrambler recorded — guessed 3x3'}
                        onChange={(event) =>
                          edit(row.source.key, { event: event.target.value as EventId })}
                      >
                        {EVENTS.map((event) => (
                          <option key={event.id} value={event.id}>{event.name}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>into</span>
                      <select
                        value={row.destination}
                        onChange={(event) =>
                          edit(row.source.key, { destination: event.target.value })}
                      >
                        <option value={NEW_SESSION}>a new session</option>
                        {store.sessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.name} ({session.solves.length})
                          </option>
                        ))}
                      </select>
                    </label>

                    {row.destination === NEW_SESSION ? (
                      <label className="cstimer-rename">
                        <span>called</span>
                        <input
                          type="text"
                          value={row.name}
                          maxLength={MAX_NAME}
                          onChange={(event) => edit(row.source.key, { name: event.target.value })}
                        />
                      </label>
                    ) : (
                      <span className="cstimer-note">
                        {target
                          ? `alongside ${plural(target.solves.length, 'solve')} already there; duplicates skipped`
                          : 'that session is gone — these will land in a new one'}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <button type="button" className="cstimer-go" disabled={chosen.length === 0} onClick={run}>
            {chosen.length === 0
              ? 'nothing selected'
              : `import ${plural(solves, 'solve')} into ${plural(chosen.length, 'session')}`}
          </button>

          {chosen.some((row) => eventOf(row.event).split) && (
            <p className="hint">
              Memo splits come across only from multi-phase csTimer sessions; everything else
              imports as a single time.
            </p>
          )}
        </div>
      )}

      <p className="hint">
        In csTimer: the wrench icon → Export → &ldquo;Export to file&rdquo;. Drag and drop the .txt or
        open here.
      </p>
    </div>
  )
}
