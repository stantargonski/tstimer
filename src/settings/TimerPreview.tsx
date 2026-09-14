import type { CSSProperties } from 'react'
import { formatTime } from '../timer/format'
import { DEFAULT_TIMER_SETTINGS, type TimerSettings } from '../timer/settings'

/**
 * What the timer will look like, shown next to the switches that change it.
 *
 * Deliberately built from the timer's own class names inside a scaled wrapper,
 * rather than from a set of preview-only styles. A mock with its own stylesheet
 * starts out looking like the timer and drifts from it the first time either one
 * is touched; this one cannot drift, because it is the same CSS.
 */
export default function TimerPreview({ settings }: { settings: TimerSettings }) {
  const clock = settings.runningDisplay === 'hidden'
    ? 'solve'
    : formatTime(12_340, settings.decimals)

  return (
    <div className="timer-preview" aria-hidden="true">
      {/* The two size multipliers are set here rather than read off the document,
          so stepping the control moves the mock as you press it instead of after
          it is saved. The wrapper is already scaled by a transform, so the mock's
          clock is scaled twice — which is what makes it a preview of the
          proportion rather than of the size. */}
      <div
        className="timer-preview-scale"
        style={{
          '--clock-scale': settings.clockScale / 100,
          '--scramble-scale': settings.scrambleScale / 100,
        } as CSSProperties}
      >
        {/* `railStowed` is deliberately not honoured: this shows how the timer is
            styled, and a preview of an absent rail shows nothing at all. */}
        <div className="timer-frame">
          {(settings.showSolveList || settings.showStats) && (
            <aside className={settings.flatSidebar ? 'timer-rail flat' : 'timer-rail'}>
              {settings.showStats && (
                <div className="rail-stats">
                  <table className="stats">
                    <tbody>
                      <tr><th scope="row">ao5</th><td>12.88</td></tr>
                      <tr><th scope="row">ao12</th><td>13.20</td></tr>
                      <tr><th scope="row">ao100</th><td>13.64</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
              <div className="rail-head">
                <span className="session-select">3x3</span>
              </div>
              {settings.showSolveList && (
                <div className="rail-list">
                  <ol className="solve-list">
                    {[12.34, 13.91, 11.08, 14.62, 12.77].map((time, index) => (
                      <li key={time}>
                        <span className="solve-row">
                          <span className="solve-n">{5 - index}</span>
                          <span className="solve-t">{time.toFixed(settings.decimals)}</span>
                          <span className="solve-ao">12.88</span>
                          <span className="solve-ao">13.20</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="rail-tools">
                <span className="rail-tool">🏁 comp sim</span>
                <span className="rail-tool">🧊 preview</span>
              </div>
            </aside>
          )}

          <div className="timer-main">
            {settings.showScramble && (
              <div className={settings.flatScramble ? 'scramble-bar flat' : 'scramble-bar'}>
                <div className="scramble-head">
                  {settings.showEventPicker && <span className="event-picker">3x3</span>}
                  <span className="scramble-nav">
                    <span>‹ last</span>
                    <span>next ›</span>
                  </span>
                </div>
                <div className="scramble-body">
                  <span className={settings.monoScramble ? 'scramble-text mono' : 'scramble-text'}>
                    {"D2 F' U R2 B L' F2 U'".split(' ').map((move, index) => (
                      <span key={index}>{move}</span>
                    ))}
                  </span>
                </div>
              </div>
            )}

            <div className="timer-stage">
              <div className="stage-clock">
                <div className="clock-line">
                  <div className="clock">{clock}</div>
                  {settings.showDelta && <span className="clock-delta good">(-1.28)</span>}
                </div>
                {settings.showAverages && (
                  <div className="averages">
                    <span>ao5 <b>12.88</b></span>
                    <span>ao12 <b>13.20</b></span>
                  </div>
                )}
              </div>
            </div>

            <div className="timer-dock">
              {/* Pinned to the size and corner the panel ships at, rather than to
                  wherever you last dragged the real one. The mock is a fixed
                  0.3 scale, so mirroring the setting made this box grow with it
                  until it covered the clock — and there is no control for that
                  size on this page, so there was never anything here to preview.
                  The offsets are pinned for the same reason: they clamp to 4000
                  and the mock clips, so a panel dragged off to one side used to
                  put this box outside the frame entirely and make the switch
                  below look broken. */}
              {settings.showCubeNet && (
                <div
                  className="scramble-preview"
                  style={{
                    width: DEFAULT_TIMER_SETTINGS.previewWidth,
                    height: DEFAULT_TIMER_SETTINGS.previewHeight,
                    right: DEFAULT_TIMER_SETTINGS.previewRight,
                    bottom: DEFAULT_TIMER_SETTINGS.previewBottom,
                  }}
                >
                  <span className="preview-title">
                    3x3 scramble
                    <span className="preview-reset">⟲</span>
                  </span>
                  <div className="preview-body"><div className="preview-stub" /></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
