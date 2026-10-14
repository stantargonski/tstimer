import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTime } from './format'
import { averageText, type AverageView } from './averageText'
import { trimmedAverage } from './stats'
import { effectiveMs } from './types'
import { downloadText, slug, solvesCsv, stamp } from '../data/backup'

/** The block of text an average makes, in a window you can copy or export it from. */
interface AverageDetailProps extends AverageView {
  decimals: 2 | 3
  onClose: () => void
}

export default function AverageDetail(
  { label, solves, value, trim, decimals, onClose }: AverageDetailProps,
) {
  const box = useRef<HTMLTextAreaElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  const text = useMemo(
    () => averageText(label, solves, decimals, value, trim),
    [label, solves, decimals, value, trim],
  )

  // Already selected on the way in, so the fastest way out of here is Ctrl+C —
  // the same trick the session rename uses to make typing replace the old name.
  useEffect(() => {
    box.current?.focus()
    box.current?.select()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      // `ok` is painted as the default action, so Enter should be it. Safe from
      // inside the text box because that box is readOnly — Enter does nothing
      // there today. A focused button keeps its own Enter, or the only way to
      // reach `copy` by keyboard would be to press it and get `ok` instead.
      if (event.key === 'Enter') {
        const active = document.activeElement
        if (active instanceof HTMLButtonElement && sheet.current?.contains(active)) return
        event.preventDefault()
        onClose()
        return
      }

      // Tab cycles inside the sheet rather than walking off into the page
      // behind it: textarea, ok, export csv, copy, and back round.
      if (event.key === 'Tab') {
        const items = Array.from(
          sheet.current?.querySelectorAll<HTMLElement>('textarea, button') ?? [],
        )
        if (items.length === 0) return

        const at = items.indexOf(document.activeElement as HTMLElement)
        const next = event.shiftKey
          ? (at <= 0 ? items.length - 1 : at - 1)
          : (at === items.length - 1 || at === -1 ? 0 : at + 1)

        event.preventDefault()
        items[next].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(id)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // The text is selected in the box behind this button either way.
      setCopied(false)
    }
  }

  function exportCsv() {
    downloadText(`${slug(label)}-${stamp()}.csv`, solvesCsv(solves), 'text/csv')
  }

  return (
    // Clicking off it closes it; clicking the sheet itself must not, or every
    // attempt to select the text would dismiss the thing holding it.
    <div className="modal-back" onClick={onClose}>
      <div
        className="modal"
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`${label} detail`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">
          {label}
          <b>{formatTime(value ?? trimmedAverage(solves.map(effectiveMs)), decimals)}</b>
        </h2>

        <textarea className="modal-text" ref={box} readOnly value={text} spellCheck={false} />

        <div className="modal-actions">
          <button type="button" onClick={onClose}>ok</button>
          <button type="button" onClick={exportCsv}>export csv</button>
          <button type="button" onClick={() => void copy()}>{copied ? 'copied' : 'copy'}</button>
        </div>
      </div>
    </div>
  )
}
