# Operations → Clients → Journey — where each client is, against her own rhythm

*The redesign's Operations room, Sep 28 2026 (`docs/rounds/2026-09-28-operations.md`). AJ: "Retention is everything … knowing how to get back the ones that may be slipping away is necessary." He took the pick, "Brief + Journey", with every default, so questions 4 and 5 are the research's: keep the state names (on leader screens only) and draw the lines at twice her usual gap, the studio's own number and 45 days.*

## The page (phase 4)

**Clients → Journey** (`JourneyPage.tsx`): the state strip (New · Settling in · Steady · Drifting · At risk · Lapsed, each a count and a button), Away · Back · Unknown beside the line, the lenses (All clients · Renewal window · New), a "this week" line, and the picked state's list. A slipping list reads catchable first: clients a leader already answered (snoozed, dismissed) last, then those whose usual trainer is in today, then the closest to the line. Unknown's list is grouped by why. Under the line's lists, **Too new to judge** names who can't be judged yet, with why.

A client tapped anywhere opens inside Operations (`shell/ClientPage.tsx`), and a client of this studio carries **her journey and her case** there (`JourneyCase.tsx`): why, proof, what we know (the renewal line, the snapshot's own flags such as missed sessions, and the watchlist's answer), the next step with its owner and the day it becomes the leader's, and the outcome. The list stays mounted behind her, so Back is exact (a master–detail layout was the research's sketch for landscape; one client page for every door is what was built, so Today, the Journey and Moments open her the same way).

**Today's Slipping away** reads the same rule (`studioJourneys`, drifting and at risk, catchable first) with Snooze and Dismiss, and a door here. The old attendance watch (`overview/questions.ts` `attendanceQuestion`, `attention/AttendanceWatchView.tsx`) is gone: one rule for "slipping", not two that could disagree. Its snooze, dismiss and back-again stay (`attention/`), on the Journey's rows and the case.

## The rules (pure, tested)

| File | What it answers |
| --- | --- |
| `rhythm.ts` | Her **usual gap**, and the least it takes to say one: six visits over four weeks. `rhythmFromVisits` is the research's rule (the median of her last six gaps in the last twelve weeks), for the nightly job once AJ says yes to it storing states. `rhythmFromSnapshot` is what a screen says today from last night's renewal snapshot: 7 ÷ her pace, the minimum checked on an estimate of the visits behind it (pace × observed weeks, at most eight). Below the minimum: "too new to judge". |
| `states.ts` | Her **state**, one of nine, with its sentence, its proof, the line she crossed and the day she crossed it (`journeyOf`). |
| `case.ts` | Her **case**: owner (her usual trainer, the snapshot's `primaryTrainerId`, else a leader), next step (always a person; q6: a phone call counts as in person, noted afterwards on her profile), the day it becomes the leader's (`CASE_ESCALATE_DAYS`, 3, q7), and the one outcome Journey sees by itself: booked again. |
| `journey-list.ts` | The studio's Journey in one pass (`studioJourneys`, over the Client Directory's row model), the lenses, each list's order, and this week's derived movement (`thisWeek`). |
| `useStudioJourneys.ts` | The hook: the week as the server answered it, the renewal settings (the At-risk line) and the watchlist; nothing per client. |
| `RulesPage.tsx` | Setup → Rules: every number behind the sentences, the studio's own (read from its renewal settings, set on My Studio → Studio) and Max Strength's (the named constants below). |

### The states, in the order they are decided

1. **Unknown** — no nightly record for her, or the studio's record has stopped changing (`overview/brief.ts`, three quiet days).
2. **Away** — Mindbody's away event (Vacation, Snowbird, Medical) on last night's snapshot, with its reason and return date. The date passing with nothing booked is **At risk** ("was due back on …"); booked again, **Back**; bookings unread, Unknown.
3. **Unknown**, no visit on record — her last visit isn't known, so no gap can be measured. **Never Lapsed off an unknown.** (New or Settling in if her total may be quoted.)
4. With **nothing booked** (the bookings were read): **Lapsed** at 45 days, **At risk** at the studio's own number (`breakDays`, "Warn me when a client has not visited for (days)"), **Drifting** at twice her usual gap, at least 7 days.
5. **Unknown**, bookings unread — past a line, and whether anything is booked couldn't be read. Never Steady.
6. **Back** — booked again after crossing a line.
7. **New** (sessions 1–10) or **Settling in** (11–24) — only from a total that may be quoted (`lib/client-coverage` `canQuoteSessionNumber`, through the Client Directory's row): a twelve-year client nobody has recorded a total for is never New.
8. **Steady** — a measured rhythm, inside it.
9. **Unknown**, too new to judge — no measured rhythm and no quotable stage.

### Where the numbers live

| Line | Number | Where |
| --- | --- | --- |
| At risk | the studio's `breakDays` (default 14) | the studio's renewal settings, My Studio → Studio |
| Drifting | `DRIFT_MULTIPLE` 2 × the usual gap, at least `DRIFT_MIN_DAYS` 7 | named constant (the attendance watch's own rule) |
| Lapsed | `LAPSED_DAYS` 45 | named constant |
| New, Settling in | `NEW_MAX` 10, `SETTLING_MAX` 24 | named constants |
| A usual gap | `MIN_RHYTHM_VISITS` 6 over `MIN_RHYTHM_WEEKS` 4 | named constants |

AJ's question 5 took "each a studio setting". Storing a new setting is a data change that waits for his OK, so the four are constants with a comment until then, and Setup → Rules says so beside each.

## What is not built, and why

- **The nightly job writing each client's state**, the day it began and its reasons onto her snapshot: not approved. The screen works each state out from what it already holds (the roster's snapshots, the Client Directory's row model, the week's bookings); nothing is read per client.
- **The case fields** (owner, next step, due date, outcome and reason on the attendance watchlist, and "Booked again" set by the sync): not approved. So the case is worked out and shown, never stored: no Take it, no Hand to…, no Away / Not reached / Lost. Past the due day it says the case is the leader's AND to check with the owner, because Journey can't record a step yet.
- **Trainers seeing their own clients' cases in Relay → Mine** (question 7's second half): for later, with the case fields; Relay is being rebuilt tonight by another room.
- **Who moved toward steady this week** needs yesterday's states (not stored), so the "this week" line claims only what can be derived: who crossed a line in the last seven days (her last visit plus the line) and who booked again.
- **"Cadence halved" and "3 of her last 5 cancelled"** as Drifting triggers need her booking history; the snapshot's own `missed-sessions` flag is shown in the case's "What we know", never as a state on its own.
