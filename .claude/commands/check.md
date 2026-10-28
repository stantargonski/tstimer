---
description: Run tstimer's full gate (the check scripts, lint, then the type-checked build)
allowed-tools: Bash(npm run:*)
---

Run the same steps the deploy workflow runs, plus lint, and report pass or
fail. Show only failures and the last few lines of each step.

```sh
npm run check 2>&1 | tail -20
npm run lint 2>&1 | tail -20
npm run build 2>&1 | tail -20
```

`check` does not type-check the app; `build` runs `tsc -b`. Don't skip it
(719191e). If a check script fails, fix the code, not the script, unless the
script itself is wrong.
