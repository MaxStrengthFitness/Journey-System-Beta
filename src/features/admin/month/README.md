# Operations → Month — a month's renewals, birthdays and anniversaries, and who is MIA

*Sep 29 2026. AJ: "in operations we need the ability to be able to see all of a given month's renewals, birthdays and anniversaries and MIA list. A lot of studio leadership will normally ask themselves: what do I need to worry about today, this week and this month. Today the clients coming in matter the most. Tomorrow is making sure we are ready for them and the rest this week. The sooner we can get ahead of an issue the better."*

Today is the brief and Week is the week; **Month** is the third of AJ's three questions, and the sixth destination of Operations for that reason (`shell/places.ts`: Today · Week · Month · Clients · Team · Setup; Ahead joined beside it on Oct 7 2026, making seven). It is one page, like Today.

## The page

`MonthPage.tsx`. The month in words with ‹ › either side (a year each way) and **This month** when away from it; a counts line (renewals, birthdays, anniversaries and MIA today, `CountsLine`, its rules behind an (i); the month's written bottom line, "October will have 6 renewals, 4 birthdays and 3 anniversaries. 5 clients are MIA today.", went in the calm round, Oct 3 2026); then four sections, each a card of rows grouped by day, and each row opening the client inside Operations:

| Section | What it lists | What it refuses to say |
| --- | --- | --- |
| **Renewals** | every package that effectively ends in the month (`focusDate`, the pipeline's own key), soonest first, with the lane's word (Talk now · Before the charge · Coming up · Lapsed · Away), or Renewed / Lost / Pay as you go once decided, and the next step | a client whose renewal timing is unknown is COUNTED in the header, never dropped; "nobody has talked to them yet" only when the conversations were read |
| **Birthdays** | who turns what on which day, from the date of birth's digits; a decade birthday is marked | how many have no date of birth on file |
| **Anniversaries** | whole years with the studio, from her first day | a day inferred from Mindbody is called **a guess**, with a nudge to set the real day on Account; a Journey-only date gives no anniversary, and those clients are counted as having no first day to count from |
| **MIA** | the Journey's Drifting, At risk and Lapsed clients (`journey/states.ts`, the ONE rule), Drifting first — the earliest line, the most catchable — then the most recently crossed first; who she usually trains with, whether they are in today, who owns her case, snoozed or dismissed | nothing until the Journey is ready; "as of today" whichever month is open; the clients the Journey can't judge are counted |

## The reads

Nothing per client, nothing written. The roster is the app's client list (the nightly renewal snapshot, the date of birth, the first day); the Journey is `useStudioJourneys`, the same listener pair Today and Week use; the conversations are ONE chunked read of the cycles whose package ends in the month (`renewals/usePipeline` `useCyclesRead`, a few dozen keys at most), so "nobody has talked to them" is said only off a read that answered.

## Her first day at the studio (the anniversary rule)

Every date the app could infer for when a client started — her first session in Journey, Mindbody's first visit, when Mindbody made her record, her first package — is only an upper bound, so a twelve-year client's anniversary would land on the wrong day. `client.firstStudioDay` (`YYYY-MM-DD`) is the day a person set, on **Notes & Profile → Account → First day at the studio** (`client-admin/MembershipSection.tsx`, through the ONE record form, so the Save bar names it), and `lib/client-since.ts` reads it before every inferred date (source `stated`). "Client since" on the profile header, the codex Story's since line, the Client Directory's column, Today's and Week's milestones and this page's anniversaries all follow. The card says the app's guess and where it came from until the day is set, and this page's Anniversaries section counts how many of the month's are guesses.

## Files

- `month.ts` — pure: the months, the four lists, the day groups (the month's sentence, `monthSentence`, went in the calm round, Oct 3 2026); `month.test.ts`.
- `MonthPage.tsx` — the screen; `MonthPage.render.test.tsx` mounts it over a studio's worth of answers.
- `../shell/places.ts` — the destination; `../shell/OperationsNav.tsx` its icon; `../shell/ops.css` the month nav and the row head (`ops-month-*`).
