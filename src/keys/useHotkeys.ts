import { useEffect, useRef } from 'react'
import { actionFor, type ActionId, type Keymap } from './keymap'

/**
 * What each action does here. A handler that returns `false` is declining the
 * key — nothing to act on right now — and the press is left to the browser, so
 * ⌘C with text selected still copies the selection.
 */
export type Handlers = Partial<Record<ActionId, () => void | false>>

/**
 * Runs `handlers` when their keys are pressed.
 *
 * On `window` rather than `document`, and that is load-bearing: in the bubble
 * phase document listeners run first, so the timer, the average sheet and the
 * colour picker all see a key before this does. Anything they claimed they
 * marked with preventDefault, and this skips it — which is what stops the key
 * that ends a solve from also being a shortcut.
 */
export function useHotkeys(keymap: Keymap, handlers: Handlers, enabled: boolean) {
  const latest = useRef({ keymap, handlers })

  // Refreshed every render, so the listener below binds once and still calls
  // handlers that close over this render's state.
  useEffect(() => {
    latest.current = { keymap, handlers }
  })

  useEffect(() => {
    if (!enabled) return

    function onKeyDown(press: KeyboardEvent) {
      if (press.defaultPrevented || press.repeat || press.isComposing) return
      if (typingInto(press.target)) return

      const { keymap, handlers } = latest.current
      const action = actionFor(keymap, press)
      const run = action ? handlers[action] : undefined
      if (!run || run() === false) return
      press.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/**
 * Whether a key is aimed at something you can type into.
 *
 * `data-hotkeys="through"` opts a field back in: the typed-entry clock is an
 * input, and claims only the keys it uses by preventing them.
 */
function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const field = target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  return field !== null && field.getAttribute('data-hotkeys') !== 'through'
}
