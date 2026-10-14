import { useState } from 'react'
import { eventOf, RELAY_CHOICES, RELAY_PRESETS, type EventId } from './events'

interface RelayPickerProps {
  /** The puzzles in this session's relay, in solving order. */
  value: EventId[]
  onChange: (next: EventId[]) => void
}

/**
 * Which puzzles a custom relay holds.
 *
 * Beside the event picker for the same reason the multi-blind count is: it
 * rewrites the scramble on screen. Closed it is one button naming the relay;
 * open it is a row of presets and a toggle per puzzle. The order is always the
 * catalogue's — small cubes first — which is the order relays are solved in.
 */
export default function RelayPicker({ value, onChange }: RelayPickerProps) {
  const [open, setOpen] = useState(false)
  const chosen = new Set(value)

  function toggle(id: EventId) {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // A relay of nothing has no scramble to show; the last one stays.
    if (next.size === 0) return
    onChange(RELAY_CHOICES.filter((item) => next.has(item)))
  }

  const summary = value.map((id) => eventOf(id).short).join(' · ')

  return (
    <div className="relay-picker">
      <button
        type="button"
        className="relay-summary"
        aria-expanded={open}
        title="choose the puzzles in this relay"
        onClick={(click) => {
          // Not left focused: a focused button makes space click it again.
          click.currentTarget.blur()
          setOpen(!open)
        }}
      >
        {summary} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="relay-options">
          <div className="relay-row" role="group" aria-label="presets">
            {RELAY_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="relay-preset"
                onClick={() => onChange(preset.events)}
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="relay-row" role="group" aria-label="puzzles">
            {RELAY_CHOICES.map((id) => (
              <button
                key={id}
                type="button"
                className="relay-chip"
                aria-pressed={chosen.has(id)}
                onClick={() => toggle(id)}
              >
                {eventOf(id).short}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
