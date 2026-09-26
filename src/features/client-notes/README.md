# Client notes — the catalog, threads, the tray, and what the record reads

Everything a coach writes about a client is a note in `journalEntries`, read once per client by `useClientJournal` (`src/hooks/`). This folder decides how those notes are grouped, filed, shown and closed. Read the file headers in this order: `note-catalog.ts` (the seven categories, "capture now, tag at teardown"), `threads.ts` (a note is a thread; the three zones are derived, never set), `mattering.ts` (when a note matters), `dismissals.ts` ("no need to remind me").

This README was started in the client codex round (Sep 2026, phase 7) with the pieces below; phase 9 added the Notes page itself (the first section).

## The Notes page — `NotesPage.tsx`, `NotesCatalog.tsx`, `NoteThreadCard.tsx`, `ThreadRow.tsx`

Notes & Profile's second page (client codex, phase 9). The codex's adapter (`client-codex/pages/NotesPage.tsx`) puts it inside the kit's Page; everything it shows is the tab's ONE load — the journal, `notesOnRecord`, this trainer's dismissals — and it opens no listener of its own (there is no fallback `useClientJournal`, so a second one is impossible). Top to bottom:

- **Banners** only when there is something to say: the record hit the read guard rail (`capped`), the index is not deployed (`needsIndex`), or **some notes could not be read** — then it says so, and never "No notes". No amber.
- **The composer, folded behind "Write a note…".** It is drawn but hidden when closed — never unmounted — so Close keeps the words ("Finish your note…"). It takes the cursor when it is OPENED (a tap, or the Overview's "Write a note"), never on mount: the codex mounts hidden pages too.
- **FORD in place.** Choosing FORD / Life in the composer keeps the same box and the same words, hides the loudness and the window, shows the four letters (optional), and "Save to FORD" writes only `clients/{id}/ford` through `createFordEntry`, stamped with `fordStudioIdOf`. A FORD detail holds 2,000 characters (the rule; a note holds 5,000), so a longer box says so and the button waits. A second tap on the chip is a note again, words intact. Only a reader the FORD create rule accepts gets it (`access.fordWritable`: trains at or leads her home studio — phase 19; it was `access.canEdit`, which let an administrator who works elsewhere type a detail the database refused). Anyone else gets the hand-off, in words that fit them: a cross-train visitor, whom FORD refuses altogether, is told only the home studio can read it; a reader who may read FORD but not add to it (`fordReadable` without `fordWritable` — the composer's `fordReadOnly`) is told adding isn't offered, beside an Open FORD that works for them. The quick-note dialog gets the same mode and the same hand-off, on the same test (`codexAccess(...)`). A save that fails keeps the words and says "Not saved — still here, try again" — the composer clears only once a save has landed (`QuickNoteDialog` and the page rethrow so it knows).
- **The To-file tray** (`NoteSweep`). A loud note wears its Loudness pill there: an unfiled critical note waits in the tray, not in Open.
- **One filter row**: a search across every note, its updates and who wrote them (the coach chip row is gone — search finds a coach by name or initials); "All" and the six categories (`NOTES_PAGE_CATEGORIES`), always all six in the same place, counting resolved notes too; and the **"Life · in FORD" door**, with its number only when it is known (`fordDoorCount`). No counts while the notes load, or when some of them could not be read — a count is a claim about every note, and "Injury 0" beside "couldn't be loaded" would be a confident wrong number.
- **The zones, derived, never set**: Open as full thread cards in the briefing's order, two columns once the page is 720px wide, a critical note the whole width; Standing context one line each (`ThreadRow`), opened in place; Resolved folded to its count ("Show the N resolved notes"), then month by month, "closed …" / "ended …".
- **A critical note is drawn once.** "Critical & pinned" is gone; when a chip or a search hides a critical note, `CriticalLine` says so above the zones and "Show it" brings it back.
- **A thread card** (`NoteThreadCard`) is one panel: what kind (glyph and label, neutral ink), the machine in full, how loud (the only colour: crimson Critical, plum Heads up — `LOUDNESS_TONE`), the note, the spine of updates oldest first, who and when (`threadCardMeta`), where it stands with **your** briefing, and "Add an update" plus a close whose words fit (`closeWordsOf`: "All healed up" is for a body). The ⋯ menu holds **Archive, which takes the whole thread** — the root and every update in one batch (`archiveThread` → `archiveJournalEntries`), after an inline confirm — because archiving the root alone left its updates behind as stray notes. An import is read-only and says where it lives.
- **The briefing line**: "On your next briefing." with "No need to remind me"; "You hushed this on your briefing. Only you can see that." with "Show it again"; "On the briefing from Oct 1."; "Off the briefing since Sep 10: a Heads up with no end day is read out for three weeks." Hush and restore write only `noteDismissals/{Auth uid}` and are offered only once the dismissals are read. The record never hides a note: a hushed thread is still drawn, with its way back.
- **Doors into the page** (`notes-intent.ts`): `note-{id}` opens that thread (clearing a filter that hides it, opening its row, unfolding Resolved) and brings it into view; a thread still in the To-file tray brings its tray card into view; `notes-compose` opens the composer; `notes-resolved` unfolds Resolved. The shell hands them over keyed by the move, so each is acted on once, and a door used while the notes load waits for them.
- **The page's own words use the pronoun** (`possessive`), never the name — the header owns the name.

Settled life notes (a birthday, an anniversary) **still show on Notes** in this phase (`notesOnRecord`'s `lifeOnFord` is off); the FORD phase moves them into their pillars and turns it on.

## `mattering.ts` — when a note matters, and when its window has ended

`mattersOn(entry, day)` is "does this note matter today". `windowEnded(entry, today)` is a different question — **has its window run out** — and the two are not opposites: a note whose start is pushed ahead does not matter yet, but it has not ended. The entry card used `!mattersOn` and read "Ended —" on notes that had not begun. `windowEnded` is true only for a range whose last day has gone by or a one-off day that has passed; never for an "always" note, a yearly day, or a closed note.

## `record-selectors.ts` — every note selection the record makes, once

The profile's Notes & Profile tab (the codex) has seven pages, and five of them talk about notes. Each selection lives here once, over the tab's ONE journal load, so the pages can never disagree and switching pages reads nothing.

| Selector | Who reads it | What it keeps |
| --- | --- | --- |
| `notesOnRecord` | Notes | `listed` (the three zones), `unfiled` (the To-file tray), `lifeSettled` (older life notes FORD shows). The five profile fields the record edits elsewhere are left out. Settled life notes stay on Notes until the FORD page carries them (`lifeOnFord`). A note is settled only if `olderLifeNotesByPillar` places it (`isOlderLifeNote`, one test for both), so a `client.events` copy or an orphaned update stays on Notes — nothing falls between the two pages. |
| `notesSummary`, `notesTabMeta`, `notesSummarySentence` | the sub-toggle, the Overview | Counts by zone, and the To-file tray (`notesSummary` takes `notesOnRecord`'s result whole, so the tray cannot be left out). Critical is the briefing's own count. "2 to file", not "none yet", when the only notes wait for a category. Nothing while loading; "couldn't load", never "none yet", after a failed read. |
| `whoOf`, `shortDay`, `threadRowMeta`, `threadCardMeta`, `closeWordsOf` | every row and card | "Jess · Nov 3 · closed Nov 7"; a card names its window only when it has one worth naming ("matters until Oct 3"), and an import says "Read-only · Mindbody account notes … Edit it where it lives." "All healed up" / "It's back" for an injury or incident only; everything else closes and reopens. |
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

## Outside the record — the Hub card's red triangle

A Critical note also marks the client's appointment card on the Hub (AJ, Sep 24 2026 — question 12 of the Sep 20 audit). It lives outside this folder, in `lib/hub-critical-notes.ts` (the rule) and `hooks/useHubCriticalNotes.ts` (one live read of the day's booked clients' Critical notes, thirty to a query), but it reads with this folder's rules: a Critical thread ROOT that `mattersOn` the booking's studio day, and never a thread update. Like `CriticalLine`, it **ignores dismissals**, and a client whose notes could not be read is unknown, never clear. So anything that changes what "a Critical note that matters" means here changes the Hub too, and `hub-critical-notes.test.ts` / `ScheduleBlock.render.test.tsx` will say so.
