# Operations → Month, and a client's first day at the studio

*Sep 29 2026. Branch `ops-month` (worktree `.claude/worktrees/month-view`), two commits on master's `bb90d773` (wave 2, live). No rules, index, Cloud Functions or Mindbody change: the new client field goes through the clients update rule as it stands.*

## What AJ asked for

> another thing i want to prioritze really fast is in operations we need the ability to be able to see all of a givens months, renewals, birthdays and anniversaries and MIA list.
>
> a lot of studio leadership will normally ask themselves. what do i need to worry about today, this week and this month. today the clients coming in matter the most. tomorrow is making sure we are ready for them and the rest this week. the sooner we can get ahead of an issue the better
>
> we need to make sure setting a clients anniversary for their first day in the studio is intuitive

## 1. Operations → Month (`21bde9b`)

Today is the brief and Week is the week; **Month** is the third question, and the sixth destination of Operations for that reason: **Today · Week · Month · Clients · Team · Setup** (`shell/places.ts`; the sidebar in landscape and the tabs in portrait pick it up from the one list). One page, like Today. `src/features/admin/month/README.md` is the folder's own account.

- **Any month.** The month in words with ‹ › either side (a year each way) and **This month** when away from it. Next month is how a leader gets ahead; last month is how they look back.
- **A bottom line by rules.** "October will have 6 renewals, 4 birthdays and 3 anniversaries. 5 clients are MIA today, and 2 can't be judged yet." The rules are a tap away, as on Today.
- **Renewals** — every package that effectively ends in the month (`focusDate`, the pipeline's own key), soonest first, with the lane's word (Talk now · Before the charge · Coming up · Lapsed · Away) or the decision (Renewed · Lost · Pay as you go), the next step in words, and who last talked to her. A client whose renewal timing is unknown is COUNTED in the header, never dropped; "nobody has talked to them yet" is said only when the conversations were read (ONE chunked read of the month's cycles, a few dozen keys at most).
- **Birthdays** — who turns what on which day, from the date of birth's digits (never through UTC); a decade birthday is marked; how many have no date of birth on file. A Feb 29 birthday falls on Feb 28 in a year without one.
- **Anniversaries** — whole years with the studio, from her first day (below). A day inferred from Mindbody is called **a guess**, with the nudge "Set their first day on Account to be sure", and the header counts the guesses. A Journey-only date gives no anniversary at all; those clients are counted as having no first day to count from.
- **MIA** — the Journey's Drifting, At risk and Lapsed (`journey/states.ts`, the ONE rule, never a second one): Drifting first, the earliest line and the most catchable, then At risk, then Lapsed, and inside each the most recently crossed first. Each row: why, the proof, who she usually trains with and whether they are in today, who owns her case, snoozed or dismissed. It is "as of today" whichever month is open, nothing is listed until the Journey is ready, and the clients the Journey can't judge are counted.
- Every row opens the client inside Operations, as the Journey's do.

**The reads.** Nothing per client and nothing written: the roster the app already streams (the nightly renewal snapshot, the date of birth, the first day), the Journey's listener pair (`useStudioJourneys`, the same Today and Week use), and the one chunked cycles read.

## 2. Her first day at the studio (`eb7dd1b`)

The anniversary rule. Every date the app could infer for when a client started — her first session in Journey, Mindbody's first visit, the day Mindbody made her record, her first package — is only an **upper bound**: a twelve-year client's anniversary landed on a date years late. So a person sets the day once, and the app reads it before every inferred one.

- **`client.firstStudioDay`** (`YYYY-MM-DD`), the day a person set. `lib/client-since.ts` reads it first (source `stated`, as a calendar day at noon so the date trap can't move it, and it refuses a day that doesn't exist); `client-story/story.ts`'s `storySince` reads it as the surest date; Today's and Week's milestones (`overview/moments.ts`) read it through `resolveClientSince` and say "First day … (set on their profile)". So "Client since" on the profile header, the codex Story's since line, the Client Directory's column and the Month page all agree.
- **Where it is set:** Notes & Profile → Account → **First day at the studio**, a card beside On file with Mindbody (`client-admin/MembershipSection.tsx`). It goes through the ONE record form, so the Save bar names it ("Account · First day at the studio"), only the diff is written, and anyone the clients update rule lets edit the client may set it; everyone else reads. Until it is set the card says the app's guess and where it came from ("Not set · the best guess is Jan 15, 2020 · Until it is set, the app goes by the first visit Mindbody has"), and the editor's hint says the true first day is usually earlier.
- **Where a leader is told to set it:** the Month page's Anniversaries section counts the guesses and each guessed row says so.

## What it refuses to say

- A renewal whose timing is unknown is never left out of the month silently.
- "Nobody has talked to them yet" only off a read that answered.
- An anniversary off a Journey-only date, or a birthday off no date of birth, never.
- A slipping client off an unread week or a stopped nightly record, never (the Journey's own refusals, inherited).

## Open for AJ (defaults applied)

1. **Month sits between Week and Clients**, as the third of "today, this week, this month". Say if it should sit elsewhere.
2. **The arrows reach a year each way.** Say if further.
3. **MIA is the Journey's Drifting + At risk + Lapsed**, in that order (most catchable first). Say if Away or Unknown should be listed too, or if Lapsed should come first.
4. **A guessed anniversary is still listed**, marked as a guess, rather than hidden until the day is set — a leader would rather know and set it than miss it.
5. **Nothing writes the first day for you.** A backfill from FileMaker's first-visit date, when the extraction lands, would be an importer's job (`priorHistory.from` already carries a first day the prior record covers; `storySince` reads it, and `firstStudioDay` should win over it when both exist).

## Numbers

Measured in the worktree on AJ's PC (`node_modules` a junction to the main checkout's).

| Check | Result |
| --- | --- |
| Typecheck | **4**, the baseline |
| The folders' tests (`TZ=America/New_York npx vitest run --dir src …`) | `admin/month` 15 (7 pure, 4 mounted), `client-since` 6, `story`, `record-form`, `moments`, `places`, `MembershipSection.render` (+2), `AdminDashboardView.render`: all green |

The full suite and the build are measured on the integration branch (`docs/rounds/2026-09-29-sep29.md`).

## To walk on the iPad

Testing checklist Round 39.
