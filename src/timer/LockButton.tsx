import type { PointerEvent } from 'react'

interface LockButtonProps {
  locked: boolean
  /** What is being locked, for the tooltip and a screen reader. */
  name: string
  onToggle: () => void
  className?: string
}

/**
 * The padlock on a floating box: pins it where it is, or frees it again.
 *
 * Drawn rather than an emoji, so it takes the text colour like the ⧉ and ⟲
 * beside it instead of arriving in yellow.
 */
export default function LockButton({ locked, name, onToggle, className }: LockButtonProps) {
  return (
    <button
      type="button"
      className={`panel-lock${locked ? ' on' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={locked}
      aria-label={locked ? `unlock the ${name}` : `lock the ${name} in place`}
      title={locked ? 'unlock' : 'lock in place'}
      // Most boxes are held by the bar this sits in, and a press that starts a
      // click here must not also start a drag there.
      onPointerDown={(down: PointerEvent<HTMLButtonElement>) => down.stopPropagation()}
      onClick={onToggle}
    >
      <svg viewBox="0 0 12 14" width="11" height="13" aria-hidden="true">
        {/* The shackle swings open to the left when unlocked. */}
        <path
          d={locked ? 'M3.5 6.5V4.5a2.5 2.5 0 0 1 5 0v2' : 'M3.5 6.5V4.5a2.5 2.5 0 0 1 5 0'}
          transform={locked ? undefined : 'translate(-2.5 -1)'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <rect x="1.5" y="6.5" width="9" height="6.5" rx="1.5" fill="currentColor" />
      </svg>
    </button>
  )
}
