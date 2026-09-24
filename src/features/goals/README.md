# Goals & Focus — the page of Notes & Profile

Client codex, Sep 2026 (phase 14 of `docs/rounds/2026-09-24-client-codex.md`). The long scroll's Goals and Focus sections were a form — the coach strategy, the why and the goal as input boxes over the focus board. Goals & Focus is now a page of the client codex that **reads first and edits on demand**, three rows as the approved mockup has them (one column under 760px of page width, two from 760 — portrait first):

| Row | Left | Right |
| --- | --- | --- |
| 1 (7fr / 5fr) | **How to coach her** (`HowToCoachCard`) | **Her why** (`HerWhyCard`) |
| 2 (5fr / 7fr) | **Working toward now** (`WorkingTowardCard`) | **Coach focuses** (`components/journal/FocusBoard`) |
| 3 (5fr / 7fr) | **Plans from the team**, with your working notes inside (`relay/notes/SharedNotesCard` + `ClientJotStrip`) | **Reached** (`ReachedShelf`) |

`GoalsPage.tsx` is the page; `client-codex/pages/GoalsPage.tsx` is the thin adapter that feeds it the tab's one load. `goals-page.ts` is the pure half — every sentence the page writes — with `goals-page.test.ts` beside it. `goals.ts` (the SMART checklist and the achievement loop) and `focus.ts` (the 4 P's) are the older pure modules the cards read.

## What each card reads and writes

| Card | Reads | Writes | Save model |
| --- | --- | --- | --- |
| How to coach her | `discoveryNotes` (the coach strategy, quoted with its own line breaks); her Preference and Coaching-tip notes — Notes' `howToCoachThreads` through `howToCoachRows` | `discoveryNotes` | The Save bar ("Goals & Focus · How to coach") |
| Her why | `globalNotes`; Mindbody's `LongtermGoal` / `LongTermGoal` index; `client.goals` (the consultation); the Goals lines of her Mindbody notes (`signUpGoals`, from the intake matcher, phase 17); her Dreams in FORD (`herWhyLinks`) | `globalNotes` | The Save bar ("Goals & Focus · The why") |
| Working toward now | `smartGoal`, `smartChecks`, `goalTargetDate`, `goalHistory` (the form's value, else the record's) | the same four, in GoalsPanel's exact sequence | The Save bar ("Goals & Focus · Working toward"); Mark achieved is four field edits in one save |
| Coach focuses | `journal.focuses`, and the check-ins in `journal.entries` (by `focusId`) | `clientFocuses` (set, achieve, extend, retire) and a journal check-in carrying its `focusId` — `useFocusActions` | Immediate, with a toast |
| Plans from the team | `clients/{id}/sharedNotes` (`useSharedNotes`) — the page's own listener | Take off the record (leaders) — `removeSharedNote` | Immediate; plans are written in Relay |
| Your working notes | `trainers/{uid}/notes` where `clientIds` contains her — the page's own listener | a jot on the newest of your notes about her, or a new "working notes" note | Immediate, private to you |
| Reached | the form's `goalHistory` (so a goal marked a moment ago shows, "Not saved yet") and `journal.focuses` achieved (`reachedShelf`) | nothing | — |

## The rules it keeps

- **One journal load, and the page's own reads only on its first visit.** The journal (her notes, the focuses and their check-ins) and FORD are the tab's ONE load (`useCodexData`). The shared plans and the jots are this page's own listeners, opened when the page is first visited — the shell mounts a page on first visit and keeps it, so switching back costs nothing (KNOWN-TRAPS → "Switching a sub-view must cost no fetch"). `ClientCodex.render.test.tsx` holds both.
- **How to coach her stores nothing new.** The rows are the same threads Notes shows, in the same order (loudest first), labelled in Notes' one vocabulary (`noteCardLabel`) — by KIND, so a legacy session wrap-up is never called a "Preference". A focus check-in stays on its focus card. A row may fold a long note to two lines (`.gf-row__text`, the one clamp the codex's scale test allows for this page); the whole thread is one tap away, opened on Notes (`note-{id}`).
- **`howToCoachLead` is THE lead line** for "How to coach her" everywhere: Body & Pulse's strip and the Overview's Goals slot read it too, so they never disagree. The first paragraph of the coach strategy, verbatim; with none, the first of her coaching notes in the list's order that is NOT Critical, whole, with who wrote it, its machine (named first, as the rows do — a machine's tip is never shown as a general cue) and its Loudness. A Critical note is carried by the red line under the bar and leads the Overview's Notes slot, so the lead passes over it rather than draw it twice — unless every coaching note she has is Critical, when it leads, marked Critical, rather than the line claiming nothing is written. "Nothing written" only once her notes were read.
- **Her words, exactly as typed.** The why and the consultation are drawn inside the page's own curly quotes, so a pair of quote marks already typed round them is taken off first — but only a PAIR: the first and last marks must be the same family and nothing between them may be of that family. `"Lose weight" and "get strong"` and `'Tis the season, I'm told'` keep every mark (`withoutOuterQuotes`).
- **The Save bar's names are the cards' without the pronoun.** The bar lists a field as "Goals & Focus · How to coach", "· The why" and "· Working toward" (`FIELD_HOME` in `client-codex/record-form.ts`): the cards say "How to coach her" and "Her why", but the bar's labels are fixed words shared by every client, so they carry no pronoun.
- **A failed read is unknown, never empty.** Notes loading or failed: How to coach says so, never "No coaching tips yet". Focuses loading or failed: the Coach focuses card says so and offers nothing (no "No focus running", no Set a focus); Reached counts the goals only and says the focuses are missing. FORD loading, failed or refused: the Dreams line says "Reading FORD…", "Couldn't read FORD just now." or "FORD is kept by the home studio." — never "Nothing in Dreams yet."
- **FORD text reaches only a reader FORD lets in.** Her Dreams come from the tab's FORD stream once it answered (`fordStatus === "ready"`); `fordSummary.pinned` on the client document is FORD text a cross-train studio can read, so nothing here reads it.
- **The sign-up line is read only here.** Account's Mindbody account notes card is the one place a Mindbody line is ever copied anywhere (INTEGRATION: the intake matcher's actions live there alone).
- **Who may do what.** `canEdit` (`codexAccess` — the clients update rule) gives Edit and Mark achieved; a cross-train reader sees the read views and nothing the rules would refuse. Any trainer may set a focus and check in (the `clientFocuses` and journal rules let them); closing a focus is its coach's or an owner's (`canManageFocus`, with the Auth uid).
- **Firestore refuses `undefined`.** `buildAchievedGoal` leaves every empty value out, and the Save bar's payload is stripped of `undefined` (`record-form.ts`).
- **The jot strip never writes on a guess.** Its read used to settle as "none" when it FAILED, and a jot then started a second "working notes" note beside the one the read could not see. A failed read now says so and keeps the box and Add off; a read still on its way offers nothing (`ClientJotStrip.render.test.tsx`). A failed listener does not come back while the profile stays open, so the words say to reopen the profile — they never promise the notes will load.
- **The app describes; the trainer decides.** Nothing here suggests a goal, a focus or a progression. The SMART squares are the coach's own ticks — nothing is inferred from the goal's words — and "All five ticked" is a sentence, not a score. No "set by" or "set on" on the goal: no field records either.
- **Words and dates.** Pronouns come from the gender Mindbody holds (`pronounsOf`; they/their when it is unknown). Dates are the studio's days in en-US words ("Jan 22, 2027"); a target is "May 1, 2027 · in 6 weeks" (the kit's `inTime`).

## What moved, and what it replaced

- `GoalsPanel.tsx` (the long scroll's goals section) is deleted. Its writes moved unchanged into `WorkingTowardCard` (the goal, the checklist, the target, Mark achieved) and `HerWhyCard` (the why); its "Achieved goals" list became `ReachedShelf`, which also lists focuses achieved.
- The focus board left `ClientJournalTab` (which nothing mounted any more; deleted in the codex's cleanup, phase 19). The board is drawn with the codex kit now — one panel, the kit's buttons, chips and fields, a neutral P chip — with its props, handlers, testids and button words unchanged, plus `historyCollapsed` (the history folded behind a 44px summary; Goals passes it, because Reached already lists what was achieved) and `anchor`.
- `SharedNotesCard` and `ClientJotStrip` are drawn with the kit and the codex's tokens (they are only mounted here); the card takes `children` (the jot strip sits in its panel, and "Jot a note" is left off because the strip does it in place) and `pronouns`.
- Mindbody's long-term goal moved from Goals' "Mindbody client indexes" block to Her why; the other indexes are in Account's fine print (phase 16).
