import { useEffect, useState } from 'react'
import { useTimer } from './useTimer'
import { clockPhase, clockText, isInspecting } from './display'
import { digitsFace, formatTime, maxEntryDigits, parseDigits } from './format'
import { eventOf, type EventId, type WcaEvent } from './events'
import { prepare, scrambleFor, scrambleText, type Scramble } from './scramble'
import EventPicker from './EventPicker'
import MbldCount from './MbldCount'
import MbldPrompt from './MbldPrompt'
import ScrambleBanner from './ScrambleBanner'
import ScramblePreview from './ScramblePreview'
import SessionPicker from './SessionPicker'
import SolveList from './SolveList'
import StatsPanel from './StatsPanel'
import CompBar from './CompBar'
import AverageDetail from './AverageDetail'
import type { AverageView } from './averageText'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import { DEFAULT_TIMER_SETTINGS, type TimerSettings } from './settings'
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
}

export default function TimerPanel({
  store, setStore, settings, onSettings, onSolving,
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

  function deleteSolve(id: number) {
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

  const railShown = (settings.showSolveList || settings.showStats) && !settings.railStowed

  return (
    <div
      className={solving ? 'timer-frame solving' : 'timer-frame'}
      // Multipliers rather than sizes: the stylesheet still decides how the
      // clock and the scramble scale with the window, and these only say by how
      // much more or less than stock.
      style={{
        '--clock-scale': settings.clockScale / 100,
        '--scramble-scale': settings.scrambleScale / 100,
      } as CSSProperties}
    >
      {/* Collapsed, the rail is gone rather than narrowed — a 22px column of
          nothing is worse than either state. The handle below is what brings it
          back, and it is deliberately the only thing left of it. */}
      {!railShown && (settings.showSolveList || settings.showStats) && (
        <button
          type="button"
          className="rail-open"
          aria-expanded={false}
          title="show the solve list"
          onClick={() => onSettings({ ...settings, railStowed: false })}
        >
          ›
        </button>
      )}

      {/* The rail carries the tools now, so it stands as long as anything in
          it does rather than only as long as the solve list. */}
      {railShown && (
        <aside className={settings.flatSidebar ? 'timer-rail flat' : 'timer-rail'}>
          {settings.showStats && (
            <div className="rail-stats">
              <StatsPanel
                solves={solves}
                decimals={settings.decimals}
                event={event}
                sessionId={session.id}
                onOpenAverage={setDetail}
              />
            </div>
          )}

          <div className="rail-head">
            <button
              type="button"
              className="rail-stow"
              aria-expanded
              title="hide the solve list"
              onClick={() => onSettings({ ...settings, railStowed: true })}
            >
              ‹
            </button>
            <SessionPicker
              sessions={store.sessions}
              activeId={store.activeId}
              onSelect={(id) => setStore((prev) => ({ ...prev, activeId: id }))}
              onCreate={createSession}
              onRename={(name) => updateActive((item) => ({ ...item, name }))}
              onDelete={deleteSession}
              onExport={exportSession}
            />
          </div>

          {settings.showSolveList && (
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
          <div className="rail-tools">
            {/* Both are switches: pressing one again puts back what the first
                press did, and the lit state says which way it will go. */}
            <button
              type="button"
              className="rail-tool"
              aria-pressed={openRound !== null}
              onClick={openRound ? () => setRound(null) : startRound}
            >
              🏁 comp sim
            </button>
            {/* In a blindfolded event this opens the preview for the scramble on
                screen only, and never touches the setting — the next scramble
                starts closed again. */}
            <button
              type="button"
              className="rail-tool"
              aria-pressed={previewShown}
              title={bldClosed ? 'opens for this scramble only' : undefined}
              onClick={() => {
                if (bldClosed) setPeekFor(previewShown ? null : scramble)
                else onSettings({ ...settings, showCubeNet: !settings.showCubeNet })
              }}
            >
              🧊 preview
            </button>
          </div>
        </aside>
      )}

      <div className="timer-main">
        {settings.showScramble && (
          <ScrambleBanner
            scramble={scramble}
            canGoBack={index > 0}
            onLast={() => setIndex(index - 1)}
            onNext={goNext}
            action={settings.scrambleClick}
            flat={settings.flatScramble}
            mono={settings.monoScramble}
          >
            <EventPicker value={session.event} onChange={setEvent} />
            {event.scramble.kind === 'mbf' && (
              <MbldCount value={settings.mbldCount} onChange={setMbldCount} />
            )}
          </ScrambleBanner>
        )}

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

        {/* The clock lives in the stage rather than in this column, so it centres
            on the window rather than on the space the rail leaves. */}
        <div className="timer-stage">
          <div className="stage-clock">
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
            <div className="clock-under">
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
            width={settings.previewWidth}
            height={settings.previewHeight}
            right={settings.previewRight}
            bottom={settings.previewBottom}
            onResize={(previewWidth, previewHeight) =>
              onSettings({ ...settings, previewWidth, previewHeight })}
            onMove={(previewRight, previewBottom) =>
              onSettings({ ...settings, previewRight, previewBottom })}
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
      </div>

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
    </div>
  )
}
