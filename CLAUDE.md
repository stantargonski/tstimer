# tstimer

A speedcubing timer, BLD memo trainer and CFOP trainer: React 19, Vite,
TypeScript 6.0.3 (pinned, de7db86), no backend, GPL-3.0-or-later. Everything
lives in the browser (localStorage / IndexedDB). Specs are in `docs/specs/`.

**Pushing `main` deploys the live site** (GitHub Pages, `deploy.yml`). Work on
a branch and open a PR; merge only when Stan says to, because a merge
publishes.

## Workflow

- When a task is complete and the tree has changes, commit without asking,
  with a descriptive message, on the current branch (branch first if on
  `main`). Push to `origin`. Open a PR with `gh pr create` if the branch has
  none. This is pre-authorised for this repo. Merging is not.
- Sessions share this checkout. Before committing, check
  `git branch --show-current` is still yours, then `git status`, and commit
  only your own files; never `git add -A` blind. For a long task, use a
  `git worktree` (run `npm ci` in it).
- A bug-fix PR body says **Root cause** and **Lesson** (what a future session
  should know). The lesson also goes into the repo (see Learning loop).
- A hook asks before `gh pr merge` and blocks pushes to `main`
  (`.claude/hooks/guard-main.sh`).
- After a merge: `gh pr merge <n> --merge --delete-branch`, then pull `main`.

## Checks

```sh
npm run check    # node scripts/check-*.ts: cube, algs, scramble, timer, stats, csTimer, keys
npm run lint
npm run build    # tsc -b + vite; `check` does NOT type-check the app
```

`/check` runs all three with filtered output. The deploy runs `check` then
`build`, so a broken alg or type error never reaches the site. A new rule worth
guarding gets a `scripts/check-<name>.ts` and a line in `package.json`'s
`check`, copying the shape of `scripts/check-cube.ts`.

## Where things live

| Path | What's there |
|---|---|
| `src/cube/` | Cube engine, facelets, Speffz letters |
| `src/timer/` | Timer, scrambles (`scramble/`), stats, solve list, csTimer import |
| `src/data/` | localStorage/IndexedDB persistence, backup, snapshots |
| `src/bld/`, `src/cfop/` | The BLD letter-pair trainer and the PLL/CFOP trainer |
| `src/settings/`, `src/keys/`, `src/theme/` | Settings UI, key bindings, theming |
| `scripts/` | The `check-*.ts` scripts, run with Node's TS stripping via `ts-loader.mjs` |
| `docs/` | `specs/` (designs), `guides/` |

- **The BLD helper is Stan's to build.** `docs/guides/bld-helper.md` is the
  guide; don't write it unless he asks.

## Learning loop

When Stan corrects you, a fix needs a second attempt, or a trap costs time,
run `/retro` before finishing. It files the lesson where the next session will
see it:

- **A trap tied to some files:** a line in `.claude/rules/<area>.md`; rules
  load only when matching files are opened. Areas: `timer-data`.
- **Mechanically detectable:** a `scripts/check-*.ts` or a hook, not prose.
- **A procedure:** the matching file in `.claude/commands/` or
  `.claude/skills/`.
- **Stan's personal preferences:** auto memory.

Each rule line says what to do, why, and the commit or date it came from.
Replace or delete a line that a new one contradicts. A hook reminds you of
this after `gh pr create`.

## Compact instructions

When summarising this session, keep: the branch, worktree path, PR numbers;
uncommitted or unpushed changes; decisions Stan made and his corrections;
lessons not yet filed by `/retro`; the exact text of any failing check still
open. Drop passed-check output and file dumps.
