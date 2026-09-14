import type { Ref } from 'react'
import { EVENTS, type EventId } from './events'

interface EventPickerProps {
  value: EventId
  onChange: (id: EventId) => void
  /** For the shortcut that opens it. */
  selectRef?: Ref<HTMLSelectElement>
}

/**
 * Which puzzle you're timing, sitting directly above the scramble it produces.
 *
 * This lives here rather than in settings because it isn't a preference — it's
 * the single most-changed control on the page, and it belongs next to the thing
 * it changes.
 */
export default function EventPicker({ value, onChange, selectRef }: EventPickerProps) {
  return (
    <label className="event-picker">
      <span className="visually-hidden">event</span>
      <select
        ref={selectRef}
        value={value}
        onChange={(event) => {
          // Handing focus back before the change lands. A focused <select> makes
          // useTimer stand down — it will not read a key aimed at a control you
          // can type into — so leaving it focused costs you the next space press,
          // which is the one you meant to start the solve with.
          event.currentTarget.blur()
          onChange(event.target.value as EventId)
        }}
      >
        {EVENTS.map((event) => (
          <option key={event.id} value={event.id}>{event.name}</option>
        ))}
      </select>
    </label>
  )
}
