# Operations → Clients → Journey — where each client is, against her own rhythm

*The redesign's Operations room, Sep 28 2026 (`docs/rounds/2026-09-28-operations.md`). AJ: "Retention is everything … knowing how to get back the ones that may be slipping away is necessary." He took the pick, "Brief + Journey", with every default, so questions 4 and 5 are the research's: keep the state names (on leader screens only) and draw the lines at twice her usual gap, the studio's own number and 45 days.*

## The page (phase 4)

**Clients → Journey** (`JourneyPage.tsx`): the state strip (New · Settling in · Steady · Drifting · At risk · Lapsed · Inactive, each a count and a button, under Starting · Settled · **MIA** · **Inactive** since Oct 1 2026), Away · Back · Unknown beside the line, the lenses (All clients · Renewal window · New), a "this week" line, and the picked state's list. A slipping list reads catchable first: clients a leader already answered (snoozed, dismissed) last, then those whose usual trainer is in today, then the closest to the line. Unknown's list is grouped by why. Under the line's lists, **Too new to judge** names who can't be judged yet, with why.

A client tapped anywhere opens inside Operations (`shell/ClientPage.tsx`), and a client of this studio carries **her journey and her case** there (`JourneyCase.tsx`): why, proof, what we know (the renewal line, the snapshot's own flags such as missed sessions, and the watchlist's answer), the next step with its owner and the day it becomes the leader's, and the outcome. The list stays mounted behind her, so Back is exact (a master–detail layout was the research's sketch for landscape; one client page for every door is what was built, so Today, the Journey and Moments open her the same way).

**Today's Slipping away** reads the same rule (`studioJourneys`, drifting and at risk, catchable first) with Snooze and Dismiss, and a door here. Since Oct 6 2026 it is given the leaders' inactive marks too, and waits for them, as `useStudioJourneys` does, so a client a leader marked Inactive is never listed there as Drifting or At risk (`docs/rounds/2026-10-06-slipping-inactive.md`). The old attendance watch (`overview/questions.ts` `attendanceQuestion`, `attention/AttendanceWatchView.tsx`) is gone: one rule for "slipping", not two that could disagree. Its snooze, dismiss and back-again stay (`attention/`), on the Journey's rows and the case.

## Inactive — the end of the line (Oct 1 2026)

AJ: *"a client is active>MIA>inactive and studios can customize time or manually set clients inactive and also view the mia list and inactive list to possibly work on retention or win backs."* The round is `docs/rounds/2026-10-01-inactive.md`.

- **Inactive by herself**: past the studio's `inactiveDays` (90 by default, always past Lapsed) since her last visit, nothing booked as read, on Lapsed's own evidence: a client Journey can't judge stays Unknown, and Away is never made Inactive by itself.
- **Marked inactive**: a leader's mark (`studios/{s}/inactiveMarks/{clientId}`: the reason from the pick list, an optional note, signed and dated), which holds until she visits after the day it was made. Leaders, franchise owners and administrators mark and take back; everyone who works there reads.
- **A booking makes either kind active again**: she reads Back.
- **The Inactive list** is its own list (Inactive on the strip): each row says which kind, since when and why, and its win-back case; **Mark active again** on a leader's mark. A win-back case is the case form on the client page, as for any client. Renewals' "lost" list is separate and untouched.
- **The mark panel** (`InactiveMark.tsx`) is on the client page inside Operations (under her journey) and on her profile's Account page (for her home studio, `client-admin/StandingCard.tsx`).
- **The nightly job** writes Inactive with `inactiveKind` (automatic or manual) from the marks it reads, and leaves Inactive clients out of the monthly Mindbody sweep (`renewals/job-plan.ts` `sweepsPast`).
- **Out of the way, never deleted**: the Client Directory's All leaves them out behind an "Inactive N" chip (`client-directory/views.ts` `inactiveHow`); search still finds them.

## The rules (pure, tested)

| File | What it answers |
| --- | --- |
| `rhythm.ts` | Her **usual gap**, and the least it takes to say one: six visits over four weeks. `rhythmFromVisits` is the research's rule (the median of her last six gaps in the last twelve weeks), for the nightly job once AJ says yes to it storing states. `rhythmFromSnapshot` is what a screen says today from last night's renewal snapshot: 7 ÷ her pace, the minimum checked on an estimate of the visits behind it (pace × observed weeks, at most eight). Below the minimum: "too new to judge". |
| `states.ts` | Her **state**, one of ten, with its sentence, its proof, the line she crossed and the day she crossed it (`journeyOf`); for Inactive, which kind and since when (`inactive`). |
| `inactive.ts` / `inactive-store.ts` / `InactiveMark.tsx` | **Inactive** (Oct 1 2026): a leader's mark (the reasons, the document, when it holds: until she visits after it), its one writer and reads (one shared listener per studio, one document for a client), and the panel that marks and takes back. |
| `case.ts` | Her **case**: owner (her usual trainer, the snapshot's `primaryTrainerId`, else a leader), next step (always a person; q6: a phone call counts as in person, noted afterwards on her profile), the day it becomes the leader's (`CASE_ESCALATE_DAYS`, 3, q7), and the one outcome Journey sees by itself: booked again. **A stored case** (wave 2) is read first: what the team wrote, with "the leader's after 3 days with no step" counted from its `updatedAt`, and "Booked again" worked out on read from her bookings on a case still open (it offers to close; it is never written by the sync). |
| `case-store.ts` | The stored case, `studios/{s}/cases/{clientId}` (wave 2, AJ: "all yes"): `{ clientId, clientName, owner: { id: <Auth uid>, name }, nextStep, dueOn, outcome: open · booked-again · paused · lost, reason?, openedAt, updatedAt, updatedBy }` — exactly that shape, because Relay reads a trainer's own cases with `where('owner.id', '==', uid)` (the cases index). `useStudioCases` is the leaders' read (one small collection); `openCase` writes a new case whole; `saveCase` sends only what changed (`casePatch`), a cleared reason removed. The rules: the studio's leaders read and write every case, the owner reads theirs and may change the step, the day, the outcome and the reason, and nothing is ever deleted. |
| `case-form.ts` / `CaseForm.tsx` | **The case form** (wave 3, Sep 29 2026): on the client page inside Operations, under the case. `caseRights` mirrors the rules — a leader of the studio opens a case and changes every field; the case's owner (by sign-in uid) changes the next step, the due day, the outcome and the reason, never the owner; everyone else reads. `ownerChoices` is everyone who works here (`lib/who-works-here.ts`), stored by `authUid` (else the trainer id), the stored owner kept when they've left. `startingDraft` is what a new case starts from: her usual trainer, the rules' due day, open, an EMPTY step (an empty step reads the rules' own everywhere, so the leader types only when they have something to say). The form is the admin kit's: `useDirtyForm` (so the leave warning covers typed text), only the diff written through `saveCase` / `casePatch`, a Save bar that never blocks; a new case goes whole through `openCase`. Nothing here deletes a case: an outcome closes it, and a leader setting it back to Open reopens it (`openedAt` kept). A non-leader owner can't read the studio's cases collection, so `useClientCase` reads their one document and `JourneyCase` works her case out again from it. |
| `journey-list.ts` | The studio's Journey in one pass (`studioJourneys`, over the Client Directory's row model), the lenses, each list's order, and this week's derived movement (`thisWeek`). |
| `useStudioJourneys.ts` | The hook: the week as the server answered it, the renewal settings (the At-risk line) and the watchlist; nothing per client. |
| `RulesPage.tsx` | Setup → Rules: every number behind the sentences — the studio's renewal numbers (its renewal settings), the Journey's five lines (the studio settings, each with where it came from: the studio's own, Max Strength's default or the app's), and the rules the same at every studio (the named constants below) — with a door to My Studio → Studio, where they are set. |

### The states, in the order they are decided

0. **Inactive, marked** (Oct 1 2026) — a leader's mark that still holds (no visit after the day it was made); booked, she reads **Back**.
1. **Unknown** — no nightly record for her, or the studio's record has stopped changing (`overview/brief.ts`, three quiet days).
2. **Away** — Mindbody's away event (Vacation, Snowbird, Medical) on last night's snapshot, with its reason and return date. The date passing with nothing booked is **At risk** ("was due back on …"); booked again, **Back**; bookings unread, Unknown.
3. **Unknown**, no visit on record — her last visit isn't known, so no gap can be measured. **Never Lapsed off an unknown.** (New or Settling in if her total may be quoted.)
4. With **nothing booked** (the bookings were read): **Inactive** by herself at the studio's `inactiveDays` (90 by default, always past Lapsed), **Lapsed** at the studio's `lapsedDays` (45 by default), **At risk** at the studio's own number (`breakDays`, "Warn me when a client has not visited for (days)"), **Drifting** at the studio's `driftMultiple` of her usual gap (twice by default), never under its `driftMinDays` (7 by default).
5. **Unknown**, bookings unread — past a line, and whether anything is booked couldn't be read. Never Steady.
6. **Back** — booked again after crossing a line.
7. **New** (sessions 1 to the studio's `newMax`, 10 by default) or **Settling in** (to its `settlingMax`, 24 by default) — only from a total that may be quoted (`lib/client-coverage` `canQuoteSessionNumber`, through the Client Directory's row): a twelve-year client nobody has recorded a total for is never New.
8. **Steady** — a measured rhythm, inside it.
9. **Unknown**, too new to judge — no measured rhythm and no quotable stage.

### Where the numbers live

| Line | Number | Where |
| --- | --- | --- |
| At risk | the studio's `breakDays` (default 14) | the studio's renewal settings, My Studio → Studio → Renewals |
| Drifting | `driftMultiple` (2) × the usual gap, never under `driftMinDays` (7) | the studio settings |
| Lapsed | `lapsedDays` (45) | the studio settings |
| Inactive | `inactiveDays` (90, always past Lapsed), or a leader's mark | the studio settings; `studios/{s}/inactiveMarks` |
| New, Settling in | `newMax` (10), `settlingMax` (24) | the studio settings |
| A usual gap | `MIN_RHYTHM_VISITS` 6 over `MIN_RHYTHM_WEEKS` 4 | named constants, the same at every studio |

**The studio settings** (wave 2, Sep 28 2026: AJ, "all yes", and "let the admins assign the default within the app"; `src/features/studio-settings/`). Each of the five is the studio's own (`studios/{s}/config/settings`, set by its leaders on My Studio → Studio → This studio's settings), else Max Strength's default (`system/studioDefaults`, set by head office on the Admins dashboard), else the app's (the registry's `appDefault`, the numbers in brackets above). `states.ts` holds no number of its own: every rule takes `lines` (`JourneyLines`), `linesOf` reads them out of `resolveAll` (the nightly job) or `useStudioSettings().all` (a screen), and `APP_LINES` is the registry's app defaults, for tests and the moment before the settings answer. `useStudioJourneys` and Today wait for both settings reads before working out any state, so nobody flickers from the app's line to the studio's. **Setup → Rules** shows each line with where it came from (`SOURCE_WORDS`: "This studio's own", "Max Strength's default", "The app's default") and a door to My Studio → Studio: it is never a second editor.

## What is not built, and why

- **The night's states** are built since wave 2: the nightly renewals job's step 5 (`server/journey-step.ts` over `nightly.ts`) writes `studios/{s}/clientStates/{clientId}` (state, since, was, reasons, usual gap from her visits, last visit, next booking; leaders only), `studios/{s}/watch/journey` (counts, the day and the lines used; leaders only, written last) and `studios/{s}/watch/hubMarks` (All stars, for the Hub). A page uses them only while the summary is today's with today's lines (`summaryIsFresh`), and works a client out itself when it knows something newer (`nightStillHolds`); `useStoredJourney` is one shared listener pair per studio. The "this week" line now says who moved back toward steady.
- **"Booked again" set by the sync**: the sync is the Mindbody integration, so it stays worked out on read (a stored case still open whose client has a booking reads Booked again and offers to close). The case fields themselves are stored since wave 2 (`case-store.ts`); a client with no stored case still has one worked out, which past its due day says to check with the owner first.
- **Trainers seeing their own clients' cases**: Relay's, built by the Relay room from the same documents (`where('owner.id', '==', uid)`). On the client page inside Operations, the owner of a case changes it through the same form a leader uses (wave 3).
- **Who moved toward steady this week** needs yesterday's states (not stored), so the "this week" line claims only what can be derived: who crossed a line in the last seven days (her last visit plus the line) and who booked again.
- **"Cadence halved" and "3 of her last 5 cancelled"** as Drifting triggers need her booking history; the snapshot's own `missed-sessions` flag is shown in the case's "What we know", never as a state on its own.
