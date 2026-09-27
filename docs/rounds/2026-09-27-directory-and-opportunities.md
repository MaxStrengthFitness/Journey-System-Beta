# The Client Directory and the Hub's Opportunities layer

*Sep 27 2026. Branch `redesign/directory-and-opportunities`, four phases on master's `9511c6e`, one commit each. Built in the cloud container; not pushed (the bundle carries it to the PC).*

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

## Numbers

Measured in the cloud container with `TZ=America/New_York npx vitest run --dir src`, typecheck with `firebase-applet-config.example.json` copied to `firebase-applet-config.json`.

| Check | Result |
| --- | --- |
| Typecheck (`npx tsc --noEmit`) | **4** errors — the baseline, none new |
| Tests | **6,133** in **399** files: master's 6,027 in 391 plus **106 new tests in 8 new files** (85 for the directory — row, buckets, search, tokens, views and the mounted screen — and 21 for Opportunities — moments-today and the mounted Run-sheet). **One failure, and it is master's too:** `src/services/served-files.test.ts` › "refuses the admin key at /SERVICE-ACCOUNT.JSON" fails in the Linux container on master as well — the test plants `service-account.json` and asks for it in capitals, which is the same file on Windows (where the 6,027 was measured) and a missing path on Linux, answered by the app's page with a 200. Run the suite on the PC to confirm it passes there |
| Build (`npx vite build`) | Clean. The directory is its own chunk (about 39 kB, 14 kB gzipped) and so is the Run-sheet (about 18 kB, 7 kB gzipped), each with its own CSS |
| Guards | `css-class-owners` (new prefixes `cd-`, `ho-`, `hl-`), `lazy-screens` (ClientsView added with its `LoadBoundary kind="screen"`), `home-screen` (no inset paid), no raw invisible characters (`` and the rest written as escapes), no file names that differ only by case |
