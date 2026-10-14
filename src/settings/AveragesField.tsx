import { useState } from 'react'
import {
  AVERAGE_MAX_SIZE, AVERAGE_MIN_SIZE, AVERAGES_MAX, parseSpec, sortSpecs, specLabel,
  type AverageSpec,
} from '../timer/stats'

/**
 * The averages list as chips: × takes one off, and typing `ao50` or `mo3` into
 * the field and pressing Enter puts one on. Kept shortest first, so the rail
 * reads in the order the windows grow.
 */
export default function AveragesField({ value, onChange }: {
  value: AverageSpec[]
  onChange: (next: AverageSpec[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const full = value.length >= AVERAGES_MAX

  function add() {
    if (draft.trim() === '') return
    const spec = parseSpec(draft)
    if (!spec) {
      setProblem(`Type ao or mo and a size from ${AVERAGE_MIN_SIZE} to ${AVERAGE_MAX_SIZE}, like ao50 or mo3.`)
      return
    }
    if (value.some((item) => item.kind === spec.kind && item.size === spec.size)) {
      setProblem(`${specLabel(spec)} is already on the list.`)
      return
    }
    onChange(sortSpecs([...value, spec]))
    setDraft('')
    setProblem(null)
  }

  return (
    <div className="avg-field">
      <div className="avg-chips">
        {value.map((spec) => (
          <span className="avg-chip" key={specLabel(spec)}>
            {specLabel(spec)}
            <button
              type="button"
              aria-label={`remove ${specLabel(spec)}`}
              onClick={() => onChange(value.filter((item) => item !== spec))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="avg-input"
          type="text"
          value={draft}
          disabled={full}
          placeholder={full ? `${AVERAGES_MAX} at most` : 'ao50, mo3…'}
          aria-label="add an average"
          spellCheck={false}
          autoComplete="off"
          onChange={(change) => {
            setDraft(change.target.value)
            setProblem(null)
          }}
          onKeyDown={(press) => {
            if (press.key === 'Enter') {
              press.preventDefault()
              add()
            }
          }}
        />
      </div>
      {problem && <p className="data-error">{problem}</p>}
    </div>
  )
}
