---
paths:
  - "src/data/**"
  - "src/timer/storage.ts"
  - "src/timer/cstimer.ts"
  - "src/timer/events.ts"
  - "src/timer/stats.ts"
  - "scripts/check-cstimer.ts"
---

# Stored data, events and csTimer import

- **Storage goes through `src/data/persist.ts`.** Writes are debounced; it
  flushes on tab hide/close, re-reads another tab's write, and a backup import
  must flush first and then call `announceReplaced`, or the old state is
  written back over the new one (a2244ce).
- **`EVENTS` in `src/timer/events.ts` is the only source of event display
  names.** Its keys (`'333'`) are what's stored, so never rename a key; change
  the display name only (719191e).
- **csTimer `+2` keeps the raw time**; csTimer adds the two seconds only when it
  shows them. An undated csTimer solve must not re-date the session
  (a2244ce, `check-cstimer.ts`).
- **Training solves are their own stats bucket**, never a 3x3 PB (spec
  `docs/specs/2026-10-13-cstimer-port-design.md`).
- **Ported csTimer code is GPL-3.0 and its header credits cs0x7f**, per the
  same spec.
