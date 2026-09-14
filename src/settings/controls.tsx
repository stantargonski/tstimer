import { createContext, useContext, useState, type ReactNode } from 'react'
import { matches, SearchContext } from './search'
import { codeLabel, codeOf, comboFrom, comboLabel, isModifier, type KeyCombo } from '../keys/keymap'

/**
 * The building blocks every settings tab is made of.
 *
 * Out of SettingsPage so the data tab's pieces can use the same rows — and so
 * a row anywhere on the page answers to the same search box.
 */

/** The label of the row a control sits in, so the control can name itself to
    a screen reader without every call site repeating it. */
const RowLabel = createContext<string | undefined>(undefined)

/**
 * One row: what the setting is on the left, the control on the right.
 *
 * The description isn't decoration — most of these settings are only obvious
 * once you know what they change, and a page of bare labels makes you toggle
 * things to find out.
 *
 * `keywords` are extra words the search should find it by, for settings whose
 * label isn't the word people look for. `below` is anything that needs the
 * full width under the row, like a confirmation.
 */
export function Row({ label, description, keywords, below, children }: {
  label: string
  description?: string
  keywords?: string
  below?: ReactNode
  children: ReactNode
}) {
  const query = useContext(SearchContext)
  if (!matches(query, [label, description, keywords])) return null

  return (
    <div className="setting-row">
      <div className="setting-label">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <div className="setting-control">
        <RowLabel.Provider value={label}>{children}</RowLabel.Provider>
      </div>
      {below && <div className="setting-below">{below}</div>}
    </div>
  )
}

/**
 * A block that isn't a row — the palette editor, the csTimer importer — but
 * still has to be findable. Hidden when the search doesn't match it.
 */
export function Searchable({ label, keywords, children }: {
  label: string
  keywords?: string
  children: ReactNode
}) {
  const query = useContext(SearchContext)
  if (!matches(query, [label, keywords])) return null
  return <div className="setting-block">{children}</div>
}

/** Segmented buttons: the options are all visible, so choosing is one click
    and comparing is none. */
export function Choice<T extends string>({ options, value, onChange }: {
  options: { id: T; name: string }[]
  value: T
  onChange: (id: T) => void
}) {
  const label = useContext(RowLabel)
  return (
    <div className="choice" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.name}
        </button>
      ))}
    </div>
  )
}

/**
 * A dropdown, for a choice whose options are long enough that a row of
 * segments would wrap — or are formats, which read better as a list.
 */
export function Select<T extends string>({ options, value, onChange }: {
  options: { id: T; name: string }[]
  value: T
  onChange: (id: T) => void
}) {
  const label = useContext(RowLabel)
  return (
    <select
      className="setting-select"
      value={value}
      aria-label={label}
      onChange={(change) => onChange(change.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  )
}

/**
 * A switch: one control that says where the setting stands and flips it.
 *
 * It was once two buttons, on and off, with the current one lit. That is the
 * right shape for a choice between things — which is what `Choice` is for —
 * but a boolean has no second option worth drawing.
 */
export function Toggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  const label = useContext(RowLabel)
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
    >
      <span className="switch-text">{value ? 'on' : 'off'}</span>
    </button>
  )
}

/**
 * One key of a shortcut: shows what it is, and records a new one when pressed.
 *
 * The press it records is prevented and stopped where it lands, so the page's
 * own shortcuts — which skip anything already prevented — never fire on the
 * key you are trying to bind. Escape or clicking away gives up; the × beside
 * it clears the key.
 */
export function KeyCapture({ combo, label, onChange }: {
  combo: KeyCombo | null
  /** Spoken name of this slot, e.g. "comp sim, alternate key". */
  label: string
  onChange: (next: KeyCombo | null) => void
}) {
  const [recording, setRecording] = useState(false)
  /** Why the last key pressed while recording was turned down. */
  const [refused, setRefused] = useState<string | null>(null)

  function stop() {
    setRecording(false)
    setRefused(null)
  }

  const current = combo ? comboLabel(combo) : '—'
  const cleared = !combo || recording

  return (
    <span className="key-slot">
      <button
        type="button"
        className={recording ? 'key-capture recording' : 'key-capture'}
        aria-label={`${label}: ${recording ? 'press a key, or Escape to cancel' : combo ? current : 'none'}`}
        onClick={() => (recording ? stop() : setRecording(true))}
        onBlur={stop}
        onKeyDown={(press) => {
          const code = codeOf(press)
          // Tab is left alone so the keyboard can still leave; leaving gives up.
          if (!recording || code === 'Tab') return
          press.preventDefault()
          press.stopPropagation()
          if (press.repeat || !code || isModifier(code)) return
          if (code === 'Escape') { stop(); return }

          const next = comboFrom(press)
          if (!next) { setRefused(`${codeLabel(code)} is reserved`); return }
          stop()
          onChange(next)
        }}
        // A focused button clicks itself when space is let go, which would
        // start a fresh recording straight after refusing the key.
        onKeyUp={(press) => { if (recording && codeOf(press) === 'Space') press.preventDefault() }}
      >
        {recording ? (refused ?? 'press a key…') : current}
      </button>
      {/* Always laid out, only sometimes shown, so the key chips line up down
          the page whether or not each one has a key in it. */}
      <button
        type="button"
        className="key-clear"
        aria-label={`clear ${label}`}
        title="clear"
        disabled={cleared}
        style={{ visibility: cleared ? 'hidden' : 'visible' }}
        onClick={() => onChange(null)}
      >
        ×
      </button>
    </span>
  )
}

/**
 * A number you nudge or type, in place of a slider.
 *
 * A slider is the wrong control for every setting on this page: they all have a
 * value worth knowing exactly, and none of them wants to be dragged past
 * fourteen wrong values on the way to the right one.
 *
 * The field holds its own text while you are in it, and only clamps once you
 * leave or press enter. Clamping per keystroke made the field impossible to
 * type in: backspacing 100 to 10 snapped it straight back to the minimum.
 */
export function Stepper({ value, min, max, step, format, onChange }: {
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  const label = useContext(RowLabel)
  /** What is being typed, or null when the field is just showing `value`. */
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  // Steps land on multiples of `step` even if the stored value isn't one.
  const nudge = (direction: number) => {
    setDraft(null)
    onChange(clamp(Math.round((value + direction * step) / step) * step))
  }

  /** Takes what was typed, or puts the field back if it wasn't a number. */
  function commit() {
    if (draft !== null) {
      const parsed = Number.parseFloat(draft.replace(/[^\d.-]/g, ''))
      if (Number.isFinite(parsed)) onChange(clamp(Math.round(parsed)))
    }
    setDraft(null)
  }

  return (
    <div className="stepper">
      <button type="button" onClick={() => nudge(-1)} disabled={value <= min} aria-label={`${label ?? ''} less`.trim()}>−</button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={draft ?? format(value)}
        onChange={(change) => setDraft(change.target.value)}
        onBlur={commit}
        onKeyDown={(press) => {
          if (press.key === 'Enter') { press.preventDefault(); commit() }
          // Abandons the edit rather than committing it.
          if (press.key === 'Escape') { press.preventDefault(); setDraft(null) }
        }}
      />
      <button type="button" onClick={() => nudge(1)} disabled={value >= max} aria-label={`${label ?? ''} more`.trim()}>+</button>
    </div>
  )
}
