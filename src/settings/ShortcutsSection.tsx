import { useState } from 'react'
import { KeyCapture, Row } from './controls'
import {
  ACTIONS, assign, DEFAULT_KEYMAP, isDefault, restoreAction,
  type ActionGroup, type ActionId, type Keymap,
} from '../keys/keymap'

interface ShortcutProps {
  keymap: Keymap
  onKeymap: (next: Keymap) => void
}

const KEYWORDS = 'keyboard shortcut hotkey bind key'

/** The switch for all of it, and the way back to stock. */
export function ShortcutGeneral({ keymap, onKeymap }: ShortcutProps) {
  return (
    <>
      <Row
        label="keyboard shortcuts"
        description="Space, Esc, Tab and Enter are kept for the timer and for getting around the page, so they can't be bound. Ctrl and ⌘ count as the same key."
        keywords={KEYWORDS}
      >
        <ToggleKeys keymap={keymap} onKeymap={onKeymap} />
      </Row>
      <Row label="reset all shortcuts" keywords={`${KEYWORDS} defaults`}>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Put every shortcut back to its default key?')) return
              onKeymap({ ...DEFAULT_KEYMAP, enabled: keymap.enabled })
            }}
          >
            reset shortcuts
          </button>
        </div>
      </Row>
    </>
  )
}

function ToggleKeys({ keymap, onKeymap }: ShortcutProps) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={keymap.enabled}
      aria-label="keyboard shortcuts"
      onClick={() => onKeymap({ ...keymap, enabled: !keymap.enabled })}
    >
      <span className="switch-text">{keymap.enabled ? 'on' : 'off'}</span>
    </button>
  )
}

/**
 * One row per action in `group`: its two keys, and a way back to its default.
 *
 * A key taken from another action is said out loud under the row that took it,
 * since that action has just stopped answering to it.
 */
export function ShortcutGroup({ group, keymap, onKeymap }: ShortcutProps & { group: ActionGroup }) {
  const [note, setNote] = useState<{ action: ActionId; from: ActionId } | null>(null)

  function apply(action: ActionId, result: { keymap: Keymap; displaced?: ActionId }) {
    onKeymap(result.keymap)
    setNote(result.displaced ? { action, from: result.displaced } : null)
  }

  const labelOf = (id: ActionId) => ACTIONS.find((action) => action.id === id)?.label ?? id

  return (
    <>
      {ACTIONS.filter((action) => action.group === group).map((action) => (
        <Row
          key={action.id}
          label={action.label}
          description={action.description}
          keywords={`${KEYWORDS} ${group}`}
          below={note?.action === action.id ? (
            <p className="key-note">
              Taken from <b>{labelOf(note.from)}</b>, which no longer has that key.
            </p>
          ) : undefined}
        >
          <div className="key-slots">
            {([0, 1] as const).map((slot) => (
              <KeyCapture
                key={slot}
                combo={keymap.binds[action.id][slot]}
                label={`${action.label}, ${slot === 0 ? 'key' : 'alternate key'}`}
                onChange={(combo) => apply(action.id, assign(keymap, action.id, slot, combo))}
              />
            ))}
            <button
              type="button"
              className="key-default"
              disabled={isDefault(keymap, action.id)}
              title="back to the default key"
              onClick={() => apply(action.id, restoreAction(keymap, action.id))}
            >
              default
            </button>
          </div>
        </Row>
      ))}
    </>
  )
}
