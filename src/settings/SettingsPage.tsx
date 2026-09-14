import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import CsTimerImport from './CsTimerImport'
import { BackupPanel, DeleteEverything, ImportUndo, SnapshotRestore } from './DataSection'
import TimerPreview from './TimerPreview'
import ThemeEditor from './ThemeEditor'
import { Choice, Row, Searchable, Select, Stepper, Toggle } from './controls'
import { lastTab, rememberTab, type SettingsTab as TabId } from './lastTab'
import { SearchContext } from './search'
import {
  CUSTOM_THEME_ID, FONTS, paletteOf, seedCustomTheme, THEMES, type Appearance,
} from '../theme/theme'
import { clearBackground, downscale, putBackground } from '../theme/imageStore'
import { SCALE_MAX, SCALE_MIN, type TimerSettings } from '../timer/settings'
import type { TimerStore } from '../timer/types'

/**
 * Three tabs, each split into the few things people come to it for.
 *
 * The page used to be one long scroll with jump links, which worked until it
 * held thirty settings: finding one meant knowing which heading it hid under
 * and scrolling past the rest. Now every group is a click away, and the search
 * box finds a setting without knowing where it lives at all.
 */
const TABS: { id: TabId; name: string; subs: { id: string; name: string }[] }[] = [
  {
    id: 'appearance',
    name: 'appearance',
    subs: [
      { id: 'theme', name: 'theme' },
      { id: 'fonts', name: 'fonts' },
      { id: 'background', name: 'background' },
      { id: 'panels', name: 'panels' },
    ],
  },
  {
    id: 'timer',
    name: 'timer',
    subs: [
      { id: 'layout', name: 'layout' },
      { id: 'clock', name: 'clock' },
      { id: 'entry', name: 'entry' },
      { id: 'scramble', name: 'scramble' },
      { id: 'preview', name: 'preview' },
    ],
  },
  {
    id: 'data',
    name: 'data',
    // In the order you would reach for them: keep a copy, bring one in, and
    // only then the ways of undoing things — the one with no undo last.
    subs: [
      { id: 'backup', name: 'backup' },
      { id: 'cstimer', name: 'csTimer' },
      { id: 'reset', name: 'reset' },
    ],
  },
]

/**
 * Arrow keys between tabs, the way a tab list is expected to work. Focus moves
 * and the tab is chosen with it, since every tab here is cheap to show.
 */
function arrowKeys(press: KeyboardEvent<HTMLDivElement>) {
  if (press.key !== 'ArrowRight' && press.key !== 'ArrowLeft') return
  const tabs = [...press.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const at = tabs.indexOf(document.activeElement as HTMLButtonElement)
  if (at === -1) return
  press.preventDefault()
  const next = tabs[(at + (press.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
  next.focus()
  next.click()
}

interface SettingsPageProps {
  appearance: Appearance
  onAppearance: (next: Appearance) => void
  /** Reloads the picture from IndexedDB after it changes. */
  onBackgroundChanged: () => void
  timer: TimerSettings
  onTimer: (next: TimerSettings) => void
  /** The whole solve history, for the csTimer importer to add to. */
  timerStore: TimerStore
  onTimerStore: (next: TimerStore) => void
  /** Leaves for the timer, so an import ends where the solves are. */
  onOpenTimer: () => void
  /** Puts every setting back to stock. Owned by App, which holds all three. */
  onRestoreDefaults: () => void
}

export default function SettingsPage({
  appearance, onAppearance, onBackgroundChanged, timer, onTimer, timerStore, onTimerStore,
  onOpenTimer, onRestoreDefaults,
}: SettingsPageProps) {
  const picker = useRef<HTMLInputElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [tab, setTabState] = useState<TabId>(() => lastTab().tab)
  const [subs, setSubs] = useState(() => lastTab().subs)
  const [query, setQuery] = useState('')
  /** Whether the palette is open for editing. */
  const [editingTheme, setEditingTheme] = useState(appearance.themeId === CUSTOM_THEME_ID)

  const searching = query.trim() !== ''
  const current = TABS.find((item) => item.id === tab) ?? TABS[0]
  const sub = subs[tab]

  function setTab(id: TabId) {
    rememberTab(id, subs)
    setTabState(id)
  }

  function setSub(id: string) {
    const next = { ...subs, [tab]: id }
    rememberTab(tab, next)
    setSubs(next)
  }

  // "/" jumps to the search box from anywhere on the page, the way it does on
  // most sites with one — unless you are already typing into something.
  useEffect(() => {
    function onKey(press: globalThis.KeyboardEvent) {
      if (press.key !== '/' || press.metaKey || press.ctrlKey || press.altKey) return
      const target = press.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      press.preventDefault()
      search.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function setAppearance<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    onAppearance({ ...appearance, [key]: value })
  }

  function setTimer<K extends keyof TimerSettings>(key: K, value: TimerSettings[K]) {
    onTimer({ ...timer, [key]: value })
  }

  // What the custom chip paints itself with: the palette if there is one, and
  // otherwise the theme it would be seeded from.
  const customColors = paletteOf(
    appearance.customTheme ?? seedCustomTheme(
      appearance.themeId === CUSTOM_THEME_ID ? THEMES[0].id : appearance.themeId,
    ),
  )

  async function chooseBackground(file: File) {
    await putBackground(await downscale(file))
    onAppearance({ ...appearance, hasBackground: true })
    onBackgroundChanged()
  }

  async function dropBackground() {
    await clearBackground()
    onAppearance({ ...appearance, hasBackground: false })
    onBackgroundChanged()
  }

  function restoreDefaults() {
    if (!window.confirm(
      'Put every setting back to its default? Your solves, sessions, algs and ' +
      'letter pairs are not touched.',
    )) return
    onRestoreDefaults()
  }

  // Every stepper on this page reads and writes a plain whole number; the
  // fraction-valued settings are converted at their own call sites.
  const plain = (value: number) => `${value}`

  /** The rows of one group. The same rows whether shown under their tab or in
      search results, so the two can never disagree about what a setting does. */
  function group(id: string): ReactNode {
    switch (id) {
      case 'theme':
        return (
          <>
            <Row label="theme" keywords="colour color palette dark light custom">
              <div className="theme-grid">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className="theme-chip"
                    aria-pressed={theme.id === appearance.themeId}
                    style={{
                      background: theme.colors.bg,
                      color: theme.colors.text,
                      borderColor: theme.colors.line,
                    }}
                    /* Closes the palette editor as it goes: it edits the custom
                       theme, and leaving it open under a stock theme left a
                       panel of controls that changed nothing you could see. */
                    onClick={() => {
                      setAppearance('themeId', theme.id)
                      setEditingTheme(false)
                    }}
                  >
                    <span>{theme.name}</span>
                    <i style={{ background: theme.colors.accent }} />
                  </button>
                ))}

                {/* Drawn from the palette it selects, exactly like the chips
                    before it. */}
                <button
                  type="button"
                  className="theme-chip"
                  aria-pressed={appearance.themeId === CUSTOM_THEME_ID}
                  aria-expanded={editingTheme}
                  style={{
                    background: customColors.bg,
                    color: customColors.text,
                    borderColor: customColors.line,
                  }}
                  onClick={() => {
                    // First press builds a palette as well as opening the
                    // editor, seeded from the theme on screen, so pressing it
                    // changes nothing about how the app looks until you change
                    // something.
                    if (appearance.themeId !== CUSTOM_THEME_ID) {
                      onAppearance({
                        ...appearance,
                        themeId: CUSTOM_THEME_ID,
                        customTheme: appearance.customTheme ?? seedCustomTheme(appearance.themeId),
                      })
                      setEditingTheme(true)
                    } else {
                      setEditingTheme(!editingTheme)
                    }
                  }}
                >
                  <span>Custom</span>
                  <i style={{ background: customColors.accent }} />
                </button>
              </div>
            </Row>
            {editingTheme && (
              <Searchable label="custom theme palette" keywords="colour color editor accent">
                <ThemeEditor appearance={appearance} onAppearance={onAppearance} />
              </Searchable>
            )}
          </>
        )

      case 'fonts':
        return (
          <>
            <Row label="interface font" keywords="typeface">
              <Choice options={FONTS} value={appearance.uiFont} onChange={(v) => setAppearance('uiFont', v)} />
            </Row>
            <Row label="timer font" keywords="typeface clock">
              <Choice options={FONTS} value={appearance.timerFont} onChange={(v) => setAppearance('timerFont', v)} />
            </Row>
            <Row label="text size" description="Percent of the stock size, for the whole app." keywords="font scale zoom">
              <Stepper
                value={Math.round(appearance.fontScale * 100)} min={85} max={140} step={5}
                format={plain}
                onChange={(value) => setAppearance('fontScale', value / 100)}
              />
            </Row>
          </>
        )

      case 'background':
        return (
          <>
            <Row label="background picture" keywords="image wallpaper photo">
              <div className="actions">
                <button type="button" onClick={() => picker.current?.click()}>
                  {appearance.hasBackground ? 'replace' : 'choose'}
                </button>
                {appearance.hasBackground && (
                  <button type="button" onClick={() => void dropBackground()}>remove</button>
                )}
              </div>
              <input
                ref={picker}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void chooseBackground(file)
                }}
              />
            </Row>
            <Row label="background blur" keywords="image wallpaper">
              <Stepper
                value={appearance.bgBlur} min={0} max={24} step={2}
                format={plain}
                onChange={(value) => setAppearance('bgBlur', value)}
              />
            </Row>
            <Row label="background dim" description="How far the picture is darkened under the text." keywords="image wallpaper darken">
              <Stepper
                value={Math.round(appearance.bgDim * 100)} min={0} max={90} step={5}
                format={plain}
                onChange={(value) => setAppearance('bgDim', value / 100)}
              />
            </Row>
          </>
        )

      case 'panels':
        return (
          <>
            <Row label="panel opacity" keywords="transparency glass">
              <Stepper
                value={Math.round(appearance.panelOpacity * 100)} min={25} max={100} step={5}
                format={plain}
                onChange={(value) => setAppearance('panelOpacity', value / 100)}
              />
            </Row>
            <Row label="panel blur" keywords="glass frosted">
              <Stepper
                value={appearance.panelBlur} min={0} max={24} step={2}
                format={plain}
                onChange={(value) => setAppearance('panelBlur', value)}
              />
            </Row>
            <Row
              label="menu bar"
              description="Stows the bar at the top down to the wordmark, which stays behind to bring it back. Pressing the wordmark does the same thing."
              keywords="top bar navigation header hide"
            >
              <Toggle
                value={!appearance.topBarStowed}
                onChange={(shown) => setAppearance('topBarStowed', !shown)}
              />
            </Row>
          </>
        )

      case 'layout':
        return (
          <>
            <Row label="scramble banner" keywords="show hide">
              <Toggle value={timer.showScramble} onChange={(v) => setTimer('showScramble', v)} />
            </Row>
            <Row label="solve list" keywords="times history sidebar rail">
              <Toggle value={timer.showSolveList} onChange={(v) => setTimer('showSolveList', v)} />
            </Row>
            <Row label="session stats" keywords="sidebar rail averages">
              <Toggle value={timer.showStats} onChange={(v) => setTimer('showStats', v)} />
            </Row>
            <Row label="ao5 / ao12 under the clock" keywords="average">
              <Toggle value={timer.showAverages} onChange={(v) => setTimer('showAverages', v)} />
            </Row>
            <Row label="difference from the last solve" keywords="delta compare">
              <Toggle value={timer.showDelta} onChange={(v) => setTimer('showDelta', v)} />
            </Row>
            <Row
              label="hide everything while solving"
              description="Leaves the clock alone on screen, from the start of inspection to the end of the solve."
              keywords="focus distraction"
            >
              <Toggle value={timer.hideUiWhileRunning} onChange={(v) => setTimer('hideUiWhileRunning', v)} />
            </Row>
            <Row label="flat scramble bar" description="Removes the background of the scramble panel.">
              <Toggle value={timer.flatScramble} onChange={(v) => setTimer('flatScramble', v)} />
            </Row>
            <Row label="flat sidebar" description="Removes the background of the side panel." keywords="rail">
              <Toggle value={timer.flatSidebar} onChange={(v) => setTimer('flatSidebar', v)} />
            </Row>
          </>
        )

      case 'clock':
        return (
          <>
            {/* Percentages of the stock size rather than absolute sizes: both
                still scale with the window and with the app-wide text size. */}
            <Row label="clock text size" keywords="timer font scale">
              <Stepper
                value={timer.clockScale} min={SCALE_MIN} max={SCALE_MAX} step={5}
                format={plain}
                onChange={(value) => setTimer('clockScale', value)}
              />
            </Row>
            <Row label="timer update" description="What the clock shows while solving." keywords="running display hidden">
              <Choice
                options={[
                  { id: 'tenths', name: '0.1s' },
                  { id: 'seconds', name: 'seconds' },
                  { id: 'hidden', name: 'none' },
                ]}
                value={timer.runningDisplay}
                onChange={(id) => setTimer('runningDisplay', id)}
              />
            </Row>
            <Row label="decimal appearance" keywords="precision digits milliseconds hundredths">
              <Choice
                options={[{ id: '2', name: '12.34' }, { id: '3', name: '12.345' }]}
                value={timer.decimals === 3 ? '3' : '2'}
                onChange={(id) => setTimer('decimals', id === '3' ? 3 : 2)}
              />
            </Row>
            <Row label="WCA inspection" description="15 second inspection, with automatic penalty." keywords="countdown">
              <Toggle value={timer.inspection} onChange={(v) => setTimer('inspection', v)} />
            </Row>
            <Row label="hold to arm" description="How many milliseconds space is held in order to arm the timer." keywords="space delay start">
              <Stepper
                value={timer.holdMs} min={0} max={1000} step={50}
                format={plain}
                onChange={(value) => setTimer('holdMs', value)}
              />
            </Row>
          </>
        )

      case 'entry':
        return (
          <>
            <Row
              label="how a time is entered"
              description={timer.typedDecimals === 3
                ? 'Typed is for a stackmat: 12345 is read as 12.345 and 123456 is 1:23.456.'
                : 'Typed is for a stackmat: 1234 is read as 12.34 and 12345 is 1:23.45.'}
              keywords="manual stackmat keyboard"
            >
              <Choice
                options={[
                  { id: 'timer', name: 'the clock' },
                  { id: 'typed', name: 'typed' },
                ]}
                value={timer.entryMode}
                onChange={(id) => setTimer('entryMode', id)}
              />
            </Row>
            {/* Separate from "decimal appearance", which is only how a time is
                drawn. This is what the digits you type mean. */}
            <Row label="typed time precision" keywords="decimals digits stackmat milliseconds hundredths format">
              <Select
                options={[
                  { id: '2', name: 'XX:XX:XX.XX' },
                  { id: '3', name: 'XX:XX:XX.XXX' },
                ]}
                value={timer.typedDecimals === 3 ? '3' : '2'}
                onChange={(id) => setTimer('typedDecimals', id === '3' ? 3 : 2)}
              />
            </Row>
          </>
        )

      case 'scramble':
        return (
          <>
            <Row label="scramble text size" keywords="font scale">
              <Stepper
                value={timer.scrambleScale} min={SCALE_MIN} max={SCALE_MAX} step={5}
                format={plain}
                onChange={(value) => setTimer('scrambleScale', value)}
              />
            </Row>
            <Row label="monospaced scramble" keywords="font">
              <Toggle value={timer.monoScramble} onChange={(v) => setTimer('monoScramble', v)} />
            </Row>
            <Row label="action when clicking scramble" keywords="copy next">
              <Choice
                options={[
                  { id: 'copy', name: 'copy' },
                  { id: 'next', name: 'next scramble' },
                  { id: 'none', name: 'none' },
                ]}
                value={timer.scrambleClick}
                onChange={(id) => setTimer('scrambleClick', id)}
              />
            </Row>
          </>
        )

      case 'preview':
        return (
          <>
            <Row label="scramble preview" keywords="cube net image picture">
              <Toggle value={timer.showCubeNet} onChange={(v) => setTimer('showCubeNet', v)} />
            </Row>
            <Row
              label="close the preview for blindfolded events"
              description="Starts closed on each blindfolded scramble; the 🧊 button still opens it."
              keywords="bld blind 3bld cube net"
            >
              <Toggle value={timer.hideBldPreview} onChange={(v) => setTimer('hideBldPreview', v)} />
            </Row>
          </>
        )

      case 'backup':
        return <BackupPanel />

      case 'cstimer':
        return (
          <Searchable label="import from csTimer" keywords="cstimer import txt sessions solves">
            <CsTimerImport store={timerStore} onImport={onTimerStore} onOpenTimer={onOpenTimer} />
          </Searchable>
        )

      case 'reset':
        return (
          <>
            <SnapshotRestore />
            <ImportUndo />
            <Row
              label="restore default settings"
              description="Only settings are affected. Solves, sessions, algs and letter pairs are not harmed."
              keywords="reset defaults"
            >
              <div className="actions">
                <button type="button" onClick={restoreDefaults}>restore defaults</button>
              </div>
            </Row>
            <DeleteEverything />
          </>
        )

      default:
        return null
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-head">
        <div className="settings-tabs" role="tablist" aria-label="settings" onKeyDown={arrowKeys}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`settings-tab-${item.id}`}
              aria-selected={!searching && tab === item.id}
              aria-controls="settings-panel"
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => {
                setTab(item.id)
                setQuery('')
              }}
            >
              {item.name}
            </button>
          ))}
        </div>

        <input
          ref={search}
          className="settings-search"
          type="search"
          value={query}
          placeholder="Search settings…  /"
          aria-label="search settings"
          spellCheck={false}
          autoComplete="off"
          onChange={(change) => setQuery(change.target.value)}
          onKeyDown={(press) => {
            if (press.key === 'Escape') {
              press.preventDefault()
              setQuery('')
            }
          }}
        />
      </header>

      <SearchContext.Provider value={query}>
        {searching ? (
          /* Every group of every tab, headed with where it lives, so a result
             also teaches you where to find it next time. Groups with nothing
             matching hide themselves in the stylesheet. */
          <div className="settings-results" id="settings-panel" aria-live="polite">
            {TABS.flatMap((item) => item.subs.map((each) => (
              <section key={`${item.id}-${each.id}`} className="settings-sub">
                <h2 className="settings-sub-title">
                  {item.name} <span aria-hidden="true">›</span> {each.name}
                </h2>
                <div className="settings-card">{group(each.id)}</div>
              </section>
            )))}
            <p className="settings-empty">No settings match &ldquo;{query.trim()}&rdquo;.</p>
          </div>
        ) : (
          <div
            className="settings-panel"
            id="settings-panel"
            role="tabpanel"
            aria-labelledby={`settings-tab-${tab}`}
          >
            <div className="settings-subtabs" role="tablist" aria-label={`${current.name} sections`} onKeyDown={arrowKeys}>
              {current.subs.map((each) => (
                <button
                  key={each.id}
                  type="button"
                  role="tab"
                  aria-selected={sub === each.id}
                  tabIndex={sub === each.id ? 0 : -1}
                  onClick={() => setSub(each.id)}
                >
                  {each.name}
                </button>
              ))}
            </div>

            {/* The mock sits beside every timer group, sticky, so what a
                setting does is visible the moment it is pressed. */}
            {tab === 'timer' ? (
              <div className="settings-split">
                <div className="settings-card">{group(sub)}</div>
                <div className="settings-preview">
                  <TimerPreview settings={timer} />
                </div>
              </div>
            ) : (
              <div className="settings-card">{group(sub)}</div>
            )}
          </div>
        )}
      </SearchContext.Provider>
    </div>
  )
}
