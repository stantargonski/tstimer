/**
 * Which settings tab, and which group in each, was open last.
 *
 * Module state rather than component state because the settings page unmounts
 * every time you go back to the timer, and landing on the first tab again after
 * checking one setting is the annoyance this is here to spare. Not persisted:
 * a fresh visit starting at the top is fine.
 */
export type SettingsTab = 'appearance' | 'timer' | 'data'

let tab: SettingsTab = 'appearance'
let subs: Record<SettingsTab, string> = { appearance: 'theme', timer: 'layout', data: 'backup' }

export function lastTab(): { tab: SettingsTab; subs: Record<SettingsTab, string> } {
  return { tab, subs }
}

export function rememberTab(nextTab: SettingsTab, nextSubs: Record<SettingsTab, string>): void {
  tab = nextTab
  subs = nextSubs
}
