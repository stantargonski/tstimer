# Building the BLD helper yourself

The goal: under a 3BLD scramble, show the memo the way you'd trace it, in
letter pairs, using your buffers. If you've made a word for a pair in the 3BLD
tab, show that word too. csTimer calls this the "BLD helper".

This guide gives you the pieces that already exist, the algorithm, the traps,
and how to test it. It doesn't write it for you. Each step ends with something
you can run.

## 1. What you already have

| You need | It's here | What it gives you |
|---|---|---|
| Which sticker is where after a scramble | `src/cube/moves.ts`: `solvedLabels`, `applyAlgLabels` | `labels[position]` = the id (0–53) of the sticker that ended up at `position` |
| How facelets are numbered | the diagram at the top of `src/cube/moves.ts` | U 0–8, R 9–17, F 18–26, D 27–35, L 36–44, B 45–53, each row-major looking straight at the face |
| Speffz letters and pieces | `src/cube/speffz.ts`: `LETTERS`, `CORNERS`, `EDGES`, `pieceOf`, `breakInSticker` | Which letters share a piece, and the sticker you "break into" a piece on |
| Your buffers | `src/settings/defaults.ts`: `Settings.cornerBuffer` (default `E`, the ULB corner), `edgeBuffer` (default `U`, the DF edge) | The letters tracing starts from |
| Your words | the pair store (`store.pairs[code]`), loaded in `App.tsx` | The word for a pair like `AB` |
| The scramble on screen | `TimerPanel.tsx`: `scramble`, and `scrambleText(scramble)` | The string you trace |

Why labels and not colours: a colour can't tell two yellow stickers apart, and
a label can. The comment above `Labels` in `moves.ts` makes the same point.

## 2. The one function you're missing: letter ↔ facelet

Speffz letters run U L F R B D (A–D on U, E–H on L, and so on). The engine's
faces run U R F D L B. That mismatch is the first trap.

On each face, Speffz goes clockwise from the top-left:
- **Corners** are at row/column (0,0), (0,2), (2,2), (2,0), which are facelet
  offsets **0, 2, 8, 6**.
- **Edges** are top, right, bottom, left, which are offsets **1, 5, 7, 3**.

So a letter's facelet is `faceStart(speffzFace) + offset(kind, position on face)`.

**Write:** `cornerFacelet(letter)` and `edgeFacelet(letter)` in a new
`src/bld/helper/facelets.ts`.

**Prove it before going further** with a check, `scripts/check-memo.ts`. Copy
the shape of `scripts/check-cube.ts`, and add it to `npm run check` in
`package.json`. Two things to assert:

1. For every piece in `CORNERS` (and `EDGES`), its stickers' facelets land on
   the faces its name says. UBR's `B, Q, N` should land on U, B and R.
2. Its stickers move together. Apply `R` with `applyAlgLabels`, then find
   where each of the piece's sticker ids went. They must all be on one physical
   piece, which means they're all in one `CORNERS` entry again.

If (2) fails for B or D letters, your offsets for that face are mirrored.
B and D are the faces people get wrong.

## 3. Turning the scramble into labels

3BLD scrambles here end with wide moves (`Rw`, `Fw`, `Uw`). They set a random
orientation, so you can't memo from the colours you happen to see. `moves.ts`
only knows face turns, slices and rotations, so `Rw` won't parse.

On a 3x3, `Rw = L x`: an L turn plus a rotation of the whole cube. Memo is
relative to the centres, and you rotate back to your orientation before you
start. So the rotation doesn't matter and only the L does. Replace:

| Scramble has | Use |
|---|---|
| `Rw`, `Rw'`, `Rw2` | `L`, `L'`, `L2` |
| `Fw`, `Fw'`, `Fw2` | `B`, `B'`, `B2` |
| `Uw`, `Uw'`, `Uw2` | `D`, `D'`, `D2` |

Exercise: convince yourself `Rw` = `L` + `x` by doing both on a real cube.
(The engine agrees: `R M'` and `x L` give identical labels.)

**Write:** `labelsAfter(scramble: string): Labels`. It converts the wide moves,
then calls `applyAlgLabels(solvedLabels(), ...)`.

## 4. Tracing one kind of piece

Do edges first; they have no twist to think about. The loop, in words:

1. **Look at the buffer spot.** Which sticker sits on the buffer's facelet? Its
   home letter is your first target.
2. **Follow it.** Go to that target's facelet, see which sticker sits *there*,
   and write down its letter. Keep going.
3. **Cycle closes.** You come back to the buffer *piece*, on any of its
   stickers. If every piece is home, you're done.
4. **Cycle break.** Otherwise pick an unvisited piece that isn't solved,
   "shoot to" its break-in sticker (`breakInSticker`), and keep tracing from
   there. The cycle ends when you get back to that piece; write its break-in
   letter again.
5. **Pieces already home but turned** go in their own list: edge flips and
   corner twists. `scope.ts` already uses the words `'flip'` and `'twist'`.
6. **Parity:** an odd number of corner targets means parity. Show it; don't
   solve it.

Keep a `visited` set of *pieces*, not letters. Each piece has 2 or 3 letters
and you only visit it once.

**Write:** `traceEdges(labels, buffer: Letter)` and `traceCorners(...)`, each
returning `{ targets: Letter[], flips or twists: Letter[] }`. Keep them pure:
no React, no storage. Then the check can run them in Node.

**Tests to add to `check-memo.ts`:**
- A solved cube gives no targets, no flips and no twists.
- A single turn: trace `U` by hand on paper with your buffers, write the
  answer into the check, then make the code agree. Repeat for `R` and `F2`.
- Any scramble: corner targets plus edge targets is even when there is no
  parity, and odd for both when there is. They always share parity.
- A known algorithm: the T-perm swaps UL/UR and UBR/URF. Trace it and check
  that exactly those letters come out.

## 5. Showing it

- **Pairs:** chunk the targets two at a time. `['A','B','C']` becomes `AB C`.
- **Words:** for each pair, show `store.pairs[pair]?.image` if it isn't blank
  (`PairEntry` in `src/bld/letterPairs/types.ts`).
- **Where it goes:** a small component, e.g. `src/timer/BldHelper.tsx`. Render
  it in `TimerPanel.tsx` beside `ScrambleBanner`, only when `event.split` is
  true and a new setting `showBldHelper` is on.
  - Add the setting the way `hideBldPreview` was added: in `TimerSettings`, in
    its default, in `readSettings`, and as a toggle in `SettingsPage.tsx`.
  - Default it **off**. Memo on screen during a real attempt defeats the
    point, the same reason the preview starts closed for blindfolded events.
- **Buffers:** `App.tsx` holds `settings` (the buffer settings). Pass it down
  to `TimerPanel` the way `keymap` is passed.

## 6. Order of work

1. `facelets.ts` and check (2). Don't move on until it passes.
2. `labelsAfter`, plus a check that a 3BLD scramble from `scrambleFor` parses.
3. `traceEdges` and its tests.
4. `traceCorners`, then twists and parity.
5. The component and setting. Look at it in the browser with a few scrambles
   you've memoed by hand.

When something disagrees with your hand trace, check (2) in step 1 first.
Nine times out of ten it's a mirrored face.
