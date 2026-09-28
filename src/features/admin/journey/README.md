# Operations → Clients → Journey — where each client is, against her own rhythm

*The redesign's Operations room, Sep 28 2026 (`docs/rounds/2026-09-28-operations.md`). AJ: "Retention is everything … knowing how to get back the ones that may be slipping away is necessary." He took the pick, "Brief + Journey", with every default, so questions 4 and 5 are the research's: keep the state names (on leader screens only) and draw the lines at twice her usual gap, the studio's own number and 45 days.*

## The rules (pure, tested)

| File | What it answers |
| --- | --- |
| `rhythm.ts` | Her **usual gap**, and the least it takes to say one: six visits over four weeks. `rhythmFromVisits` is the research's rule (the median of her last six gaps in the last twelve weeks), for the nightly job once AJ says yes to it storing states. `rhythmFromSnapshot` is what a screen says today from last night's renewal snapshot: 7 ÷ her pace, the minimum checked on an estimate of the visits behind it (pace × observed weeks, at most eight). Below the minimum: "too new to judge". |
| `states.ts` | Her **state**, one of nine, with its sentence, its proof, the line she crossed and the day she crossed it (`journeyOf`). |
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
- **"Cadence halved" and "3 of her last 5 cancelled"** as Drifting triggers need her booking history; the snapshot's own `missed-sessions` flag is shown as a reason where it is set, never as a state on its own.
