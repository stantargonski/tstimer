import { useState, useEffect } from 'react';
import PairGrid from './bld/letterPairs/PairGrid';
import FillMode from './bld/letterPairs/FillMode';
import { loadStore, saveStore } from './bld/letterPairs/storage';
import { isBlankEntry, type PairEntry } from './bld/letterPairs/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings/defaults';
import TimerPanel from './timer/TimerPanel'
import CfopPanel from './cfop/CfopPanel';
import { loadCfopStore, saveCfopStore } from './cfop/storage';
import { isBlankEntry as isBlankCase, type CaseEntry } from './cfop/types';
import SettingsPage from './settings/SettingsPage';
import {
  applyAppearance, applyBackground, DEFAULT_APPEARANCE, loadAppearance, saveAppearance,
  type Appearance,
} from './theme/theme';
import { getBackground } from './theme/imageStore';
import {
  DEFAULT_TIMER_SETTINGS, loadTimerSettings, saveTimerSettings, type TimerSettings,
} from './timer/settings';
import { loadTimerStore, saveTimerStore } from './timer/storage';
import StatsPage from './timer/StatsPage';
import {
  DEFAULT_KEYMAP, loadKeymap, saveKeymap, withHint, type ActionId, type Keymap,
} from './keys/keymap';
import { useHotkeys } from './keys/useHotkeys';

type Section = 'timer' | 'stats' | 'bld' | 'cfop' | 'settings'

// The timer is first because it is what the app is for; everything else is
// something you go and look at between solves.
const SECTIONS: { id: Section; label: string; action?: ActionId }[] = [
  { id: 'timer', label: 'Timer', action: 'goTimer' },
  { id: 'stats', label: 'Stats', action: 'goStats' },
  { id: 'bld', label: '3BLD' },
  { id: 'cfop', label: 'CFOP'},
  { id: 'settings', label: 'Settings', action: 'goSettings' },
];

/**
 * The wordmark, and the switch that puts the bar away — the way a logo is on
 * every other site, doing the one job there is room for it to do here.
 *
 * Its own component because it is rendered twice, in the bar and floating over
 * the content once the bar is stowed, and the two must not be able to drift.
 * That it is the same control in both places is the whole point: whatever put
 * the bar away is sitting where it left it, waiting to bring it back.
 */
function Brand({ appearance, onAppearance, keymap }: {
  appearance: Appearance
  onAppearance: (next: Appearance) => void
  keymap: Keymap
}) {
  const stowed = appearance.topBarStowed
  return (
    <button
      type="button"
      className="brand"
      aria-expanded={!stowed}
      title={withHint(stowed ? 'show the menu' : 'hide the menu', keymap, 'toggleTopBar')}
      onClick={() => onAppearance({ ...appearance, topBarStowed: !stowed })}
    >
      tstimer
    </button>
  )
}

export default function App() {
  const [section, setSection] = useState<Section>('timer');
  /** Whether a solve is running and the interface is meant to be out of the
      way. Lives up here because the top bar does — the timer can hide its own
      rail and scramble, but the bar is above it in the tree. */
  const [solving, setSolving] = useState(false);

  const [store, setStore] = useState(loadStore);
  const [settings, setSettings] = useState(loadSettings);
  const [selected, setSelected] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [cases, setCases] = useState(loadCfopStore);

  // Timer settings live up here rather than in TimerPanel: the settings page
  // and the timer both read them, and two copies of a toggle is one copy too
  // many. Appearance is the same story writ larger — it styles every section.
  const [timerSettings, setTimerSettings] = useState(loadTimerSettings);
  const [appearance, setAppearance] = useState(loadAppearance);
  const [timerStore, setTimerStore] = useState(loadTimerStore);
  const [backgroundNonce, setBackgroundNonce] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [keymap, setKeymap] = useState(loadKeymap);
  /** Whether the timer is mid-solve or has a sheet open — anything where a
      letter is not a request to leave the page. Reported for the same reason
      `solving` is: the shortcuts that change page live up here. */
  const [timerBusy, setTimerBusy] = useState(false);

  function updateSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  function updateTimerSettings(next: TimerSettings) {
    setTimerSettings(next);
    saveTimerSettings(next);
  }

  // Written straight through rather than debounced: dragging a slider is a
  // handful of writes, and losing the last one on a reload is worse than the
  // writes are expensive.
  function updateAppearance(next: Appearance) {
    setAppearance(next);
    saveAppearance(next);
    applyAppearance(next);
  }

  function updateKeymap(next: Keymap) {
    setKeymap(next);
    saveKeymap(next);
  }

  // The shortcuts that belong to no one page. The timer's own are in
  // TimerPanel, which is only listening while it is on screen.
  useHotkeys(keymap, {
    goTimer: () => setSection('timer'),
    goStats: () => setSection('stats'),
    goSettings: () => setSection('settings'),
    toggleTopBar: () => updateAppearance({ ...appearance, topBarStowed: !appearance.topBarStowed }),
  }, keymap.enabled && !timerBusy);

  /**
   * Every setting back to stock, and nothing else.
   *
   * Lives here because the settings objects live here — the settings page is
   * handed most of them and has never heard of the buffers. Deliberately does
   * not touch the four *stores*: this is the button for a layout you have made
   * a mess of, not for starting over, and the two should never be one keypress
   * apart from each other.
   */
  function restoreDefaults() {
    updateTimerSettings(DEFAULT_TIMER_SETTINGS);
    updateAppearance(DEFAULT_APPEARANCE);
    updateSettings(DEFAULT_SETTINGS);
    updateKeymap(DEFAULT_KEYMAP);
  }

  useEffect(() => {
    const timer = setTimeout(() => saveStore(store), 400)
    return () => clearTimeout(timer)
  }, [store])

  // The picture is the one setting that can't be applied synchronously, so it
  // arrives a frame late over an already-correct theme rather than as a flash.
  // The object URL is revoked on the way out — the browser holds the whole
  // image alive for as long as one is outstanding.
  useEffect(() => {
    let url: string | null = null
    let stale = false

    void getBackground().then((blob) => {
      if (stale) return
      url = blob ? URL.createObjectURL(blob) : null
      applyBackground(url)
    })

    return () => {
      stale = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [backgroundNonce])

  // Same debounce as the pair store, for the same reason: an alg is typed a
  // character at a time and none of those keystrokes need to hit disk.
  useEffect(() => {
    const timer = setTimeout(() => saveCfopStore(cases), 400)
    return () => clearTimeout(timer)
  }, [cases])

  // The one save worth reporting on. Solves are the only thing here you cannot
  // retype, so a write that fails has to say so rather than leave the app
  // looking like it is recording solves it is quietly dropping.
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = saveTimerStore(timerStore)
      setSaveError(result.ok ? null : result.reason)
    }, 400)
    return () => clearTimeout(timer)
  }, [timerStore])

  function saveEntry(entry: PairEntry) {
    setStore((prev) => {
      const pairs = {...prev.pairs}
      if (isBlankEntry(entry)) delete pairs[entry.code]
      else pairs[entry.code] = {...entry, updatedAt: Date.now() }
      return { ...prev, pairs }
    })
  }

  /** Mirrors saveEntry: a case edited back to blank leaves storage entirely. */
  function saveCase(entry: CaseEntry) {
    setCases((prev) => {
      const next = { ...prev.cases }
      if (isBlankCase(entry)) delete next[entry.id]
      else next[entry.id] = { ...entry, updatedAt: Date.now() }
      return { ...prev, cases: next }
    })
  }

  return (
    <div className={solving ? 'app solving' : 'app'}>
      <div className="app-bg" />

      {/* Stowed, the bar is gone rather than shortened — the point of stowing it
          is the screen it gives back, and a strip left behind is a strip you
          paid for twice. What replaces it is the wordmark alone, floating over
          the content: the thing you pressed to put the bar away, still there to
          bring it back.

          Two wordmarks, one mounted at a time. They carry the same class and so
          the same size, which is the whole reason it is written twice rather
          than moved between parents — a wordmark that shrinks when the bar goes
          reads as the app having gone away. */}
      {appearance.topBarStowed ? (
        <div className="topbar-float">
          <Brand appearance={appearance} onAppearance={updateAppearance} keymap={keymap} />
        </div>
      ) : (
        <header className="topbar">
          <Brand appearance={appearance} onAppearance={updateAppearance} keymap={keymap} />
          <nav className="nav">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                aria-current={section === item.id}
                title={item.action ? withHint(item.label, keymap, item.action) : undefined}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>
      )}

      {saveError && <p className="save-error" role="alert">{saveError}</p>}

      <main className={section === 'timer' ? 'content flush' : 'content'}>
       <div className="content-inner">
        {section === 'bld' && (filling ? (
          <FillMode
            store={store}
            settings={settings}
            onChangeEntry={saveEntry}
            onExit={() => setFilling(false)}
          />
        ) : (
          <PairGrid
            store={store}
            settings={settings}
            onSettings={updateSettings}
            selected={selected}
            onSelect={setSelected}
            onChangeEntry={saveEntry}
            onFill={() => setFilling(true)}
          />
        ))}
        {section === 'cfop' && <CfopPanel store={cases} onChangeEntry={saveCase} />}
        {section === 'timer' && (
          <TimerPanel
            store={timerStore}
            setStore={setTimerStore}
            settings={timerSettings}
            onSettings={updateTimerSettings}
            onSolving={setSolving}
            keymap={keymap}
            onBusy={setTimerBusy}
          />
        )}
        {section === 'stats' && (
          <StatsPage
            store={timerStore}
            settings={timerSettings}
            onSettings={updateTimerSettings}
          />
        )}
        {section === 'settings' && (
          <SettingsPage
            appearance={appearance}
            onAppearance={updateAppearance}
            onBackgroundChanged={() => setBackgroundNonce((count) => count + 1)}
            timer={timerSettings}
            onTimer={updateTimerSettings}
            timerStore={timerStore}
            onTimerStore={setTimerStore}
            onOpenTimer={() => setSection('timer')}
            onRestoreDefaults={restoreDefaults}
            keymap={keymap}
            onKeymap={updateKeymap}
          />
        )}
       </div>
      </main>
    </div>
  );
}