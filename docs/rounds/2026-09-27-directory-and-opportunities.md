# The Client Directory and the Hub's Opportunities layer

*Sep 27–28 2026. Branch `redesign/directory-and-opportunities`: four phases on master's `9511c6e`, one commit each, then master merged in at `8d0a3aa` (the Openings round) and one follow-up for its staff-block rule. Built in the cloud container and carried to the PC as a bundle; checked there, and shipped to master on Sep 28 2026 on AJ's word ("we don't have trainers on the app"), before his iPad walkthrough, which is Round 24 of the testing checklist.*

## What AJ asked for

> "When I look at a client I want to know when they are in next when they were in last and how many sessions they have left and maybe a icon in front of their name if theirs a note I haven't marked off. I feel like you should be able to sort those categories so I can search Nancy and then sort by last seen and then know which Nancy was here last of all NAncys." (Sep 27)

> A real directory, not just a search box: "all our nurses, all female clients, female clients over 60, everyone who's five foot six". (Sep 20)

> On the Hub: "just clean it up and add the second layer" — a layer that "list[s] every client coming in that day", sortable "by appointment time, by last seen, by session count, by sessions left, by birthday (turns 80 on June 4th)", "so trainers can see opportunities for that day quickly." (Sep 27)

The designs are the two research briefs of Sep 27: research-directory (Direction A, the smart table, run on Direction C's search engine with Direction B's lenses as chips) and research-hub (O1, the Run-sheet, with O2's groups as filters and O3's slots as the opened row).

## What was built

**Phase 1 — the engine** (`src/features/client-directory/`, pure, tested). One row model (`row.ts`): what every cell says in each of its states — known, none, unknown, and Before Journey — and the key it sorts by, reusing the helper that already answers each one (`client-name`, `ageAndBirthday`, `coverageOfClient` / `canQuoteSessionNumber`, `prior-history`, `client-since`, `sessionsSplit`, the held bookings). Sections per sort in studio days, unknowns always last (`buckets.ts`). The forgiving name search: nicknames both ways, labelled typos, O'Brien and McDonald however typed (`search.ts`). Descriptions as removable tokens with "not on file" counts (`tokens.ts`).

**Phase 2 — the Client Directory screen** (`ClientDirectory.tsx`, replacing `ClientDirectoryView`). Client · Last in · Next · Left in portrait, plus Total · Age · Height in landscape (a Display toggle). Tap a header to sort by it, again to reverse; the sort menu says the order in words; sticky sections with counts. The search field takes names and descriptions and says "Understood as:" with removable tokens and honest counts ("1 of 6 match · 2 have no occupation on file"). View chips All · Mine · Kaizen · In today (Start on today's bookings). A scope menu (This studio / All my studios, shown only to someone with more than one studio) replaces the "Search Entire Corporate Network" switch and keeps its exact query path. Every client is listed and sorted on the iPad — no more "40 most recent". The sort is remembered per trainer on the iPad. Open session and Add Client are where they were.

**Phase 3 — the Hub's Opportunities layer** (`src/features/hub-opportunities/`). `[ Schedule | Opportunities ]` at the start of the Hub's strip; Schedule is the default and unchanged (the grid stays mounted, only hidden). Opportunities is the Run-sheet: one row per client booked on the day on screen; Time · Last seen · Sessions · Left · Birthday, each read as a sentence in one column ("turns 80 · Thu Oct 1", "Back after 5 weeks — missed about 9", "100th session today", "36 left in contract · +12 extra"); filter chips Read first · Celebrate · Welcome · Renew · Watch with counts, zeros hidden; at most three chips a row, never the sorted fact; Studio / Mine; a tap opens the row into Where she is · Something to say · Watch with Open profile and Start session. Everything is worked out for the SELECTED day, so the day strip is honest.

**Phase 4 — this document** and the two READMEs.

## Reads

No per-client query anywhere. Both screens ride on what the app already streams (the studio roster, the held bookings, the last day's sessions, the trainers, the studios, and — on the Hub — the day's Critical-notes read), plus **one small document each: the studio's package table** (`studios/{s}/config/renewals` through `useRenewalSettings`, the read the profile already makes), so "left" says the profile's number. No Mindbody, Cloud Function, rules, index or Firestore-structure change.

## How to review it on an iPad

1. **The directory.** Bottom bar → Client (with no client open). It opens on Last in, most recent first, in sections ("Last 7 days · 58"…), with Before Journey, Nothing recorded and Unknown at the bottom.
2. **The Nancy case.** Type `nan`. Every Nancy, and anyone who goes by Nancy, stays; the matched letters are marked. The top row is the Nancy who was in most recently. Tap **Last in** to reverse it.
3. **Nicknames and typos.** Type `judy` (finds Judith, "matched nickname"), `nancey` ("No exact match. Close matches:"), `obrien` and `mcdonald`.
4. **Describing.** Type `female nurses over 60`, then `5'6`. Check the "Understood as:" chips, remove one with its ×, and read the count line — it says how many have nothing on file.
5. **Honest unknowns.** Tap an Unknown in the Next or Left column: it says why, without opening the profile. Put the iPad in airplane mode for two hours (or look after a long sleep): Next reads Unknown, never "Nothing booked".
6. **Views.** Tap Mine (its definition is under the chips), Kaizen (the reason and check-back date replace the identity line), In today (Start on each row starts that client's session).
7. **Landscape.** Turn the iPad: Total, Age and Height appear; the Display toggles hide any of them.
8. **The Hub.** Tap **Opportunities** at the left of the strip. Try each sort; open a row; flip the day to Thursday and see Thursday's birthdays and milestones. Tap **Schedule** — the grid is exactly where it was.

## What AJ still has to decide

*One topic at a time.*

1. **The directory's default sort.** It opens on Last in, most recent first (the research's recommendation). Or first name A–Z, or next booking?
2. **How a nickname shows.** Now `Judith "Judy" Alvarez` (legal and nickname together). Or nickname first ("Judy Alvarez", Judith underneath)? The Hub card has the same question — it still says "Judith D.".
3. **Mine's window.** Now: coached by you in the nightly record's last 60 days, or any session you've logged in Journey, or you're her top trainer, plus booked with you, plus your Kaizen Roster. The research asked for "the last 90 days"; the data can say 60 days or ever-in-Journey, not exactly 90. Which do you want?
4. **Note marks** (the dot for a note you haven't marked off). Doing it honestly for a whole roster needs a small roll-up on the client document of her open note threads — a Firestore structure change, so it needs your OK. The screen has the seam for it (and draws nothing yet).
5. **The Hub card's milestones.** Opportunities uses Operations' list (50, 100, 150, 200, 250, 300, 400, 500, 750, 1000…); the card still marks every 25th. Move the card to the one list?
6. **Tenure words** on the Sessions sort: New 1–3, Building 4–49, Regulars 50+ — right lines?
7. **"Ending soon"** on the Left sort is 12 or fewer left in the contract — right line?

## Deliberately left out

FORD "Get to know" and surgery/away from dated notes on the Hub (each needs one new studio-scoped read); the header quick-find popover; every-studio search and Admin → Clients folded in (need search prefixes on the client document); Save view and "Find clients like…"; the Hub grid's clean-up (research-hub S1). The READMEs list each with its reason.

## After master moved (Sep 28)

Master took 105 commits while the round was built (the voice review follow-up, the whole-read record and the Openings round, to `8d0a3aa`), so it was merged into the branch.

- **The merge.** The code merged on its own (`AppContent.tsx` and `ClientsView.tsx` changed on both sides, in different places). The two conflicts were file maps: `CLAUDE.md` and `docs/rounds/README.md` keep master's newer rows and add this round's after them.
- **A staff block is never a booking.** Openings made one rule for a Mindbody "Unavailable" block, `isStaffBlock` in `lib/booking-state.ts`. The Run-sheet had its own copy of the test and now asks the shared one, and so do the two readers that had none: the Directory's Next column and the set of booked clients the Run-sheet builds its rows from. One new test.
- **The studio's clock.** Master's last commit found the Wrap-up formatting a booking on the device's clock, which GitHub's check (run in UTC) caught. This round already formats with `lib/studio-time.ts`; its 110 tests pass under Eastern, UTC, Pacific and Tokyo time.

## Numbers

Measured in the cloud container, typecheck with `firebase-applet-config.example.json` copied to `firebase-applet-config.json`. Run them again on the PC before anything is merged: that run is the one that counts.

| Check | Result |
| --- | --- |
| Typecheck (`npx tsc --noEmit`) | **4** errors — the baseline, none new (before and after the merge) |
| Tests | After the merge: **7,034** in **460** files with `TZ=America/New_York npx vitest run --dir src` — master's 6,927 in 452 plus **107 new tests in 8 new files** (86 for the directory — row, buckets, search, tokens, views and the mounted screen — and 21 for Opportunities — moments-today and the mounted Run-sheet), none failing. `npm test` under `TZ=UTC`, as GitHub's check runs it: **7,248** passing, 1 skipped (master's 7,141 plus the 107). Before the merge it was 6,133 in 399, with one Linux-only failure in `served-files.test.ts` that master has since fixed (`df4933e`) |
| Build (`npx vite build`) | Clean. The directory is its own chunk (about 39 kB, 14 kB gzipped) and so is the Run-sheet (about 18 kB, 7 kB gzipped), each with its own CSS |
| Guards | `css-class-owners` (new prefixes `cd-`, `ho-`, `hl-`), `lazy-screens` (ClientsView added with its `LoadBoundary kind="screen"`), `home-screen` (no inset paid), no raw invisible characters (`\uf8ff` and the rest written as escapes), no file names that differ only by case |

**On AJ's PC, Sep 28, in the main checkout \u2014 the run that counts.** Typecheck **4**, the same four errors as master (`AppContent.tsx` \u00d72, `clinical-review/charts.tsx`, `EditTrainerModal.tsx`). **7,034** passing in **460** files with `TZ=America/New_York npx vitest run --dir src`. `npm test` under `TZ=UTC`: **7,248** passing and 1 skipped, in 474 files. `npx vite build` clean: the directory 46.6 kB (14.7 kB gzipped), the Run-sheet 20.6 kB (7.1 kB gzipped). GitHub's check on the pushed branch: green. No case-only file names. Nothing to deploy before the push: the only query the round makes is the "All my studios" name search the old directory made, and both of its indexes (`homeStudioId` with `firstName`, and with `lastName`) are in `firestore.indexes.json`.
