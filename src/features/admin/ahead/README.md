# Operations → Ahead

*Oct 7 2026. The round is `docs/rounds/2026-10-07-ahead.md`; the proposal AJ answered is the artifact linked there.*

AJ: Operations shows when a week is all clear, but a leader can't see past it, and the renewal and retention data is cramped and hard to move through. Ahead is everything past this week on one scroll. It sits **beside Month** (AJ: "1b"), as Operations' seventh destination: Today · Week · Month · **Ahead** · Clients · Team · Setup.

## What it shows

One switch, two views of the same dates:

- **Weeks** answers "what needs me, and when". A strip of the next 26 weeks comes first (one small bar a week: blue talks, grey renewal dates, plum things to watch), tapped by month, marking the week at the top of the screen. Then each month's weeks follow as cards, the client history's list turned to face forward. A row is a word (Talk now, Before the charge, Runs out, May slip…), the client, their primary trainer and one sentence, with how it was worked out on its (i). A stretch with nothing in it is one hatched "All clear" line, drawn the way a break is drawn between sessions. This week is always drawn. A trainer with three or more talks in one week is named under the week's heading: it's a count of work for leaders, never a ranking.
- **Clients** answers "where does everyone stand". Each client gets one row with their two clocks on a shared axis, today at the left and 26 weeks out at the right:
  - the blue bar is the sessions left (Mindbody's count) used at the client's own pace;
  - the black tick is the commitment's end;
  - plum past a charging end is sessions still banked when the next package is charged;
  - a hatched gap means the sessions run out first;
  - the dotted line under the bar is the run-out range;
  - ◆ is the talk, and a dashed ring is the next line crossed if nothing is booked.
  The rows are ordered by what needs you: Needs you now, then Coming up by the first date. Clients with nothing to decide are folded at the foot, and those Ahead can't place are listed with the reason.

A row opens the client: as a **sheet from the bottom** where the page is narrower than 860px (`PANE_MIN_WIDTH`, an upright iPad), and as a **pane beside the list** where it is wider (on its side, a desk). The panel draws the clocks large, then:
- the talk and run-out days with their ranges;
- the next visit, as the next chance to talk on the floor;
- the Journey's state and the next line;
- the renewals dashboard's own row (`RenewalRow`, plan picker included), so a client is never said two ways;
- Open client, which opens the client's page inside Operations, with the journey and the case.

Lenses: All · Talks · At a charge · Runs out early · May slip · the studio's shortest package by its own name (the Trial) · Moments. A trainer filter sits beside them. The view, the lens and the trainer are remembered until sign-out (`forgetOnSignOut`).

Week ahead ends with **Further ahead**, the first week after it with something to decide, with a door to Ahead (`weeks.ts` `nextBusyWeek`), so an all-clear week is never a dead end.

## The events, and where each date comes from

Nothing works a date out a second way (`events.ts`):

| Kind | When | From |
| --- | --- | --- |
| Talk now | At or under the studio's number today, or the package ended | The lane rule (`admin/renewals/lanes.ts`): home clients only, Inactive out |
| Talk due | The day sessions left reach the studio's number, with its range | `renewals/pipeline.ts` `conversationDueRange`, counted from the day Mindbody counted |
| Before the charge | Opens `chargeWarnDays` before an auto-renewing charge with `chargeWarnMinBanked` or more banked; today when the window is open | The nightly record's `chargeDate` and `bankedAtCharge` |
| Charge · Renews · Billing ends · Ends | The commitment's end, said by the decided auto-renew answer (paid in full: Ends, estimated) | `commitmentEnd`, `autoRenews`, `paymentMode`; a coach's paid-in-full lock means nothing charges |
| Runs out | Out of sessions two weeks or more before the end (`RUN_OUT_MARGIN_DAYS`), with its range | `projection.runOutDate`, `runOutRange` |
| May slip | The next Journey line crossed if nothing is booked, only as far as bookings are known (30 days) | `line-crossing.ts`, in `journeyOf`'s order, off the Journey's own entries |
| Back | The return from Vacation, Snowbird or Medical | `awayUntil` |
| Birthday · Anniversary | Month's own rows, Not confirmed kept | `month/month.ts` |

A renewal already signed (`renewalOnBooks`) or recorded (renewed, upgraded, downgraded) has nothing ahead. A decided cycle has no talk due. An Inactive client keeps only their moments. A client with no nightly record, or not enough Mindbody data (`situation: "unknown"`), is counted under "can't be placed yet" with the first data gap, never dropped. A client with no pace yet (under 21 days) shows Mindbody's own dates and says "Not enough to project yet". A talk within two weeks of the same client's birthday or anniversary names it on the talk's row (`PAIR_DAYS`).

## The dates count from the day Mindbody counted (AJ: "2a")

Sessions left is Mindbody's number at its last pull, which can be weeks old. The renewals engine now counts the run-out day, the projection and the conversation's day from the day of that count. It also keeps `paceRange` and `runOutRange` on the snapshot, so every date can say its range. All of this is in `renewals/projection.ts` `projectionStart` and `renewals/README.md`. Ahead reads those fields; it adds no arithmetic of its own to them.

## The reads (`useAhead.ts`)

- The roster the app already streams, with each client's nightly renewal record.
- `useStudioJourneys`: the shared listener pair Today, Week and Month open, plus the renewal settings, the studio's lines and the inactive marks.
- `useCyclesRead`: one listener per 30 cycles by id, for who last talked and the plan, for the clients with a renewal date in the weeks drawn.

Ahead makes no Mindbody call, adds no query shape (so no index), writes nothing of its own, and contacts nobody. The events are worked out twice: once without the conversations, to choose whose to read, then with them.

## Files

| File | What |
| --- | --- |
| `events.ts` | Every client's events; `cantPlaceWhy`; `shortestTier` |
| `line-crossing.ts` | The next line if nothing is booked, checked day by day against `journeyOf` |
| `weeks.ts` | The span, Monday weeks, the run with clear stretches folded, the counts line, pile-ups, the strip, the lenses, the Clients view's groups, `nextBusyWeek` |
| `clocks-geometry.ts` | The two clocks as positions (pure, no DOM) |
| `useAhead.ts` | The reads |
| `AheadPage.tsx` | The page: header, counts, notes, can't place, the switch, lenses, trainer, the view and the panel |
| `WeekRun.tsx` · `ClientClocks.tsx` · `AheadPeek.tsx` · `marks.tsx` | The views, the panel (`chartLabels` keeps its labels apart), the marks and the clock bar |
| `ahead.css` | `ops-ah-*`, admin tokens only; container queries on the page; sticky strip and axis take back the scroller's padding |

Tests: each pure file beside itself; `AheadPage.render.test.tsx` mounts both views and the panel; `AdminDashboardView.render.test.tsx` opens it from the shell; `WeekPage.render.test.tsx` holds Further ahead.

## What it won't say

- No churn score, percentage or heat map, and no ranking of trainers. Nothing is sent to anyone.
- No projected date without a pace (21 days of visits), and none without "around" and its range.
- No May slip past the bookings Journey can see.
- Nothing called clear while the nightly record can't judge (the note says so once).
- Sessions left on every screen is Mindbody's number, never counted down.
