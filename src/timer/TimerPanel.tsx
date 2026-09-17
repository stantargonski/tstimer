import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTimer } from './useTimer'
import { useHotkeys } from '../keys/useHotkeys'
import { keyHint, withHint, type Keymap } from '../keys/keymap'
import { popDeleted, pushDeleted } from './undo'
import { clockPhase, clockText, isInspecting } from './display'
import { digitsFace, formatTime, maxEntryDigits, parseDigits } from './format'
import { eventOf, type EventId, type WcaEvent } from './events'
import { prepare, scrambleFor, scrambleText, type Scramble } from './scramble'
import EventPicker from './EventPicker'
import MbldCount from './MbldCount'
import MbldPrompt from './MbldPrompt'
import ScrambleBanner from './ScrambleBanner'
import ScramblePreview from './ScramblePreview'
import SessionGraph from './SessionGraph'
import SessionPicker from './SessionPicker'
import SolveList from './SolveList'
import StatsPanel from './StatsPanel'
import CompBar from './CompBar'
import AverageDetail from './AverageDetail'
import type { AverageView } from './averageText'
import FloatingBox from './FloatingBox'
import DragHandle from './DragHandle'
import {
  FIT_GAP, STACK_GAP, boxOf, clearOf, fitPanel, floatAt, rectOf,
  type FrameBox, type PanelBox, type Rect,
} from './panelFit'
import type { SnapGuides, SnapOptions } from './panelSnap'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import {
  DEFAULT_TIMER_SETTINGS, FLOAT_MAX_HEIGHT, LIST_FLOAT, RAIL_MAX, RAIL_MIN,
  RAIL_SPLIT_MIN, SCRAMBLE_FLOAT_MAX_WIDTH, SCRAMBLE_FLOAT_MIN_HEIGHT, SCRAMBLE_FLOAT_MIN_WIDTH,
  SCRAMBLE_FLOAT_WIDTH, STATS_FLOAT, type PanelId, type TimerSettings,
} from './settings'
import { average, meanExec, meanMemo } from './stats'
import { formatOf, resultOf, suggestTarget } from './comp'
import { downloadText, sessionCsv, slug, stamp } from '../data/backup'
import {
  activeSession, effectiveMs, emptyTimerStore, mbldIsDnf, newSession, newSolve,
  type MbldResult, type Penalty, type Session, type TimerStore,
} from './types'

/** Where a comp round started, and what it started in. */
interface Round {
  sessionId: string
  event: EventId
  start: number
}

interface TimerPanelProps {
  store: TimerStore
  setStore: Dispatch<SetStateAction<TimerStore>>
  settings: TimerSettings
  onSettings: (next: TimerSettings) => void
  /** Told whenever a solve is under way and the interface is meant to recede.
      The top bar is not inside this component, or even inside the element this
      component styles, so no stylesheet here can reach it — the app has to be
      the one to put it away. */
  onSolving?: (solving: boolean) => void
  keymap: Keymap
  /** Told whenever a key press belongs to the timer rather than to a shortcut:
      mid-solve, inspecting, or with a sheet open. */
  onBusy?: (busy: boolean) => void
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
}

/** Whether there is text selected that ⌘C should copy instead of the scramble. */
function hasSelection(): boolean {
  const active = document.activeElement
  if (
    (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
    active.selectionStart !== active.selectionEnd
  ) return true
  return (window.getSelection()?.toString() ?? '') !== ''
}

/**
 * Pops a dropdown open, or declines the key if it isn't on screen.
 *
 * Not focused first: a focused select makes useTimer stand down, and the popup
 * closing without a change would leave it that way, costing the next space
 * press. Focus is only the fallback where showPicker isn't supported.
 */
function openPicker(select: HTMLSelectElement | null): false | void {
  if (!select) return false
  try {
    select.showPicker()
  } catch {
    select.focus()
  }
}

export default function TimerPanel({
  store, setStore, settings, onSettings, onSolving, keymap, onBusy,
}: TimerPanelProps) {

  // A comp round is a slice of the session's own solves rather than a mode of
  // its own: nothing about timing changes, so nothing about a solve needs to
  // record that it happened during one.
  //
  // It remembers which session and event it belongs to so that leaving either
  // one retires it on the spot — a half-finished average shouldn't follow you
  // to another session, and checking that here is a derivation rather than an
  // effect racing the render that caused it.
  const [round, setRound] = useState<Round | null>(null)
  const [compTarget, setCompTarget] = useState('')
  /** The average whose solves are open for reading, or null. */
  const [detail, setDetail] = useState<AverageView | null>(null)
  /** Digits typed so far in the manual-entry mode, newest last. */
  const [entry, setEntry] = useState('')
  /** A finished multi-blind attempt waiting on its cube count. */
  const [pendingMbld, setPendingMbld] = useState<
    { ms: number; memoMs: number | null; penalty: Penalty } | null
  >(null)
  /** A word on what a shortcut just did, when nothing else on screen says so.
      `at` tells two identical messages apart, so the second still shows. */
  const [flash, setFlash] = useState<{ text: string; at: number } | null>(null)
  const eventSelect = useRef<HTMLSelectElement>(null)
  const sessionSelect = useRef<HTMLSelectElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const clockRef = useRef<HTMLDivElement>(null)
  const underRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const railStatsRef = useRef<HTMLDivElement>(null)
  /** What the sidebar drag in progress started from: a width, or a height. */
  const dragFrom = useRef(0)
  /** Whether the clock is running, for the observer below — which is not a
      render, and so can't read `timing` itself. */
  const timingRef = useRef(false)
  /**
   * The frame's size, how much of it the rail takes on the left, and how far
   * down the scramble bar reaches.
   *
   * Measured rather than read off the stylesheet: the rail's 300px is only a
   * starting point, and its buttons and the text size both push it wider. It is
   * 0 when the rail is stowed, when nothing is docked in it, and when the
   * narrow-window rule hides it.
   */
  const [measured, setMeasured] = useState<FrameBox>({ width: 0, height: 0, left: 0, top: 0 })
  /** How tall the rail is while it ends under the stats; null until measured. */
  const [railHeight, setRailHeight] = useState<number | null>(null)
  /** The clock, its delta and the lines under it, in frame coordinates — what
      the graph is never stacked onto to clear the preview. */
  const [keepOut, setKeepOut] = useState<Rect | null>(null)
  /** The lines a held panel has snapped to, drawn across the frame. */
  const [guides, setGuides] = useState<SnapGuides | null>(null)
  /** How tall the floating stats box is with none of it scrolled away. */
  const [statsNatural, setStatsNatural] = useState<number | null>(null)
  /** Likewise the floating scramble, which is always as tall as it needs. */
  const [scrambleNatural, setScrambleNatural] = useState<number | null>(null)

  // A resize observer rather than the window's resize event, because stowing the
  // rail changes the room without the window changing at all. It only fires on a
  // change of size, so a running clock costs it next to nothing.
  useEffect(() => {
    const outer = frameRef.current
    const main = mainRef.current
    const head = headRef.current
    const clock = clockRef.current
    const under = underRef.current
    if (!outer || !main || !head || !clock || !under) return
    const observer = new ResizeObserver(() => {
      const width = outer.clientWidth
      const height = outer.clientHeight
      // The centre column runs to the frame's right edge, so whatever it
      // doesn't cover is the rail.
      const left = width - main.offsetWidth
      const top = head.offsetHeight
      setMeasured((prev) => (
        prev.width === width && prev.height === height && prev.left === left && prev.top === top
          ? prev
          : { width, height, left, top }
      ))

      // Held still while the clock runs. The averages leave with the first tick
      // and come back with the last, and a panel that grew into the gap between
      // them would be seen doing it as the interface fades back in.
      if (timingRef.current) return
      const base = outer.getBoundingClientRect()
      const parts = [...outer.querySelectorAll('.clock, .clock-delta, .clock-under')]
        .map((part) => part.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
      const next = parts.length === 0 ? null : {
        left: Math.round(Math.min(...parts.map((rect) => rect.left)) - base.left),
        top: Math.round(Math.min(...parts.map((rect) => rect.top)) - base.top),
        right: Math.round(Math.max(...parts.map((rect) => rect.right)) - base.left),
        bottom: Math.round(Math.max(...parts.map((rect) => rect.bottom)) - base.top),
      }
      setKeepOut((prev) => (sameRect(prev, next) ? prev : next))
    })
    for (const element of [outer, main, head, clock, under]) observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(id)
  }, [flash])

  // Derived every render — never mirrored into state of its own.
  const session = activeSession(store)
  const solves = session.solves
  const event = eventOf(session.event)

  // A picture of the scramble is the one thing a blindfolded solve is not
  // allowed to look at, so for those events it starts every scramble closed.
  // `showCubeNet` is left alone, so switching back to 3x3 brings the preview
  // straight back without anyone touching a setting.
  const bldClosed = event.split && settings.hideBldPreview

  const options = { mbldCount: settings.mbldCount }
  const [scrambles, setScrambles] = useState<Scramble[]>(() => [scrambleFor(event, options)])
  const [index, setIndex] = useState(0)
  /**
   * The one scramble the preview was opened for in a blindfolded event.
   *
   * Compared by identity against the scramble on screen, so moving to any other
   * scramble — a solve, next, last, a new event — closes it without anything
   * having to remember to. A preview left open from the last attempt is exactly
   * the peek the setting is there to prevent.
   */
  const [peekFor, setPeekFor] = useState<Scramble | null>(null)
  /** The event the queue in `scrambles` was built for. */
  const [builtFor, setBuiltFor] = useState(session.event)

  // The session owns the event, so switching sessions switches the puzzle out
  // from under the queue — and a 4x4 scramble left over from the last session is
  // not a scramble, it is a wrong answer. Rebuilt during the render that noticed
  // rather than from an effect a frame later, which would paint the old puzzle's
  // scramble first. This is also the only path the event picker needs: it writes
  // the session's event and the queue follows.
  if (builtFor !== session.event) {
    setBuiltFor(session.event)
    setScrambles([scrambleFor(event, options)])
    setIndex(0)
  }

  const scramble = scrambles[index]
  const previewShown = bldClosed ? peekFor === scramble : settings.showCubeNet

  // The 2x2 needs a table built before it can give real random-state scrambles.
  // Asking as soon as the event is picked means it is nearly always ready by
  // the time the first solve ends.
  useEffect(() => { prepare(event) }, [event])

  /** Every change to the current session goes through here, so the nested
      spread is written once instead of six times. */
  function updateActive(change: (session: Session) => Session) {
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((item) => (item.id === prev.activeId ? change(item) : item)),
    }))
  }

  function setPenalty(id: number, penalty: Penalty) {
    updateActive((item) => ({
      ...item,
      solves: item.solves.map((solve) => (solve.id === id ? { ...solve, penalty } : solve)),
    }))
  }

  /** Kept for the undo key on its way out, whether the list or a key deleted it. */
  function deleteSolve(id: number) {
    const index = solves.findIndex((solve) => solve.id === id)
    if (index === -1) return
    pushDeleted({ sessionId: session.id, index, solve: solves[index] })
    updateActive((item) => ({
      ...item,
      solves: item.solves.filter((solve) => solve.id !== id),
    }))
  }

  function setEvent(id: EventId) {
    // The queue is not touched here: writing the session's event is what starts
    // it over, above, and that is the same path a session switch takes. Which
    // also means the choice is remembered — it is stored on the session.
    updateActive((item) => ({ ...item, event: id }))
  }

  /** Throws away the queue and starts a fresh one for `next`. */
  function restart(next: WcaEvent, mbldCount = settings.mbldCount) {
    setScrambles([scrambleFor(next, { mbldCount })])
    setIndex(0)
  }

  function setMbldCount(mbldCount: number) {
    onSettings({ ...settings, mbldCount })
    // A queued five-cube scramble is the wrong scramble the moment you ask for
    // eight, so the queue goes with the setting.
    restart(event, mbldCount)
  }

  function createSession() {
    const created = newSession(`Session ${store.sessions.length + 1}`, session.event)
    setStore((prev) => ({
      ...prev,
      sessions: [...prev.sessions, created],
      activeId: created.id,
    }))
  }

  function deleteSession() {
    const count = solves.length
    if (count > 0 && !window.confirm(`Delete "${session.name}" and its ${count} solves?`)) return

    setStore((prev) => {
      const remaining = prev.sessions.filter((item) => item.id !== prev.activeId)
      // Never leave the store with nothing to render.
      if (remaining.length === 0) return emptyTimerStore()
      return { ...prev, sessions: remaining, activeId: remaining[0].id }
    })
  }

  const format = formatOf(event)
  const openRound =
    round && round.sessionId === session.id && round.event === session.event ? round : null
  const roundTimes = openRound ? solves.slice(openRound.start).map(effectiveMs) : []
  // What you're averaging now, as the basis for a goal slightly under it.
  const recent = resultOf(format, solves.slice(-format.size).map(effectiveMs))

  function startRound() {
    setRound({ sessionId: session.id, event: session.event, start: solves.length })
  }

  function exportSession() {
    downloadText(`${slug(session.name)}-${stamp()}.csv`, sessionCsv(session), 'text/csv')
  }

  function goNext() {
    if (index + 1 < scrambles.length) {
      setIndex(index + 1)
      return
    }
    setScrambles([...scrambles, scrambleFor(event, options)])
    setIndex(scrambles.length)
  }

  /** Records a finished solve against the current scramble and moves on. */
  function record(
    finished: number,
    memo: number | null,
    penalty: Penalty,
    mbld?: MbldResult,
  ) {
    const solve = newSolve(finished, memo, scrambleText(scramble), session.event, penalty, mbld)
    updateActive((item) => ({ ...item, solves: [...item.solves, solve] }))
    goNext()
  }

  const typedEntry = settings.entryMode === 'typed'

  const { phase, ms, inspectMs } = useTimer(
    (finished, memo, penalty) => {
      // Multi-blind is the one event the clock can't finish on its own: how many
      // cubes came out solved decides both the score and whether the attempt
      // counted at all. Held here until that's answered.
      if (event.scramble.kind === 'mbf') {
        setPendingMbld({ ms: finished, memoMs: memo, penalty })
        return
      }
      record(finished, memo, penalty)
    },
    {
      holdMs: settings.holdMs,
      split: event.split,
      inspection: settings.inspection && event.inspection,
      // Typing a time means there is no clock on screen; leaving the space bar
      // armed would start one anyway, invisibly, and hide the interface for it.
      enabled: !typedEntry,
    },
  )

  const timing = phase === 'running' || phase === 'memo'

  // A layout effect, so it is set before the observer sees the averages go:
  // that happens in the same frame the clock starts.
  useLayoutEffect(() => {
    timingRef.current = timing
  }, [timing])
  // Inspection counts as solving for this purpose, and it is the same fifteen
  // seconds either way: you are looking at the cube, and the scramble you are
  // no longer allowed to consult is the last thing that should still be up.
  // Which means the interface goes at the start of inspection and comes back
  // when the solve ends, rather than blinking away between the two.
  const solving = (timing || isInspecting(phase, inspectMs)) && settings.hideUiWhileRunning

  // Reported rather than read, so the class this drives can go on the app's own
  // root. The cleanup matters as much as the call: leaving the timer mid-solve
  // must not leave the bar hidden with nothing left on screen to bring it back.
  useEffect(() => {
    onSolving?.(solving)
    return () => onSolving?.(false)
  }, [solving, onSolving])

  // Anything but idle means the keyboard is the clock's: inspecting, holding,
  // or mid-solve, where any key at all stops it. A sheet open over the timer
  // has its own keys as well.
  const busy = phase !== 'idle' || detail !== null || pendingMbld !== null

  useEffect(() => {
    onBusy?.(busy)
    return () => onBusy?.(false)
  }, [busy, onBusy])

  function say(text: string) {
    setFlash((prev) => ({ text, at: (prev?.at ?? 0) + 1 }))
  }

  function deleteLast() {
    const last = solves[solves.length - 1]
    if (!last) { say('no solves to delete'); return }
    deleteSolve(last.id)
    const undo = keyHint(keymap, 'undoDelete')
    say(undo ? `solve deleted — ${undo} to undo` : 'solve deleted')
  }

  /** Puts the last deleted solve back where it was, in whichever session it
      came from. */
  function undoDelete() {
    const last = popDeleted()
    if (!last) { say('nothing to undo'); return }

    const home = store.sessions.find((item) => item.id === last.sessionId)
    if (!home) { say('that solve’s session is gone'); return }

    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((item) => {
        // Checked in here as well, so a solve can never be put back twice.
        if (item.id !== last.sessionId) return item
        if (item.solves.some((solve) => solve.id === last.solve.id)) return item
        const next = [...item.solves]
        next.splice(Math.min(last.index, next.length), 0, last.solve)
        return { ...item, solves: next }
      }),
    }))
    say(home.id === session.id ? 'solve restored' : `solve restored to ${home.name}`)
  }

  function penaltyOnLast(pick: (current: Penalty) => Penalty) {
    const last = solves[solves.length - 1]
    if (!last) { say('no solves yet'); return }
    const penalty = pick(last.penalty)
    setPenalty(last.id, penalty)
    say(penalty === 'plus2' ? '+2' : penalty === 'dnf' ? 'DNF' : 'no penalty')
  }

  function copyScramble(): false | void {
    if (hasSelection()) return false
    navigator.clipboard.writeText(scrambleText(scramble)).then(
      () => say('scramble copied'),
      () => say('could not copy the scramble'),
    )
  }

  function toggleInspection() {
    const inspection = !settings.inspection
    onSettings({ ...settings, inspection })
    say(inspection && !event.inspection
      ? `inspection on — ${event.name} doesn’t use it`
      : `inspection ${inspection ? 'on' : 'off'}`)
  }

  // What is in the sidebar and what floats. A part that is switched off is in
  // neither, and the sidebar stands only while something is still docked in it.
  const statsDocked = settings.showStats && !settings.statsFloating
  const listDocked = settings.showSolveList && !settings.listFloating
  const statsFloat = settings.showStats && settings.statsFloating
  const listFloat = settings.showSolveList && settings.listFloating
  const anyDocked = statsDocked || listDocked
  const scrambleDocked = settings.showScramble && !settings.scrambleFloating
  const scrambleFloat = settings.showScramble && settings.scrambleFloating
  const railShown = anyDocked && !settings.railStowed
  /**
   * The stats alone, with the list floating. There is no list for them to
   * head, so rather than a block of stats over a column of empty sidebar they
   * sit beside the scramble bar — the two one band, as tall as the taller.
   * With the scramble floating too there is no bar to sit beside, and a band of
   * stats alone across the top would only push everything else down, so they
   * keep the sidebar.
   */
  const statsBand = statsDocked && listFloat && scrambleDocked
  const railColumn = railShown && !statsBand
  const bandShown = railShown && statsBand
  /** Where the session picker and the tools live: with the solve list, wherever
      it is — or with the stats, when the list is switched off. */
  const toolsIn: 'rail' | 'list' | 'stats' = settings.showSolveList
    ? (listFloat ? 'list' : 'rail')
    : (statsFloat ? 'stats' : 'rail')

  /**
   * The measured frame, with no rail in it whenever the settings say there is
   * none. Whether the rail is there is known now; only its width has to wait for
   * the observer. Without this, floating the last part out of the sidebar drew
   * one frame with every box still kept clear of a rail that had already gone.
   */
  const railShort = railColumn && !listDocked
  const frame: FrameBox = railColumn
    ? { ...measured, railBottom: railShort ? railHeight ?? measured.height : measured.height }
    : { ...measured, left: 0 }

  // The rail comes and goes with what is docked, so it gets an observer of its
  // own rather than a place in the frame's, which is set up once.
  useEffect(() => {
    const rail = railRef.current
    if (!railShort || !rail) return
    const observer = new ResizeObserver(() => setRailHeight(rail.offsetHeight))
    observer.observe(rail)
    return () => observer.disconnect()
  }, [railShort])

  // The three rail switches, shared by their buttons and their keys.
  function toggleComp() {
    if (openRound) setRound(null)
    else startRound()
  }

  /** In a blindfolded event this opens the preview for the scramble on screen
      only, and never touches the setting — the next scramble starts closed. */
  function togglePreview() {
    if (bldClosed) setPeekFor(previewShown ? null : scramble)
    else onSettings({ ...settings, showCubeNet: !settings.showCubeNet })
  }

  function toggleGraph() {
    onSettings({ ...settings, showGraph: !settings.showGraph })
  }

  /** The solve list into a box of its own, or back into the sidebar — which
      comes out of hiding to take it, or the list would dock into nothing. */
  function toggleListFloat(): false | void {
    if (!settings.showSolveList) return false
    const listFloating = !settings.listFloating
    onSettings({ ...settings, listFloating, railStowed: listFloating && settings.railStowed })
    say(listFloating ? 'solve list floating' : 'solve list back in the sidebar')
  }

  function toggleStatsFloat(): false | void {
    if (!settings.showStats) return false
    const statsFloating = !settings.statsFloating
    onSettings({ ...settings, statsFloating, railStowed: statsFloating && settings.railStowed })
    say(statsFloating ? 'stats floating' : 'stats back in the sidebar')
  }

  /** The scramble into a box of its own, or back across the top. */
  function toggleScrambleFloat(): false | void {
    if (!settings.showScramble) return false
    const scrambleFloating = !settings.scrambleFloating
    onSettings({ ...settings, scrambleFloating })
    say(scrambleFloating ? 'scramble floating' : 'scramble back across the top')
  }

  const isLocked = (id: PanelId) => settings.lockedPanels.includes(id)

  function toggleLock(id: PanelId) {
    const lockedPanels = isLocked(id)
      ? settings.lockedPanels.filter((item) => item !== id)
      : [...settings.lockedPanels, id]
    onSettings({ ...settings, lockedPanels })
  }

  function setRailWidth(width: number) {
    const railWidth = Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, width)))
    if (railWidth !== settings.railWidth) onSettings({ ...settings, railWidth })
  }

  /** The stats' share of the sidebar, never so much that the list has no room. */
  function setRailSplit(height: number) {
    const room = (railRef.current?.clientHeight ?? 0) - 160
    const railSplit = Math.round(Math.max(RAIL_SPLIT_MIN, Math.min(room, height)))
    if (railSplit !== settings.railSplit) onSettings({ ...settings, railSplit })
  }

  useHotkeys(keymap, {
    deleteLast,
    undoDelete,
    plus2: () => penaltyOnLast((current) => (current === 'plus2' ? 'none' : 'plus2')),
    dnf: () => penaltyOnLast((current) => (current === 'dnf' ? 'none' : 'dnf')),
    clearPenalty: () => penaltyOnLast(() => 'none'),
    prevScramble: () => {
      if (index === 0) return false
      setIndex(index - 1)
    },
    nextScramble: goNext,
    copyScramble,
    openEvent: () => openPicker(eventSelect.current),
    openSession: () => openPicker(sessionSelect.current),
    toggleInspection,
    toggleRail: () => {
      // No rail to stow when nothing is docked in it.
      if (!anyDocked) return false
      onSettings({ ...settings, railStowed: !settings.railStowed })
    },
    // The row above the scramble, not the bar: the scramble is the one part of
    // it a solve can't do without.
    toggleScramble: () => {
      if (!settings.showScramble) return false
      onSettings({ ...settings, showScrambleHead: !settings.showScrambleHead })
    },
    toggleComp,
    togglePreview,
    toggleGraph,
    toggleListFloat,
    toggleStatsFloat,
    toggleScrambleFloat,
  }, keymap.enabled && !busy)

  /**
   * Commits what has been typed, if it amounts to a time.
   *
   * Zero is rejected along with an empty field: it is what you get from pressing
   * enter twice, and a 0.00 solve in the history is worse than nothing happening.
   */
  function commitTyped() {
    const typed = parseDigits(entry, settings.typedDecimals)
    if (!Number.isFinite(typed) || typed <= 0) return

    const solve = newSolve(typed, null, scrambleText(scramble), session.event, 'none')
    updateActive((item) => ({ ...item, solves: [...item.solves, solve] }))
    setEntry('')
    goNext()
  }

  function onEntryKey(press: React.KeyboardEvent<HTMLInputElement>) {
    if (press.key === 'Enter') { press.preventDefault(); commitTyped(); return }
    if (press.key === 'Escape') { press.preventDefault(); setEntry(''); return }
    if (press.key === 'Backspace') {
      press.preventDefault()
      setEntry((prev) => prev.slice(0, -1))
      return
    }
    if (/^\d$/.test(press.key)) {
      press.preventDefault()
      setEntry((prev) => (
        prev.length >= maxEntryDigits(settings.typedDecimals) ? prev : prev + press.key
      ))
    }
  }

  /**
   * What the clock reads when it is not running.
   *
   * The session's own last solve rather than the hook's `ms`, which starts at
   * zero on a fresh page load. The two agree the instant a solve ends — the
   * solve just timed IS the session's last one — so this only changes what you
   * see after a reload or a switch of sessions, which is exactly where a bare
   * 0.00 was telling you nothing.
   */
  const restingMs = solves.length > 0 ? effectiveMs(solves[solves.length - 1]) : 0

  /**
   * How the last solve compared with the one before it. NaN whenever there is
   * nothing to compare — fewer than two solves, or a DNF at either end, where
   * the gap is not a number of seconds and pretending otherwise would print an
   * Infinity beside the clock.
   */
  const delta = solves.length >= 2
    ? effectiveMs(solves[solves.length - 1]) - effectiveMs(solves[solves.length - 2])
    : NaN

  // Both of these are pure functions of the timer's state, over in ./display.ts
  // where they can be checked without a browser.
  const face = clockText({
    phase,
    ms: timing ? ms : restingMs,
    inspectMs,
    decimals: settings.decimals,
    runningDisplay: settings.runningDisplay,
  })

  /** The typed field's own face, read twice below — once for its value and once
      to size the box to it. */
  const entryFace = digitsFace(entry, settings.typedDecimals)

  // Where the floating panels are drawn: where they were saved, fitted to the
  // room beside the rail and kept under the clock. Nothing here is written
  // back — see panelFit.
  const storedPreview: PanelBox = {
    width: settings.previewWidth,
    height: settings.previewHeight,
    right: settings.previewRight,
    bottom: settings.previewBottom,
  }
  const storedGraph: PanelBox = {
    width: settings.graphWidth,
    height: settings.graphHeight,
    right: settings.graphRight,
    bottom: settings.graphBottom,
  }
  const previewBox = fitPanel(storedPreview, frame)
  const fittedGraph = fitPanel(storedGraph, frame)
  const graphBox = previewShown
    ? clearOf(fittedGraph, previewBox, storedGraph, storedPreview, frame, { keepOut })
    : fittedGraph

  // The two sidebar parts, floating. Never put anywhere, they open at the
  // top-left of the space beside the sidebar, the list under the stats.
  //
  // The stats box is as tall as the stats until its height is dragged by hand,
  // and gets there by growing downwards: its top is where it was put.
  const statsHeight = settings.statsFitHeight ? statsNatural : null
  const statsSaved = settings.statsBox
  const statsStored: PanelBox = !statsSaved
    ? floatAt(frame, STATS_FLOAT.width, statsHeight ?? STATS_FLOAT.height, frame.top + FIT_GAP)
    : statsHeight === null
      ? statsSaved
      : {
        ...statsSaved,
        height: statsHeight,
        bottom: statsSaved.bottom - (statsHeight - statsSaved.height),
      }
  const statsBox = fitPanel(statsStored, frame)
  const listTop = statsFloat ? rectOf(statsBox, frame).bottom + STACK_GAP : frame.top + FIT_GAP
  const listStored = settings.listBox ?? floatAt(frame, LIST_FLOAT.width, LIST_FLOAT.height, listTop)
  const listBox = fitPanel(listStored, frame)

  // The scramble, floating: opened centred over the space beside the sidebar,
  // and kept as tall as the scramble in it the same way the stats box is — by
  // its top staying where it was put.
  const scrambleHeight = scrambleNatural ?? 120
  const scrambleSaved = settings.scrambleBox
  const scrambleWidth = Math.min(SCRAMBLE_FLOAT_WIDTH, frame.width - frame.left - 2 * FIT_GAP)
  const scrambleLeft = frame.left + (frame.width - frame.left - scrambleWidth) / 2
  const scrambleStored: PanelBox = !scrambleSaved
    ? boxOf({
      left: scrambleLeft,
      top: frame.top + FIT_GAP,
      right: scrambleLeft + scrambleWidth,
      bottom: frame.top + FIT_GAP + scrambleHeight,
    }, frame)
    : {
      ...scrambleSaved,
      height: scrambleHeight,
      bottom: scrambleSaved.bottom - (scrambleHeight - scrambleSaved.height),
    }
  const scrambleBox = fitPanel(scrambleStored, frame)

  // Every box on screen that another can snap to.
  const floating: { id: string; box: PanelBox }[] = [
    ...(scrambleFloat ? [{ id: 'scramble', box: scrambleBox }] : []),
    ...(previewShown ? [{ id: 'preview', box: previewBox }] : []),
    ...(settings.showGraph ? [{ id: 'graph', box: graphBox }] : []),
    ...(statsFloat ? [{ id: 'stats', box: statsBox }] : []),
    ...(listFloat ? [{ id: 'list', box: listBox }] : []),
  ]

  function snapFor(id: string): SnapOptions {
    return {
      enabled: settings.snapPanels,
      others: floating
        .filter((item) => item.id !== id)
        .map((item) => ({ id: item.id, rect: rectOf(item.box, frame) })),
      onGuides: setGuides,
    }
  }

  /** The scramble and what sits above it, docked across the top or floating. */
  function scrambleBanner(floatingNow: boolean) {
    return (
      <ScrambleBanner
        scramble={scramble}
        canGoBack={index > 0}
        onLast={() => setIndex(index - 1)}
        onNext={goNext}
        action={settings.scrambleClick}
        // The box it floats in is the panel; a second one inside it is a frame
        // around a frame.
        flat={floatingNow || settings.flatScramble}
        mono={settings.monoScramble}
        showHead={settings.showScrambleHead}
        scale={settings.scrambleScale}
        // The bar's bottom edge sizes the text; a floating box's sides are its
        // width, and its height is whatever the text comes to.
        onScale={floatingNow ? undefined : (scrambleScale) => onSettings({ ...settings, scrambleScale })}
        onFloat={floatingNow ? undefined : toggleScrambleFloat}
        floatTitle={withHint('float the scramble', keymap, 'toggleScrambleFloat')}
      >
        {settings.showEventPicker && (
          <EventPicker value={session.event} onChange={setEvent} selectRef={eventSelect} />
        )}
        {event.scramble.kind === 'mbf' && (
          <MbldCount value={settings.mbldCount} onChange={setMbldCount} />
        )}
      </ScrambleBanner>
    )
  }

  /** Whether the box being resized has just matched this one's size. */
  const matched = (id: string) => guides?.matched.includes(id) ?? false

  // Rendered in one place at a time — the rail, or the floating box that took it.
  const sessionPicker = (
    <SessionPicker
      sessions={store.sessions}
      activeId={store.activeId}
      onSelect={(id) => setStore((prev) => ({ ...prev, activeId: id }))}
      onCreate={createSession}
      onRename={(name) => updateActive((item) => ({ ...item, name }))}
      onDelete={deleteSession}
      onExport={exportSession}
      selectRef={sessionSelect}
    />
  )

  /** The three switches for the whole timer: named in the sidebar, bare icons
      in a floating box, where there isn't room for the names. */
  function tools(compact: boolean) {
    // All three are switches: pressing one again puts back what the first
    // press did, and the lit state says which way it will go.
    return (
      <>
        <button
          type="button"
          className="rail-tool"
          aria-pressed={openRound !== null}
          aria-label="comp sim"
          title={withHint('comp sim', keymap, 'toggleComp')}
          onClick={toggleComp}
        >
          🏁{compact ? '' : ' comp sim'}
        </button>
        <button
          type="button"
          className="rail-tool"
          aria-pressed={previewShown}
          aria-label="scramble preview"
          title={withHint(
            bldClosed ? 'opens for this scramble only' : 'scramble preview', keymap, 'togglePreview',
          )}
          onClick={togglePreview}
        >
          🧊{compact ? '' : ' preview'}
        </button>
        {/* Draws whichever session is picked, so switching sessions is all it
            takes to look at another one. */}
        <button
          type="button"
          className="rail-tool"
          aria-pressed={settings.showGraph}
          aria-label="session graph"
          title={withHint('session graph', keymap, 'toggleGraph')}
          onClick={toggleGraph}
        >
          📈{compact ? '' : ' graph'}
        </button>
      </>
    )
  }

  return (
    <div
      ref={frameRef}
      className={solving ? 'timer-frame solving' : 'timer-frame'}
      // Multipliers rather than sizes: the stylesheet still decides how the
      // clock and the scramble scale with the window, and these only say by how
      // much more or less than stock. The rail's width is what the stylesheet
      // keeps the clock clear of.
      style={{
        '--clock-scale': settings.clockScale / 100,
        '--scramble-scale': settings.scrambleScale / 100,
        '--rail-w': `${frame.left}px`,
      } as CSSProperties}
    >
      {/* Collapsed, the rail is gone rather than narrowed — a 22px column of
          nothing is worse than either state. The handle below is what brings it
          back, and it is deliberately the only thing left of it. */}
      {!railShown && anyDocked && (
        <button
          type="button"
          className="rail-open"
          aria-expanded={false}
          title={withHint('show the solve list', keymap, 'toggleRail')}
          onClick={() => onSettings({ ...settings, railStowed: false })}
        >
          ›
        </button>
      )}

      {/* The rail carries the tools now, so it stands as long as anything in
          it does rather than only as long as the solve list. */}
      {railColumn && (
        <aside
          ref={railRef}
          // Without the list there is nothing to fill the column below the
          // stats, so the sidebar ends where they do.
          className={`timer-rail${settings.flatSidebar ? ' flat' : ''}${listDocked ? '' : ' short'}`}
          style={{ flexBasis: settings.railWidth }}
        >
          {statsDocked && (
            <div
              ref={railStatsRef}
              className="rail-stats"
              // Only while the list shares the sidebar: on their own the stats
              // are as tall as they are.
              style={listDocked && settings.railSplit !== null
                ? { height: settings.railSplit, overflowY: 'auto' }
                : undefined}
            >
              <button
                type="button"
                className="rail-icon stats-detach"
                aria-label="float the session stats"
                title={withHint('float the stats', keymap, 'toggleStatsFloat')}
                onClick={toggleStatsFloat}
              >
                ⧉
              </button>
              <StatsPanel
                solves={solves}
                decimals={settings.decimals}
                event={event}
                sessionId={session.id}
                onOpenAverage={setDetail}
              />
            </div>
          )}

          {statsDocked && listDocked && (
            <DragHandle
              axis="y"
              className="rail-split"
              label="drag to share the sidebar between the stats and the list"
              onStart={() => { dragFrom.current = railStatsRef.current?.offsetHeight ?? 0 }}
              onDrag={(delta) => setRailSplit(dragFrom.current + delta)}
            />
          )}

          <div className="rail-head">
            <button
              type="button"
              className="rail-stow"
              aria-expanded
              title={withHint('hide the solve list', keymap, 'toggleRail')}
              onClick={() => onSettings({ ...settings, railStowed: true })}
            >
              ‹
            </button>
            {toolsIn === 'rail' && sessionPicker}
            {listDocked && (
              <button
                type="button"
                className="rail-icon"
                aria-label="float the solve list"
                title={withHint('float the solve list', keymap, 'toggleListFloat')}
                onClick={toggleListFloat}
              >
                ⧉
              </button>
            )}
          </div>

          {listDocked && (
            <div className="rail-list">
              <SolveList
                solves={solves}
                sessionId={session.id}
                decimals={settings.decimals}
                onPenalty={setPenalty}
                onDelete={deleteSolve}
                onOpenAverage={setDetail}
              />
            </div>
          )}

          {/* Pinned to the foot of the rail: both are switches for the whole
              timer, and putting them here keeps them still while the list
              above them grows. */}
          {toolsIn === 'rail' && <div className="rail-tools">{tools(false)}</div>}

          <DragHandle
            axis="x"
            className="rail-edge"
            label="drag to resize the sidebar"
            onStart={() => { dragFrom.current = railRef.current?.offsetWidth ?? settings.railWidth }}
            onDrag={(delta) => setRailWidth(dragFrom.current + delta)}
          />
        </aside>
      )}

      <div ref={mainRef} className="timer-main">
        <div ref={headRef} className="timer-head">
        <div className="head-row">
        {bandShown && (
          <aside
            className={settings.flatSidebar ? 'head-stats flat' : 'head-stats'}
            style={{ width: settings.railWidth }}
          >
            <button
              type="button"
              className="rail-icon stats-detach"
              aria-label="float the session stats"
              title={withHint('float the stats', keymap, 'toggleStatsFloat')}
              onClick={toggleStatsFloat}
            >
              ⧉
            </button>
            <StatsPanel
              solves={solves}
              decimals={settings.decimals}
              event={event}
              sessionId={session.id}
              onOpenAverage={setDetail}
            />
            <DragHandle
              axis="x"
              className="rail-edge"
              label="drag to resize the stats"
              onStart={() => { dragFrom.current = settings.railWidth }}
              onDrag={(delta) => setRailWidth(dragFrom.current + delta)}
            />
          </aside>
        )}
        {scrambleDocked && scrambleBanner(false)}
        </div>

        {/* Docked under the scramble, in this column's flow. It used to sit above
            the clock inside the stage, which meant opening a round pushed the
            clock down the screen — the one element on the page whose position
            should never depend on what else is showing. */}
        {openRound && (
          <div className="comp-dock">
            <CompBar
              format={format}
              times={roundTimes}
              targetText={compTarget}
              onTargetText={setCompTarget}
              suggestion={suggestTarget(recent)}
              decimals={settings.decimals}
              onRestart={startRound}
              onClose={() => setRound(null)}
            />
          </div>
        )}
        </div>

        {/* The clock lives in the stage rather than in this column, so it centres
            on the window rather than on the space the rail leaves. */}
        <div className="timer-stage">
          <div ref={clockRef} className="stage-clock">
            {/* The delta hangs off the clock rather than sitting beside it in
                flow: it is out of the normal flow entirely, so the clock's
                centre is the window's centre whether or not there is a gap to
                show. */}
            <div className="clock-line">
              {typedEntry ? (
                /* An input rather than a div, and that is what makes it work:
                   useTimer ignores every key while focus is in one, so the space
                   bar stops being a start button for as long as you are typing
                   a time into it. */
                <input
                  className="clock clock-entry"
                  value={entryFace}
                  /* Sized to what it holds. Without this the box is twenty
                     characters wide at clock size — an invisible band across the
                     window that swallows every click aimed at the rail or the
                     list behind it. Four is the floor, the width of '0.00'. */
                  size={Math.max(entryFace.length, 4)}
                  readOnly
                  autoFocus
                  inputMode="numeric"
                  aria-label="type the time this solve took"
                  // Shortcuts still reach past it: the box prevents the keys it
                  // uses — digits, enter, escape, backspace — and the shortcut
                  // listener skips anything prevented.
                  data-hotkeys="through"
                  onKeyDown={onEntryKey}
                />
              ) : (
                <div className={`clock ${clockPhase(phase, inspectMs)}`}>{face}</div>
              )}
              {settings.showDelta && !timing && Number.isFinite(delta) && (
                <span className={delta < 0 ? 'clock-delta good' : 'clock-delta bad'}>
                  ({delta < 0 ? '-' : '+'}{formatTime(Math.abs(delta), settings.decimals)})
                </span>
              )}
            </div>

            {/* Everything that reads off the clock hangs below it out of flow,
                for the same reason the delta hangs beside it: in flow these
                would be centred along with the clock, so the clock would sit
                half their height above the window's middle and jump back down
                every time they hid for a solve. */}
            <div ref={underRef} className="clock-under">
              {/* The session's mean memo and mean exec, not the last solve's
                  split — which is the half of a blindfolded solve you are
                  actually training, and the one figure the averages below
                  cannot show you. The last solve's own split is still a click
                  away in the list.

                  Gated on the event rather than on the last solve having a
                  split, so the line is there from the first solve of a session
                  instead of appearing once one lands. It updates on exactly the
                  same path as the ao5 below it: `solves` is derived every
                  render. */}
              {event.split && !timing && (
                <div className="split">
                  <span>memo <b>{formatTime(meanMemo(solves), settings.decimals)}</b></span>
                  <span>exec <b>{formatTime(meanExec(solves), settings.decimals)}</b></span>
                </div>
              )}

              {/* Hidden while the clock is running whatever else is on screen —
                  an average you can't change yet is the definition of a
                  distraction. */}
              {settings.showAverages && !timing && (
                <div className="averages">
                  {[5, 12].map((size) => {
                    const value = average(solves, size)
                    return (
                      <span key={size}>
                        ao{size}{' '}
                        <b>
                          <button
                            type="button"
                            className="ao-open"
                            // Nothing to open before there are enough solves for
                            // the average to exist.
                            disabled={Number.isNaN(value)}
                            onClick={() => setDetail({
                              label: `ao${size}`, solves: solves.slice(-size),
                            })}
                          >
                            {formatTime(value, settings.decimals)}
                          </button>
                        </b>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Not pinned to a corner — it sits wherever it was last dragged, over
            the whole frame. */}
        {previewShown && (
          <ScramblePreview
            event={event}
            scramble={scramble}
            width={previewBox.width}
            height={previewBox.height}
            right={previewBox.right}
            bottom={previewBox.bottom}
            saved={storedPreview}
            frame={frame}
            snap={snapFor('preview')}
            highlight={matched('preview')}
            onBox={(next) => onSettings({
              ...settings,
              previewWidth: next.width,
              previewHeight: next.height,
              previewRight: next.right,
              previewBottom: next.bottom,
            })}
            locked={isLocked('preview')}
            onLock={() => toggleLock('preview')}
            // Position only. The size is something you set once to suit your
            // screen; the position is what gets knocked out of place dragging
            // the panel about, so putting it back is what's worth one click.
            onReset={() => onSettings({
              ...settings,
              previewRight: DEFAULT_TIMER_SETTINGS.previewRight,
              previewBottom: DEFAULT_TIMER_SETTINGS.previewBottom,
            })}
          />
        )}

        {settings.showGraph && (
          <SessionGraph
            solves={solves}
            decimals={settings.decimals}
            span={settings.graphSpan}
            width={graphBox.width}
            height={graphBox.height}
            right={graphBox.right}
            bottom={graphBox.bottom}
            saved={storedGraph}
            frame={frame}
            snap={snapFor('graph')}
            highlight={matched('graph')}
            onSpan={(graphSpan) => onSettings({ ...settings, graphSpan })}
            onBox={(next) => onSettings({
              ...settings,
              graphWidth: next.width,
              graphHeight: next.height,
              graphRight: next.right,
              graphBottom: next.bottom,
            })}
            locked={isLocked('graph')}
            onLock={() => toggleLock('graph')}
          />
        )}

        {/* Held back until the frame is measured: a box that has never been put
            anywhere is placed from the frame's size, which is 0 until then. */}
        {frame.width > 0 && scrambleFloat && (
          <FloatingBox
            className={settings.flatScramble ? 'scramble-float flat' : 'scramble-float'}
            title="scramble"
            box={scrambleBox}
            saved={scrambleStored}
            frame={frame}
            snap={snapFor('scramble')}
            highlight={matched('scramble')}
            onBox={(next) => onSettings({ ...settings, scrambleBox: next })}
            onDock={toggleScrambleFloat}
            dockTo="the top"
            locked={isLocked('scramble')}
            onLock={() => toggleLock('scramble')}
            bareWhenLocked
            widthOnly
            limits={{
              minWidth: SCRAMBLE_FLOAT_MIN_WIDTH,
              maxWidth: SCRAMBLE_FLOAT_MAX_WIDTH,
              minHeight: SCRAMBLE_FLOAT_MIN_HEIGHT,
              maxHeight: FLOAT_MAX_HEIGHT,
            }}
            onNaturalHeight={setScrambleNatural}
          >
            {scrambleBanner(true)}
          </FloatingBox>
        )}

        {frame.width > 0 && statsFloat && (
          <FloatingBox
            className="stats-float"
            title="stats"
            box={statsBox}
            saved={statsStored}
            frame={frame}
            snap={snapFor('stats')}
            highlight={matched('stats')}
            onBox={(next) => onSettings({
              ...settings,
              statsBox: next,
              // A height dragged by hand is the height from then on; a move
              // keeps the height it had, and so keeps fitting.
              statsFitHeight: settings.statsFitHeight && next.height === statsStored.height,
            })}
            onNaturalHeight={setStatsNatural}
            onDock={toggleStatsFloat}
            locked={isLocked('stats')}
            onLock={() => toggleLock('stats')}
            head={toolsIn === 'stats' ? sessionPicker : undefined}
            foot={toolsIn === 'stats' ? tools(true) : undefined}
          >
            <StatsPanel
              solves={solves}
              decimals={settings.decimals}
              event={event}
              sessionId={session.id}
              onOpenAverage={setDetail}
            />
          </FloatingBox>
        )}

        {frame.width > 0 && listFloat && (
          <FloatingBox
            className="list-float"
            title="solves"
            box={listBox}
            saved={listStored}
            frame={frame}
            snap={snapFor('list')}
            highlight={matched('list')}
            onBox={(next) => onSettings({ ...settings, listBox: next })}
            onDock={toggleListFloat}
            locked={isLocked('list')}
            onLock={() => toggleLock('list')}
            head={sessionPicker}
            foot={tools(true)}
          >
            <SolveList
              solves={solves}
              sessionId={session.id}
              decimals={settings.decimals}
              onPenalty={setPenalty}
              onDelete={deleteSolve}
              onOpenAverage={setDetail}
              compact
            />
          </FloatingBox>
        )}
      </div>

      {/* Only while a box is held and has landed on something. */}
      {guides?.guides.map((guide) => (
        <div
          key={`${guide.axis}${guide.at}`}
          className={`snap-guide ${guide.axis}`}
          style={guide.axis === 'x' ? { left: guide.at } : { top: guide.at }}
        />
      ))}

      {detail && (
        <AverageDetail
          label={detail.label}
          solves={detail.solves}
          value={detail.value}
          decimals={settings.decimals}
          onClose={() => setDetail(null)}
        />
      )}

      {pendingMbld && (
        <MbldPrompt
          ms={pendingMbld.ms}
          attempted={settings.mbldCount}
          decimals={settings.decimals}
          onRecord={(result) => {
            // The scoring rule outranks the clock: under a point is a DNF no
            // matter how the attempt was timed.
            const penalty = mbldIsDnf(result) ? 'dnf' : pendingMbld.penalty
            record(pendingMbld.ms, pendingMbld.memoMs, penalty, result)
            setPendingMbld(null)
          }}
          onDiscard={() => setPendingMbld(null)}
        />
      )}

      {/* Always mounted, so a screen reader is already watching it when the
          message arrives; the span is keyed so a repeat replays its fade. */}
      <p className="timer-flash" role="status">
        {flash && <span key={flash.at}>{flash.text}</span>}
      </p>
    </div>
  )
}
