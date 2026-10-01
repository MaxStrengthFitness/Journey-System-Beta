# FileMaker parity — InBody due, and notes linked to their session (Oct 1 2026)

Branch `oct1/filemaker-parity` from `origin/master` (`a6c58935`). Two features, one commit each, then this document. The comparison it comes from is `docs/business/filemaker-parity.md` (read from AJ's 17 FileMaker screenshots); its rows are updated here.

## AJ's answers (Oct 1 2026)

| FileMaker | AJ | What it meant for the build |
| --- | --- | --- |
| Yellow session numbers in the chart's header | *"these sessions have session notes"* | Not a grid marker: see the scope change below |
| How often a client is due an InBody scan | *"up to the studio or even that client"* | A studio setting and a client's own number |
| The small numbered circle in each cell | *"the order of the routine"* | Already done in Journey (each machine's order in today's routine) |
| Copy This Session | Replaced by Journey's routine selector | Nothing to build |

**The scope change, the same day.** The first brief also asked for a marked session number and a note mark on a single set, on both grids. AJ took both out before anything was committed: *"I more like the idea of having one spot to take the notes at and organize where it goes rather than the current 'notes can be taken on the session number, on the set' this makes it impossible to see all the notes in a organized way and it's a lot of clutter on the screen. That's why I have a note flagged that marks if a client has a note on a machine."* And: *"if made within a session it should link that session and that solves that and then I can see all notes about a clients machine performance and see the session it was associated with."* And: *"That's why I made a notes section on a clients profile that's organized to help trainers know if this is a personal note, a note about a set, a machine, a note about a session or just a note that's a note!"* So the grids are untouched (the machine row's note flag stays as it is), and the work went into the link between a note and its session.

## 1. InBody due — commit "InBody due: say when a client is due a scan…"

- **A studio setting**, `inbodyEverySessions` in `src/features/studio-settings/registry.ts`: "An InBody scan is due after … sessions since the last one", 4 to 200, the app's default **50**, in a new group "InBody scans (the briefing and the InBody card)". Head office sets Max Strength's default on **Admins → Standard → Studio defaults**; a studio's leaders set its own on **My Studio → Studio → This studio's settings**. Both editors now read the group order from the registry (`GROUP_ORDER`). Its reader is `features/inbody/due.ts`. Read for the client's **home** studio, the same studio her InBody variation comes from.
- **A client's own number**, `clients/{id}.inbodyEvery`: a number (4 to 200), or `"never"` ("not for her"); absent or null follows the studio. Edited on **Notes & Profile → Body & Pulse → InBody**: the card's first line has an Edit with three picks (the studio's number · her own number · not for her) and a box for her number. It goes through the record form (`RECORD_FORM_KEYS`, `FIELD_HOME` → the InBody card), so only `inbodyEvery` is written, by the one Save bar, with `lastUpdatedBy`. A number out of range is never bent: the hint says so and the studio's number counts until it is fixed.
- **The one answer**, `src/features/inbody/due.ts` (`inbodyDue`): Completed sessions in Journey on a studio day **after** her latest scan's test day (the scan's own day is the visit it was taken at).
  - No scan in Journey, and Journey does not hold her whole story (`lib/client-coverage.ts`): **"No InBody scan in Journey yet"**, no count, never a "due".
  - No scan and her whole story: counted from her first session ("52 sessions and no scan yet").
  - A count that may be missing sessions is a **floor** ("at least 12"): the scan is older than every session Journey holds of a migrating client, or the list given is only a page. A floor past her number is still due.
  - Sessions not read yet (or a failed read) count nothing: "Counting her sessions…".
- **Where it shows.**
  - The briefing's **Before you start**: one quiet line, only when she is due — "Due an InBody: 51 sessions since her last scan" — counted in the heading's number, never a button and never a block on Start. It reads the scan day from `clients/{id}.inbodySummary` and every session the Active Session already streams (no new read; `sessionsAreAll`).
  - The **InBody card**, first, in every state, with where the number came from ("Counted against the studio's number" / "this client's own number"). The card counts the 40 sessions the profile's journal already streams, so past 40 it may say "at least".
- **Not in the Hub peek.** The parity doc named it as a second place; the briefing is where a trainer meets the client before the session, and the peek has no sessions loaded per client. Left for AJ to ask for.
- **No rules change.** The clients update rule lets anyone who may edit the client write any field but `renewal`; the studio settings' documents already take any registry key (at most 40).

## 2. Notes linked to their session — commit "Notes: every note from a session says which session…"

**What was already stored.** Every journal note the live session writes already carried `sessionId`: the session note sheet (`SessionJournalSidebar`, origin `in_session`), the machine sheet's notes and the set-up prompt's reasons (`equipment/mutations.ts` through each sheet's `JournalContext`), the arrival note at Start (`pre_session`), the Note for the next trainer (`post_session`), and the Wrap-up's draft and Profile note. *Remember this* writes FORD, not the journal, and keeps its own `sessionId`.

**What was missing**, and added: the session's **number and studio day** on the note — `sessionNumber` and `sessionDay` on `journalEntries`, written only with a `sessionId`, by every writer above through `sessionLinkOf` (`src/features/client-notes/session-link.ts`). So the Notes page says where a note came from with no read per note. The set notes on exercise logs (`ExerciseLog.notes`, `skipNote`, `rpeNote`) are unchanged.

**On Notes & Profile → Notes:**
- Under a note written in a session, **"From session #12 · Sep 30"** (`sessionLinkLabel`): the note's own fields, else the session in the tab's sessions stream (`journal.recentSessions`, the newest 40), else "From a session". The number only past the session-number gate (`canQuoteSessionNumber`); otherwise "From the session on Sep 30". It is a 40px button that opens **that session in Activity Archive's pop-up** (`SessionDetailDialog`, the same one the calendar and list open, with its notes and its sets), from the stream, or read **once** (`getDoc`) on the tap for an older session the stream doesn't hold.
- A **Machine** filter in the filter row: only the machines she has notes about (`machinesWithNotes`), "Every machine" first. A thread counts when any of its entries is about the machine (the root or an update). Like the search, it narrows the chips' counts. So a trainer sees every note about one machine, each with the session it came from.

**No rules change**: the `journalEntries` create rule checks the client, the body and the author, not the other fields. No index.

## Measured (in this worktree on AJ's PC)

- `npx tsc --noEmit`: **4** errors (the baseline).
- `TZ=America/New_York npx vitest run --dir src`: **8,286** passing in **592** files (8,256 in 590 on `a6c58935`; +30 tests in 2 new files and 8 changed ones).
- `npx vite build`: clean (the usual chunk-size notice).
- No rules change, so `npm run test:rules` was not needed.

New tests: `inbody/due.test.ts`, `client-notes/session-link.test.ts`; added to `studio-settings/resolve.test.ts`, `client-codex/record-form.test.ts`, `client-notes/note-catalog.test.ts`, and the mounted `BriefingScreen.render.test.tsx` (the line, its silence, Start still starting), `BodyPulsePage.render.test.tsx` (the card's line, the Edit, "Counting her sessions…"), `NotesPage.render.test.tsx` (the session line, opening the pop-up with and without a read, the gate, the machine filter) and `SettingDefaultsPage.render.test.tsx` (the new group).

## Deploy

Nothing but the push: no rules, no index, no Function, no Mindbody change. Notes written before this ship have no number or day on them; they say "From a session" (or the session's number and day when the tab's stream holds it) and still open it.

## Open for AJ

- The InBody line in the **Hub peek** too? Not built (see above).
- A note written in a session on a **profile thread update** (Add an update) is not linked: updates are written from the profile, never mid-session.
- Walk **Round 47** of `docs/ops/TESTING-CHECKLIST.md`.
