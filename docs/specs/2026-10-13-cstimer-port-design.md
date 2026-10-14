# Porting csTimer's scrambles and stats tools

Status: proposed, 2026-10-13
Covers csTimer features #8–#11 and #20–#26 from the audit list. #17 (BLD
helper) is built by Stan; the guide is `docs/guides/bld-helper.md`.

## Problem

tstimer's scrambles are WCA-only and, outside 2x2, random-move. csTimer users
also expect training scrambles (OLL, PLL, EG…), configurable averages, and
per-solve notes, plus ways to slice and manage sessions. Without them, a csTimer
user switching over loses the tools they practise with.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Where solvers come from | Port csTimer's to TypeScript | Proven, matches csTimer's subsets exactly. csTimer is GPL-3.0 and tstimer is GPL-3.0-or-later, so the ported files are GPL-3.0 and say so in their header, crediting cs0x7f. |
| Training solves vs PBs | Separate | A session picks a *scramble type* under its event. Training solves are their own stats bucket, so a 3-second OLL never becomes a 3x3 PB. |
| Megaminx | Stays WCA random-move | The WCA itself scrambles Megaminx random-move. Only Megaminx LL training is added. |
| Order | Stats and data first | Phase 1 needs no solver and ships quick wins. |

## Phases

Each phase is its own PR and leaves `npm run check`, lint and build green.

### Phase 1: stats and data (#20–#26)

**#20 Custom averages.** A timer setting `averages: AverageSpec[]`, where an
`AverageSpec` is `{ kind: 'ao' | 'mo', size: number }`.
- Default `[ao5, ao12, ao100]`, which matches today's behaviour.
- At most 6 entries; size from 3 to 1000.
- Edited in Settings → timer → stats as a list of chips. Typing `ao50` or `mo3`
  adds one; × removes one.
- A setting `trimPercent` (0–20, default 5) replaces the fixed 5% in
  `trimCount`.
- `trimCount` keeps the WCA rule: any ao under 20 always trims exactly one each
  end, whatever `trimPercent` says.
- `mo` sizes trim nothing.
- The rail table, SummaryTiles, the session graph's lines and AverageDetail all
  read this list instead of the hard-coded `[5, 12, 100]`.
- Split events keep hiding the longer ones, as now. Multi-blind still shows none.

**#21 Daily stats.** A "by day" card on the Stats page, for the selected
session and time window.
- One row per day with solves: date, solve count, best, mean, best ao5 and time
  spent.
- Newest first, 30 days at a time, with a "show more" button.
- Built on the existing `dayKey`/`dayCounts`, so it uses local days.

**#22 Stats across sessions.** A "sessions" card on the Stats page.
- One row per session: name, event and type, solves, best, best ao5, best
  ao12, mean.
- Every column header sorts the table; clicking again reverses it. DNF and "—"
  sort last.
- Clicking a row makes that session the one the page shows.

**#23 Stats for a range.** In the solve list, shift-click a second row to
select every solve between the two.
- A bar appears: "N solves selected · mean · avg · open". The avg uses the
  #20 trim rule.
- "open" shows the range in the existing AverageDetail, with copy and CSV.
- Escape or clicking elsewhere clears the selection.
- A plain click keeps today's behaviour.

**#24 Comments.**
- `Solve.comment?: string`, at most 200 characters and cleaned like names.
  Absent rather than an empty string.
- Edited in the solve's expanded row in the solve list. Shown there and in
  AverageDetail's text and CSV.
- csTimer import reads csTimer's comment slot, which `readSolve` skips today.
- #26 writes it back out.
- Storage reads it without a schema bump: missing fields default.

**#25 Merge, split and sort sessions.** A "sessions" sub-tab under Settings →
data lists every session, with:
- **Order**: ↑/↓ per row, plus sort buttons by name, newest, most solves and
  last solved. The order is the array order in the store, which already exists.
- **Merge**: a "merge into…" select per row. It moves every solve into the
  target and keeps the target's name, event and type. Solves keep their own
  `event` (they already store it). Ids that collide are nudged by +1ms, as
  csTimer import does. The source session is deleted. It goes through the
  existing deleted-solve undo, extended to restore a whole session.
- **Split**: from a solve's expanded row, "split session here". Every solve
  from that one on moves to a new session named "<name> (2)", with the same
  event and type. It is undoable the same way.

**#26 Export to csTimer.** "export for csTimer" in Settings → data.
- It writes the format `parseCsTimer` reads:
  - `sessionN` arrays of `[[penalty, ms, ...phases], scramble, comment, seconds]`.
  - `properties.sessionData`, holding each session's name and the `scrType`
    for its event and type.
- csTimer stores the raw time with the penalty beside it (verified against a
  real export), and this writes it the same way.
- A memo split becomes one phase.
- Multi-blind results have no csTimer field, so they go in the comment as
  `mbld 8/10`.

**#17 guide.** `docs/guides/bld-helper.md`, already written alongside this spec.

### Phase 2: solvers and random-state (#8)

New folder `src/solver/`, ported from csTimer with types added:
- `mathlib.ts`
- `min2phase.ts`, a 3x3 two-phase solver
- `sq1.ts`, csTimer's `scramble_sq1_new.js`
- `pyraminx.ts` and `skewb.ts`, csTimer's optimal solvers, as `twoByTwo.ts`
  already is for 2x2

Solvers run in a module Web Worker, `src/timer/scramble/worker.ts`, created
with `new Worker(new URL(...), { type: 'module' })`.
- `scrambleFor` stays synchronous for every scramble it can make instantly.
- The queue in TimerPanel asks the worker for the next two scrambles ahead of
  time, so a random-state scramble is normally ready before it's needed.

Random-state replaces random-move for:
- 3x3, OH, 3BLD (with its orientation suffix kept) and FMC (with the R' U' F
  brackets kept).
- Multi-blind, each cube.
- Pyraminx (plus random tips), Skewb and Square-1.

**Edge states**
- Before the worker's tables are built (first scramble after load), WCA
  events show the random-move scramble they use today, exactly as 2x2 does now.
- If the worker can't start, the timer stays on random-move and a single line
  under the scramble says "random-move scrambles: this browser couldn't build
  the solver".

**Tests:** extend `check-scramble`:
- For each random-state event, apply 200 scrambles in the engine and confirm
  each reaches a valid, unsolved state.
- 3x3: the engine state after the scramble, solved again by min2phase, comes
  back in 22 moves or fewer.
- Pyraminx and Skewb: the mean optimal length over 2000 samples matches the
  known distribution, as the 2x2 check does now.
- Square-1: the existing slash-legality check runs on random-state scrambles.

### Phase 3: training scrambles (#9, #10, part of #11)

**Model**
- `Session.scrambleType?: string` and `Solve.scrambleType?: string`, absent
  meaning the WCA scramble.
- Stats group by `(event, scrambleType)`.
  - Event PBs, bench cards and the by-event table only count solves with no
    type.
  - Each training type gets its own row in the by-event table, e.g.
    "3x3 · PLL".

**UI**
- A "type" select beside the event picker, shown only when the event has
  training types. It's the same slot the relay picker and multi-blind count use.
- Changing it restarts the queue, the same way changing event does.

**Types, by csTimer id**
- 3x3: `edges` `corners` `ll` `lsll2` `f2l` `zbll` `zzll` `zbls` `ttll` `eols`
  `wvls` `vls` `lse` `cmll` `cll` `coll` `ell` `pll` `oll` `2gll` `sbrx` `half`
  `333drud` `3gen_F` `3gen_L` `2gen` `2genl` `RrU` `roux` `mt3qb` `mteole`
  `mttdr` `mt6cp` `mtl5ep` `mtcdrll` `easyc` `easyxc` `eoline` `eocross`,
  ported from `scramble_333_edit.js`. They are generated as a random state
  within the subset, then solved by min2phase.
- 2x2: `222eg` `222eg0` `222eg1` `222eg2` `222tc` `222tcp` `222tcn` `222lsall`
  `222nb`, from `2x2x2.js`.
- Pyraminx: `pyrl4e` `pyrnb` `pyr4c`; Skewb: `skbnb`, from `pyraminx.js` and
  `skewb.js`.
- Case filters: csTimer lets you pick which OLL/PLL/ZBLL cases come up. Ported
  for `oll` `pll` `coll` `zbll` `cmll` as a "cases" multi-select under the type
  select. Default is all cases, at csTimer's probabilities.

**Edge states:** a training type has no random-move fallback. Until the worker
is ready the scramble area reads "preparing scrambles…". If the worker failed,
the type select is disabled with that reason.

**Tests**
- For each type, 100 scrambles.
- Each one applied to solved has to leave the cube in the subset. For example,
  `pll`: F2L and OLL solved; `edges`: every corner home and oriented.

### Phase 4: 4x4 and Megaminx training (rest of #11)

- Port `scramble_444.js` (the 4x4 solver and its subset functions) and
  `mgmlsll.js`.
- 4x4 types: Yau `444ud3c`, Hoya `444rlda` and `444rlca`, `444ppll`, `444ell`,
  `444cto`.
- Megaminx: `mgmll`.
- Same worker, model and UI as Phase 3.
- Tests: each scramble applied in the NxN engine leaves the stated pieces
  solved. Megaminx has no engine here, so Megaminx LL is checked by csTimer's
  own state model, ported with it.

## Out of scope

- Random-state Megaminx.
- 4x4 random-state for WCA 4x4 (stays random-move).
- Bluetooth, Stackmat, the virtual cube, solvers shown to the user (cross,
  EOLine), online battles, sync and translations.
- Building #17. Stan writes it.

## Risks

- **Size.** min2phase's tables take about 1s and a few MB to build. They live in
  the worker, never block the clock, and are built once per page load.
- **Porting errors.** Every ported solver is checked against our own engine
  rather than trusted. That is the same pattern that caught the Square-1 bug.
