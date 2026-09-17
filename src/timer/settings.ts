import { isEventId, type EventId } from './events';
import type { PanelBox } from './panelFit';

/** What the clock shows while a solve is actually running. */
export type RunningDisplay = 'tenths' | 'seconds' | 'hidden';

/** What clicking the scramble does. */
export type ScrambleClick = 'copy' | 'next' | 'none';

/**
 * Where a solve's time comes from.
 *
 * 'typed' is for a stackmat or any other clock that isn't this one: the time
 * already exists by the time you get here, and the job is only to record it.
 */
export type EntryMode = 'timer' | 'typed';

/** How many of the latest solves the timer's graph draws, in the order its pill
    cycles through them. 0 is the whole session. */
export const GRAPH_SPANS = [12, 50, 100, 0] as const;
export type GraphSpan = (typeof GRAPH_SPANS)[number];

/** Every box that can float over the timer, as the lock list names them. */
export const PANEL_IDS = ['scramble', 'stats', 'list', 'preview', 'graph'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export interface TimerSettings {
  schemaVersion: 2;
  /** How long space must be held before the timer arms. */
  holdMs: number;
  decimals: 2 | 3;
  /**
   * How many digits a *typed* time's fraction carries.
   *
   * Separate from `decimals`, which is only how a time is drawn. This decides
   * what the digits you type mean: at two places "1234" is 12.34, at three it
   * is 1.234. A stackmat quotes hundredths and most phone timers quote
   * milliseconds, and reading one as the other is wrong by a factor of ten on
   * every solve — so it is the user's to say, not the display's to imply.
   */
  typedDecimals: 2 | 3;
  /**
   * Precision of the *live* readout only. The solve is always recorded at full
   * precision — this is about not watching the hundredths tick over mid-solve.
   */
  runningDisplay: RunningDisplay;
  /** WCA 15-second inspection. Blindfolded events and FMC ignore it regardless. */
  inspection: boolean;
  scrambleClick: ScrambleClick;
  entryMode: EntryMode;
  showScramble: boolean;
  /** The event dropdown above the scramble. Off leaves the scramble and its
      last / next buttons exactly where they were. */
  showEventPicker: boolean;
  /** The whole row above the scramble: the event dropdown and last / next.
      Off leaves the scramble itself on screen. */
  showScrambleHead: boolean;
  showSolveList: boolean;
  showStats: boolean;
  showAverages: boolean;
  /** The gap to the solve before, beside the clock — (-2.43) in green, (+1.07) in red. */
  showDelta: boolean;
  showCubeNet: boolean;
  /**
   * Start the preview closed on every blindfolded scramble.
   *
   * A picture of the scramble is the one thing a blindfolded solve is not
   * allowed to look at, so it is closed by default — but only for those events.
   * The rail's preview button still opens it, for the scramble on screen only,
   * and `showCubeNet` is left alone, so switching back to a sighted event brings
   * the preview straight back without touching a setting.
   */
  hideBldPreview: boolean;
  hideUiWhileRunning: boolean;
  /** Drop the panel fill and border behind the scramble bar / the rail, so each
      sits straight on the background instead of in a box of its own. */
  flatScramble: boolean;
  flatSidebar: boolean;
  /** Scramble in a monospaced face, so the moves line up in columns. */
  monoScramble: boolean;
  /**
   * The clock and the scramble, as a percentage of their stock size.
   *
   * Percentages rather than fractions because `readTimerSettings` rounds every
   * number it reads, which would flatten 1.25 to 1. They multiply the sizes the
   * stylesheet already computes rather than replacing them, so both still scale
   * with the window and with the app-wide text size.
   */
  clockScale: number;
  scrambleScale: number;
  /** The rail, collapsed out of the way. Left in the timer's settings rather
      than the appearance ones because it is a part of the timer, not of the app. */
  railStowed: boolean;
  /** The docked sidebar's width, as last dragged. Also the width of the stats
      when they sit beside the scramble bar on their own. */
  railWidth: number;
  /** How tall the stats are in the sidebar when the solve list shares it, as
      last dragged — or null for as tall as they need. */
  railSplit: number | null;
  /** The scramble preview panel's size, as the user last dragged it. */
  previewWidth: number;
  previewHeight: number;
  /**
   * Where the preview sits, as a gap from the right and bottom edges of the
   * timer. Measured from that corner rather than from the top-left because that
   * is where it starts and where it stays put when the window is resized.
   */
  previewRight: number;
  previewBottom: number;
  /** The small graph of the active session that floats over the timer. */
  showGraph: boolean;
  graphSpan: GraphSpan;
  /** The graph panel's size and position, kept the same way as the preview's. */
  graphWidth: number;
  graphHeight: number;
  graphRight: number;
  graphBottom: number;
  /** The session stats and the solve list, taken out of the sidebar into boxes
      of their own. The solve list floats as a compact version of itself. */
  statsFloating: boolean;
  listFloating: boolean;
  /**
   * Where the two floating sidebar parts were last put, or null for never. A
   * box that has never been put anywhere is drawn at the top-left of the space
   * beside the sidebar, worked out from the window it opens on — which a fixed
   * default measured from the bottom-right corner could not be.
   */
  statsBox: PanelBox | null;
  listBox: PanelBox | null;
  /** The scramble out of the bar across the top, into a box of its own. Its
      height is always what the scramble needs; only its width and place are kept. */
  scrambleFloating: boolean;
  scrambleBox: PanelBox | null;
  /** The floating boxes pinned where they are: no moving, no resizing. */
  lockedPanels: PanelId[];
  /** Whether the floating stats box is as tall as what is in it. Off from the
      first time its height is dragged by hand. */
  statsFitHeight: boolean;
  /** Whether the floating boxes pull to edges and to each other's sizes. */
  snapPanels: boolean;
  /** How many cubes a multi-blind attempt is for. */
  mbldCount: number;
  /**
   * Which events the stats page quotes an all-time best single for, in the order
   * they are shown. Yours rather than the app's: the three it used to hardcode
   * were the three most people practise, which is no comfort at all if you are
   * the one practising Square-1.
   */
  benchEvents: EventId[];
  /**
   * The same, for the strip quoting an all-time best ao5.
   *
   * A list of its own rather than a second reading of `benchEvents`: the events
   * you would quote a single for are not always the ones you have enough solves
   * in to have an average worth quoting, and the two strips sitting one above
   * the other made that impossible to say.
   */
  benchAo5Events: EventId[];
}

/**
 * How many events the best-single strip will hold.
 *
 * The strip is one line, and the figures are set large because they are the ones
 * you would quote someone. Past six the labels start colliding on a laptop, and
 * the honest fix is a limit rather than type that shrinks until it is decorative.
 */
export const BENCH_MAX = 6;

export const DEFAULT_BENCH_EVENTS: EventId[] = ['333', '222', '444'];

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  schemaVersion: 2,
  holdMs: 400,
  decimals: 2,
  typedDecimals: 2,
  runningDisplay: 'tenths',
  inspection: false,
  scrambleClick: 'copy',
  entryMode: 'timer',
  showScramble: true,
  showEventPicker: true,
  showScrambleHead: true,
  showSolveList: true,
  showStats: true,
  showAverages: true,
  showDelta: true,
  showCubeNet: true,
  hideBldPreview: true,
  hideUiWhileRunning: true,
  flatScramble: false,
  flatSidebar: false,
  monoScramble: false,
  clockScale: 100,
  scrambleScale: 100,
  railStowed: false,
  railWidth: 300,
  railSplit: null,
  previewWidth: 320,
  previewHeight: 268,
  previewRight: 16,
  previewBottom: 16,
  showGraph: false,
  graphSpan: 50,
  graphWidth: 320,
  graphHeight: 150,
  // Just left of where the preview starts (16 + 320 + a 12px gap), so opening
  // both doesn't stack one on the other.
  graphRight: 348,
  graphBottom: 16,
  statsFloating: false,
  listFloating: false,
  statsBox: null,
  listBox: null,
  scrambleFloating: false,
  scrambleBox: null,
  lockedPanels: [],
  statsFitHeight: true,
  snapPanels: true,
  mbldCount: 3,
  benchEvents: DEFAULT_BENCH_EVENTS,
  benchAo5Events: DEFAULT_BENCH_EVENTS,
};

export const TIMER_SETTINGS_KEY = 'timer.settings.v1';

/** Every settings schema this build reads. See TIMER_STORE_VERSIONS on the rule. */
export const TIMER_SETTINGS_VERSIONS = [1, 2];

export const PREVIEW_MIN = 200;
export const PREVIEW_MAX = 680;

/** How far off the edge the preview may be dragged. Enough stays on screen to
    grab it again. */
export const PREVIEW_MARGIN = -40;

/** How small and large the graph panel may be dragged. Shorter than the preview
    allows, because a strip of graph still reads where a strip of cube doesn't. */
export const GRAPH_MIN_WIDTH = 200;
export const GRAPH_MAX_WIDTH = 680;
export const GRAPH_MIN_HEIGHT = 90;
export const GRAPH_MAX_HEIGHT = 480;

/** How small and large the floating stats and solve list may be dragged. */
export const FLOAT_MIN_WIDTH = 180;
export const FLOAT_MAX_WIDTH = 680;
export const FLOAT_MIN_HEIGHT = 100;
export const FLOAT_MAX_HEIGHT = 900;

/** The size a floating stats box and solve list open at. */
export const STATS_FLOAT = { width: 260, height: 200 };
export const LIST_FLOAT = { width: 260, height: 320 };
/** The shortest the floating list is drawn to stay under the clock: its title,
    picker and tools, the column heads and about three times. */
export const LIST_FIT_MIN_HEIGHT = 250;

/** How narrow and wide the floating scramble may be dragged, and the width it
    opens at. Wider than the other boxes allow: a megaminx scramble is seven
    long rows. Its height follows the scramble, so the floor is one line's worth. */
export const SCRAMBLE_FLOAT_MIN_WIDTH = 240;
export const SCRAMBLE_FLOAT_MAX_WIDTH = 1600;
export const SCRAMBLE_FLOAT_MIN_HEIGHT = 40;
export const SCRAMBLE_FLOAT_WIDTH = 560;

/** How narrow and wide the docked sidebar may be dragged, and the least of it
    the stats may be given when they share it with the list. */
export const RAIL_MIN = 240;
export const RAIL_MAX = 560;
export const RAIL_SPLIT_MIN = 80;

export const MBLD_MIN = 2;
export const MBLD_MAX = 60;

/** How far the clock and the scramble may be scaled, as a percentage. Small
    enough to fit a phone in landscape, large enough to read across a room. */
export const SCALE_MIN = 60;
export const SCALE_MAX = 200;

export function loadTimerSettings(): TimerSettings {
  try {
    const raw = localStorage.getItem(TIMER_SETTINGS_KEY);
    return raw ? readTimerSettings(JSON.parse(raw)) : DEFAULT_TIMER_SETTINGS;
  } catch {
    return DEFAULT_TIMER_SETTINGS;
  }
}

/**
 * Settings out of an untrusted blob — a saved one, or one out of a backup file
 * someone hand-edited. Every field is clamped rather than trusted, and anything
 * unreadable falls back to its default, so this cannot fail: the worst case is
 * the stock settings, which is never worse than refusing to start.
 *
 * v1 blobs are read too. Everything v1 had, v2 still has, except `scrambleLength`
 * — which is gone because the event decides how long a scramble is, and a slider
 * that could make a 4x4 scramble eleven moves long was never a setting so much as
 * a way to break your own scrambles.
 */
export function readTimerSettings(input: unknown): TimerSettings {
  try {
    // Deliberately not Partial<TimerSettings>: that types schemaVersion as the
    // literal 2, which makes the v1 check unreachable. Incoming JSON can be any
    // version, so it has to be read as a plain number.
    type Incoming = Omit<Partial<TimerSettings>, 'schemaVersion'> & { schemaVersion?: number };
    const parsed = input as Incoming | null;
    const version = parsed?.schemaVersion;
    if (!parsed || !TIMER_SETTINGS_VERSIONS.includes(version as number)) return DEFAULT_TIMER_SETTINGS;

    // Read before the object because the ao5 strip falls back to it: a blob
    // written before the two strips were separated carries one list, and both
    // should carry on showing what that one list said rather than one of them
    // silently reverting to stock.
    const bench = events(parsed.benchEvents);

    // Field by field rather than a spread, so a key added here later gets its
    // default instead of arriving undefined out of an older saved blob.
    return {
      schemaVersion: 2,
      holdMs: clamp(parsed.holdMs, 0, 2000, DEFAULT_TIMER_SETTINGS.holdMs),
      decimals: parsed.decimals === 3 ? 3 : 2,
      typedDecimals: parsed.typedDecimals === 3 ? 3 : 2,
      runningDisplay: one(
        parsed.runningDisplay,
        ['tenths', 'seconds', 'hidden'],
        DEFAULT_TIMER_SETTINGS.runningDisplay,
      ),
      inspection: bool(parsed.inspection, false),
      scrambleClick: one(
        parsed.scrambleClick,
        ['copy', 'next', 'none'],
        DEFAULT_TIMER_SETTINGS.scrambleClick,
      ),
      entryMode: one(parsed.entryMode, ['timer', 'typed'], DEFAULT_TIMER_SETTINGS.entryMode),
      showScramble: bool(parsed.showScramble, true),
      showEventPicker: bool(parsed.showEventPicker, true),
      showScrambleHead: bool(parsed.showScrambleHead, true),
      showSolveList: bool(parsed.showSolveList, true),
      showStats: bool(parsed.showStats, true),
      showAverages: bool(parsed.showAverages, true),
      showDelta: bool(parsed.showDelta, true),
      showCubeNet: bool(parsed.showCubeNet, true),
      hideBldPreview: bool(parsed.hideBldPreview, true),
      hideUiWhileRunning: bool(parsed.hideUiWhileRunning, true),
      flatScramble: bool(parsed.flatScramble, false),
      flatSidebar: bool(parsed.flatSidebar, false),
      monoScramble: bool(parsed.monoScramble, false),
      clockScale: clamp(parsed.clockScale, SCALE_MIN, SCALE_MAX, DEFAULT_TIMER_SETTINGS.clockScale),
      scrambleScale: clamp(
        parsed.scrambleScale, SCALE_MIN, SCALE_MAX, DEFAULT_TIMER_SETTINGS.scrambleScale,
      ),
      railStowed: bool(parsed.railStowed, false),
      railWidth: clamp(parsed.railWidth, RAIL_MIN, RAIL_MAX, DEFAULT_TIMER_SETTINGS.railWidth),
      railSplit: typeof parsed.railSplit === 'number'
        ? clamp(parsed.railSplit, RAIL_SPLIT_MIN, 4000, RAIL_SPLIT_MIN)
        : null,
      previewWidth: clamp(
        parsed.previewWidth, PREVIEW_MIN, PREVIEW_MAX, DEFAULT_TIMER_SETTINGS.previewWidth,
      ),
      previewHeight: clamp(
        parsed.previewHeight, PREVIEW_MIN, PREVIEW_MAX, DEFAULT_TIMER_SETTINGS.previewHeight,
      ),
      // Clamped generously rather than to the window: this is read before there
      // is a window to measure, and the panel re-clamps itself once mounted.
      previewRight: clamp(parsed.previewRight, PREVIEW_MARGIN, 4000, DEFAULT_TIMER_SETTINGS.previewRight),
      previewBottom: clamp(parsed.previewBottom, PREVIEW_MARGIN, 4000, DEFAULT_TIMER_SETTINGS.previewBottom),
      showGraph: bool(parsed.showGraph, false),
      graphSpan: GRAPH_SPANS.includes(parsed.graphSpan as GraphSpan)
        ? parsed.graphSpan as GraphSpan
        : DEFAULT_TIMER_SETTINGS.graphSpan,
      graphWidth: clamp(
        parsed.graphWidth, GRAPH_MIN_WIDTH, GRAPH_MAX_WIDTH, DEFAULT_TIMER_SETTINGS.graphWidth,
      ),
      graphHeight: clamp(
        parsed.graphHeight, GRAPH_MIN_HEIGHT, GRAPH_MAX_HEIGHT, DEFAULT_TIMER_SETTINGS.graphHeight,
      ),
      graphRight: clamp(parsed.graphRight, PREVIEW_MARGIN, 4000, DEFAULT_TIMER_SETTINGS.graphRight),
      graphBottom: clamp(parsed.graphBottom, PREVIEW_MARGIN, 4000, DEFAULT_TIMER_SETTINGS.graphBottom),
      statsFloating: bool(parsed.statsFloating, false),
      listFloating: bool(parsed.listFloating, false),
      statsBox: box(parsed.statsBox),
      listBox: box(parsed.listBox),
      scrambleFloating: bool(parsed.scrambleFloating, false),
      scrambleBox: box(parsed.scrambleBox, {
        minWidth: SCRAMBLE_FLOAT_MIN_WIDTH,
        maxWidth: SCRAMBLE_FLOAT_MAX_WIDTH,
        minHeight: SCRAMBLE_FLOAT_MIN_HEIGHT,
      }),
      lockedPanels: Array.isArray(parsed.lockedPanels)
        ? PANEL_IDS.filter((id) => (parsed.lockedPanels as unknown[]).includes(id))
        : [],
      statsFitHeight: bool(parsed.statsFitHeight, true),
      snapPanels: bool(parsed.snapPanels, true),
      mbldCount: clamp(parsed.mbldCount, MBLD_MIN, MBLD_MAX, DEFAULT_TIMER_SETTINGS.mbldCount),
      benchEvents: bench,
      benchAo5Events: parsed.benchAo5Events === undefined
        ? bench
        : events(parsed.benchAo5Events),
    };
  } catch {
    return DEFAULT_TIMER_SETTINGS;
  }
}

export function saveTimerSettings(settings: TimerSettings): void {
  localStorage.setItem(TIMER_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * A list of event ids out of an untrusted blob: unknown ids dropped, duplicates
 * dropped, and never longer than the strip can hold. An empty list is allowed —
 * that is someone who wants the strip gone, not a broken setting — but a value
 * that isn't a list at all falls back to the stock three.
 */
function events(value: unknown): EventId[] {
  if (!Array.isArray(value)) return DEFAULT_BENCH_EVENTS;

  const out: EventId[] = [];
  for (const item of value) {
    if (isEventId(item) && !out.includes(item)) out.push(item);
    if (out.length === BENCH_MAX) break;
  }
  return out;
}

/**
 * A floating box's size and place out of an untrusted blob, or null — which is
 * also what a box that was never moved is saved as. Any number that isn't one
 * makes the whole box null rather than half of one: a box put back at the top
 * of the column is a better answer than a box with no width.
 */
function box(
  value: unknown,
  { minWidth = FLOAT_MIN_WIDTH, maxWidth = FLOAT_MAX_WIDTH, minHeight = FLOAT_MIN_HEIGHT } = {},
): PanelBox | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<keyof PanelBox, unknown>>;
  const read = {
    width: clamp(raw.width, minWidth, maxWidth, NaN),
    height: clamp(raw.height, minHeight, FLOAT_MAX_HEIGHT, NaN),
    right: clamp(raw.right, PREVIEW_MARGIN, 4000, NaN),
    bottom: clamp(raw.bottom, PREVIEW_MARGIN, 4000, NaN),
  };
  return Object.values(read).every(Number.isFinite) ? read : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function one<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
