# Client notes — the catalog, threads, the tray, and what the record reads

Everything a coach writes about a client is a note in `journalEntries`, read once per client by `useClientJournal` (`src/hooks/`). This folder decides how those notes are grouped, filed, shown and closed. Read the file headers in this order: `note-catalog.ts` (the seven categories, "capture now, tag at teardown"), `threads.ts` (a note is a thread; the three zones are derived, never set), `mattering.ts` (when a note matters), `dismissals.ts` ("no need to remind me").

This README was started in the client codex round (Sep 2026, phase 7) with the pieces below; the Notes page phase adds the page itself.

## `mattering.ts` — when a note matters, and when its window has ended

`mattersOn(entry, day)` is "does this note matter today". `windowEnded(entry, today)` is a different question — **has its window run out** — and the two are not opposites: a note whose start is pushed ahead does not matter yet, but it has not ended. The entry card used `!mattersOn` and read "Ended —" on notes that had not begun. `windowEnded` is true only for a range whose last day has gone by or a one-off day that has passed; never for an "always" note, a yearly day, or a closed note.

## `record-selectors.ts` — every note selection the record makes, once

The profile's Notes & Profile tab (the codex) has seven pages, and five of them talk about notes. Each selection lives here once, over the tab's ONE journal load, so the pages can never disagree and switching pages reads nothing.

| Selector | Who reads it | What it keeps |
| --- | --- | --- |
| `notesOnRecord` | Notes | `listed` (the three zones), `unfiled` (the To-file tray), `lifeSettled` (older life notes FORD shows). The five profile fields the record edits elsewhere are left out. Settled life notes stay on Notes until the FORD page carries them (`lifeOnFord`). A note is settled only if `olderLifeNotesByPillar` places it (`isOlderLifeNote`, one test for both), so a `client.events` copy or an orphaned update stays on Notes — nothing falls between the two pages. |
| `notesSummary`, `notesTabMeta`, `notesSummarySentence` | the sub-toggle, the Overview | Counts by zone, and the To-file tray (`notesSummary` takes `notesOnRecord`'s result whole, so the tray cannot be left out). Critical is the briefing's own count. "2 to file", not "none yet", when the only notes wait for a category. Nothing while loading; "couldn't load", never "none yet", after a failed read. |
| `whoOf`, `shortDay`, `threadRowMeta`, `closeWordsOf` | every row and card | "Jess · Nov 3 · closed Nov 7". "All healed up" / "It's back" for an injury or incident only; everything else closes and reopens. |
| `briefingStatusOf` | Notes' cards | On your next briefing · hushed by you · from a date · gone quiet after three weeks. From the hook's own `criticalEntries` / `headsUpEntries`, so the record and the briefing agree. |
| `criticalLineOf`, `hiddenCriticalThreads` | the critical line | See below. |
| `howToCoachThreads` | Goals & Focus | Live Preference and Coaching-tip notes by **kind** — never by category, which files every legacy session wrap-up under Preference. Focus check-ins stay on their focus. |
| `injuryThreads` | Body & Pulse | Injury notes by category (a surgery written as a life note included), optionally with incidents; the medical-history fields are left to Body. |
| `threadsByMachine` | Body & Pulse → On our floor | Every open or standing note on each machine, loudest first. No focus check-ins; an unfiled note counts. |
| `olderLifeNotesByPillar`, `LIFE_CATEGORY_PILLAR` | FORD | Birthday and Anniversary → Family, Vacation → Recreation, the rest unplaced. The `client.events` rows FORD already draws are left out. |
| `fordDoorCount` | Notes' "Life · in FORD" door | FORD's own count once read; while it loads, the client document's COUNTS (never its text) plus the `client.events` rows FORD adds, so the number does not jump when FORD arrives; `null` — not 0 — when unknown or when the reader cannot open FORD. |

Pure: no React, no Firestore, no clock of its own. `record-selectors.test.ts` runs under `TZ=America/New_York`.

## `CriticalLine.tsx` — one red line for a critical note

"Critical · Leg Press: stop at 90° at the bottom turn." The codex draws a critical note in full once, on Notes, and this line under the bar on every other page (and on Notes when a filter hides one).

- It uses the briefing's selection (`criticalEntries`: critical, unresolved, mattering today) and **ignores dismissals** — hushing quietens one trainer's briefing; the record never hides a note.
- **Whole sentences, never cut, never "…"** (`firstSentences(body, 90)` from `src/lib`); the line wraps, and the machine is named in full.
- `failed` says "Notes couldn't be loaded, so a critical note may be missing." instead of drawing nothing — neutral, not crimson, because it is not a critical note.
- Notes owns it; it imports nothing from the codex. Its stylesheet (`critical-line.css`, `--eq-*` tokens) and the selectors are on the codex's scale test list, so its text stays at 14 and 12px and nothing in it is clipped.
