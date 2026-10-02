# Atlas answers — history, totals and late cancels (`oct2/history`)

Branch `oct2/history`, on master's `7875a993`. One commit per item, each typechecked (2 errors, the baseline) with the suite passing. The brief is "The big change of direction: no FileMaker" in `docs/rounds/2026-10-02-atlas-answers.md`. AJ, Oct 2 2026: "we need to be smart about this and stop hoping we get the filemaker data and start being realistic and going 'well lets just make the app work without it'."

Final measure: typecheck 2 errors (baseline); `TZ=America/New_York npx vitest run --dir src` **8,634 passing in 617 files**; `npx vite build` passes; the booking-marks rules tests (4) pass in the emulator on AJ's PC.

## 1. Session total — done

- **`src/lib/session-total.ts`** (`sessionTotalOf`): total = sessions before Journey + Journey's, with a basis: `confirmed` (a prior record), `whole-story` (Journey holds it all), `mindbody` (Mindbody's visit count, already stored by the sync, less Journey's own sessions: `visitsBeforeJourney`), or `journey-only` (no guess). No new Mindbody call.
- **Confirm / Change** on Notes & Profile → Account: "About 306 before Journey (from Mindbody)" with **Confirm** (one tap writes `client.priorHistory` with the new source `mindbody`, who and when, counted through the day before her first Journey session) and **Change** (the existing editor, seeded with the guess). Account rather than the header, because AJ took the door off the header on Sep 26.
- Until confirmed: the **Hub card** shows the guess as her number ("#312" in the corner), the **header** shows her total with "306 before Journey · from Mindbody, not yet confirmed" under it, the **briefing** says "This is session #313 · from Mindbody, not yet confirmed.", and the **peek** says "her 313th session · from Mindbody, not yet confirmed".
- **Milestones** (the Hub's milestone list, the briefing's every-25th, "first session", the Overview's session milestones) only off a confirmed total or a whole story (`canClaimMilestone`). With no guess, the Opportunities list and the peek say "#6 in Journey".
- Late cancels never count: the total counts completed sessions only.
- Not changed: session documents' stored `sessionNumber`, the Journey grid, the Wrap-up and the Active Session's number still use the old gate (`canQuoteSessionNumber`), because those numbers were written from Journey's own count; they show a number once the total is confirmed.

## 2. Client since — done

- `resolveClientSince` now answers with `confirmed`: her first day is Mindbody's `firstAppointmentDate` (Mindbody's record date only as a fallback), "(from Mindbody)" until a trainer confirms it; a day a person set (`firstStudioDay`) or a whole story's first session is confirmed. `canClaimAnniversary` is the gate.
- Account → First day at the studio: "Jan 15, 2020 (from Mindbody, not yet confirmed)" and a **Confirm Jan 15, 2020** button that puts the day into the one form (the Save bar names it), beside the existing date editor for corrections.
- The codex Story's `storySince` is on the same rule (`confirmed`, "With Max Strength since Mar 2019 (from Mindbody).").
- Anniversaries wait for a confirmed date: Operations → Month counts the unconfirmed ones ("1 more waits for a confirmed first day — confirm it on Account") instead of listing them; the Overview's moments skip them.
- "A new client's first Journey session sets it" is DERIVED (a whole-story client reads her first session as confirmed), not written: nothing new writes `firstStudioDay` at session start.

## 3. Late cancels — done

- "Didn't come" is now **"Late cancel · session taken"** everywhere it is said (Hub card, peek, Operations → Today, the Week pages, the Activity Archive calendar and legend). `src/lib/late-cancels.ts` is the words and who may take one back.
- **Anyone at the studio** marks one from the Hub's peek on a booking nobody logged (and still from Operations → Today). A leader may undo any; the person who marked it may take back their own. A refused write is said in words.
- The data is unchanged (`studios/{s}/bookingMarks/{bookingId}`, `noShow: true`), so every earlier mark reads the same, and the nightly job reads them as before.
- The profile header tallies them beside the count, never inside it ("· 2 late cancels"), from her home studio's marks (a mark on a day with a logged session is not counted).
- Sessions left stays the contract's number from Mindbody. The renewal pace counts a late cancel (and Mindbody's own No-Show) as a session used, never a visit; the last visit and breaks stay visits only.
- Not done: a Mindbody "Cancelled" booking can't be marked a late cancel from the app (the peek only offers it on an unlogged, uncancelled booking); a late cancel marked at another studio (cross-train) isn't in her home studio's tally.

## 4. Progress reports — done

- One pure function, `progressReportDue` (`src/features/client-profile/cpr-timing.ts`, tested): due three months after the last FULL report (Finalized, not a Pulse round on its own; drafts and Pulse rounds never reset it), "soon" inside three weeks, a first one expected once she has been here three months, and the renewal-close case said more strongly.
- The red "Report required" strip is gone; one quiet line above the header (amber only when the renewal is close), with "Start a progress report". The banner's read now takes the newest 20 reports (was 1), so a newer Pulse round can't hide the last full report.
- **No progress reports**: a per-client switch on Activity Archive → Reports (`client.noProgressReports`), for anyone who may edit her; the Reports cue uses the same function.

## 5. Given sessions and the renewal — done

- Given (comp) sessions were already in sessions left, so the conversation already waited for them while a package ran. The gap was a client whose package was spent but who still held given sessions: she read "ended". Now she is still using sessions (`sessionsOnly` counts them once a package was recognised). The header's "36 left in contract · +12 extra" is unchanged. Pure engine only; the nightly job's wiring is untouched.

## 6. Reps as progress — done

- The Deep Dive's verdict is the load only: progressing = weight up, "Load down" = weight down, otherwise a plateau. Reps at the current load are still said in words ("reps 6 → 8"), never as "slipping" or "progressing", and a run at one load is a stall whatever the reps did.

## For AJ

- **Index (deploy first):** `bookingMarks (clientId ASC, day ASC)`, COLLECTION scope, in `firestore.indexes.json`, for the profile's late-cancel tally. `firebase deploy --only firestore:indexes`.
- **Rules:** `match /studios/{studioId}/bookingMarks/{bookingId}` — create is open to everyone who works at the studio (signed as themselves, now), update stays with leaders, delete is a leader or the person who marked it. Tests updated in `tests/firestore.rules.test.ts`; the booking-marks block passed in the emulator here, but run the whole `npm run test:rules` yourself before `firebase deploy --only firestore:rules` (your run is the one that counts). Rules go before the push: the new app offers the button to every trainer.
- No client-document rules change: `priorHistory` (source `mindbody`), `firstStudioDay` and `noProgressReports` are written through the existing client update rule.
- iPad walk: Account's Confirm on a long-standing client (then her Hub card, header and briefing), the First day Confirm and Save, a late cancel from the Hub peek as a trainer and its Undo as a leader, the report line and the switch on Reports.
