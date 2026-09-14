import { useEffect, useRef, useState } from 'react'
import { downloadText, exportAll, importAll, stamp, type ImportReport } from '../data/backup'
import { describeBytes, MAX_FILE_BYTES, tooBig } from '../data/limits'
import {
  eraseEverything, getImportCopy, getSnapshot, restoreImportCopy, restoreSnapshot, takeImportCopy,
  type ImportCopy, type Snapshot,
} from '../data/snapshot'
import { Row } from './controls'

/**
 * Backup, restore and erase for everything the app has stored.
 *
 * Split into the pieces the data tab lays out in order — backup first, the
 * ways back after it, the one with no way back last — rather than one block
 * that decided its own order.
 */

/** Something kept in IndexedDB, read once when the tab opens. */
function useStored<T>(read: () => Promise<T | null>): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    let live = true
    void read().then((found) => { if (live) setValue(found) })
    return () => { live = false }
  }, [read])
  return value
}

const when = (iso: string) => new Date(iso).toLocaleString()

async function undoLastImport(): Promise<boolean> {
  if (!window.confirm(
    'Put everything back as it was before the last backup import? Anything ' +
    'changed since that import is lost.',
  )) return false
  if (!(await restoreImportCopy())) return false
  // Reloaded for the same reason the import is: half the app's state is
  // already in React, and a page still holding it would write it straight back.
  window.location.reload()
  return true
}

/** Export and import of the one-file backup. */
export function BackupPanel() {
  const picker = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Whether a copy was taken before the import, so there is something to undo. */
  const [undoable, setUndoable] = useState(false)

  async function save() {
    setError(null)
    try {
      downloadText(`rubiks-trainer-${stamp()}.json`, await exportAll())
    } catch (problem) {
      setError((problem as Error).message)
    }
  }

  async function load(file: File) {
    setError(null)
    setReport(null)

    // Refused on the size alone, before a byte of it is read.
    if (tooBig(file.size)) {
      setError(`That file is ${describeBytes(file.size)}, past the ${describeBytes(MAX_FILE_BYTES)} limit for a backup.`)
      return
    }

    // A copy of what is here now, before anything is written over it. A browser
    // that can't keep one still gets its import, just without the undo.
    let copied = true
    try {
      await takeImportCopy()
    } catch {
      copied = false
    }

    try {
      setReport(await importAll(await file.text()))
      setUndoable(copied)
    } catch (problem) {
      setError((problem as Error).message)
    }
  }

  return (
    <>
      <Row
        label="export data"
        description="One file holds pairs, solves, algs, settings and the background picture."
        keywords="backup save download json"
      >
        <div className="actions">
          <button type="button" onClick={() => void save()}>export</button>
        </div>
      </Row>

      <Row
        label="import data"
        description="Replaces what is stored now with a backup file. It can be undone afterwards."
        keywords="backup restore load upload json"
        below={(error || report) && (
          <>
            {error && <p className="data-error">{error}</p>}
            {report && (
              <div className="data-report">
                <ul>
                  {report.results.map((result) => (
                    <li key={result.key} className={`data-${result.outcome}`}>
                      {result.label}: {result.outcome}
                    </li>
                  ))}
                </ul>
                <div className="actions">
                  {report.restored > 0 && (
                    <button type="button" className="primary" onClick={() => window.location.reload()}>
                      reload to use them
                    </button>
                  )}
                  {undoable && (
                    <button
                      type="button"
                      onClick={() => {
                        void undoLastImport().then((ok) => {
                          if (!ok) setError('Nothing was undone.')
                        })
                      }}
                    >
                      undo import
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      >
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              // Asked before the file dialog, not after: the point of no return
              // is choosing a file, and a confirm that appears once it's already
              // open is a confirm nobody reads.
              if (window.confirm('Importing replaces what is stored now. You can undo it afterwards. Continue?')) {
                picker.current?.click()
              }
            }}
          >
            import
          </button>
        </div>
        <input
          ref={picker}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Cleared so choosing the same file twice still fires a change event.
            event.target.value = ''
            if (file) void load(file)
          }}
        />
      </Row>
    </>
  )
}

/** The copy taken automatically the first time this build ran. Absent on a
    fresh install, which simply means there is nothing to offer. */
export function SnapshotRestore() {
  const snapshot = useStored<Snapshot>(getSnapshot)
  const [error, setError] = useState<string | null>(null)
  if (!snapshot) return null

  async function rollBack() {
    if (!window.confirm(
      'This replaces everything stored now with the copy taken before this ' +
      'version first ran. Continue?',
    )) return

    if (await restoreSnapshot()) window.location.reload()
    else setError('That copy could not be written back.')
  }

  return (
    <Row
      label="restore previous version settings"
      description={`If an update broke something. A copy of everything was taken automatically on ${when(snapshot.takenAt)}.`}
      keywords="snapshot rollback update bug"
      below={error && <p className="data-error">{error}</p>}
    >
      <div className="actions">
        <button type="button" onClick={() => void rollBack()}>restore</button>
      </div>
    </Row>
  )
}

/** The copy taken before the last backup import, still offered after the
    reload that import asked for. */
export function ImportUndo() {
  const copy = useStored<ImportCopy>(getImportCopy)
  const [error, setError] = useState<string | null>(null)
  if (!copy) return null

  return (
    <Row
      label="undo last backup import"
      description={`Puts everything back as it was before the backup imported on ${when(copy.takenAt)}.`}
      keywords="revert import backup"
      below={error && <p className="data-error">{error}</p>}
    >
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            void undoLastImport().then((ok) => { if (!ok) setError('Nothing was undone.') })
          }}
        >
          undo import
        </button>
      </div>
    </Row>
  )
}

/**
 * Erasing everything, in two steps, the second of which asks you to type the
 * word. A single confirm is a reflex you can get through without reading;
 * typing is the cheapest thing that cannot be done by accident, and this is
 * the one control here with nothing behind it.
 */
export function DeleteEverything() {
  /** How far through the two-step delete we are: 0 idle, 1 warned, 2 typing. */
  const [step, setStep] = useState(0)
  const [typed, setTyped] = useState('')
  const armed = typed.trim().toLowerCase() === 'delete'

  function cancel() {
    setStep(0)
    setTyped('')
  }

  async function wipe() {
    if (!armed) return
    await eraseEverything()
    // Reloaded rather than cleared in place, for the same reason as a restore.
    window.location.reload()
  }

  return (
    <Row
      label="delete everything"
      description="Erases every solve, session, alg, letter pair and setting in this browser, and the restore copies too. There is no undo. Export a backup first."
      keywords="erase wipe reset clear remove"
      below={step > 0 && (
        <div className="data-danger">
          {step === 1 && (
            <>
              <p className="data-danger-warn">
                This cannot be undone, and it removes the restore copies too.
              </p>
              <div className="actions">
                <button type="button" className="danger" onClick={() => setStep(2)}>
                  I understand, continue
                </button>
                <button type="button" onClick={cancel}>cancel</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="data-danger-warn">
                Type <b>delete</b> to confirm.
              </p>
              <div className="actions">
                <input
                  className="data-danger-field"
                  type="text"
                  value={typed}
                  autoFocus
                  spellCheck={false}
                  aria-label="type delete to confirm"
                  onChange={(change) => setTyped(change.target.value)}
                  onKeyDown={(press) => {
                    if (press.key === 'Enter') void wipe()
                    if (press.key === 'Escape') cancel()
                  }}
                />
                <button type="button" className="danger" disabled={!armed} onClick={() => void wipe()}>
                  erase everything
                </button>
                <button type="button" onClick={cancel}>cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    >
      <div className="actions">
        <button type="button" className="danger" disabled={step > 0} onClick={() => setStep(1)}>
          delete everything
        </button>
      </div>
    </Row>
  )
}
