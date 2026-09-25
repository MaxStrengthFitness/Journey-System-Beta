# Prior history: legacy clients stop reading "first time" or "on a break" (Sep 24 2026)

**AJ's brief:** "we need to ensure that legacy FileMaker clients aren't
defaulting to 'first time' or 'on a break' if their historical data dictates
otherwise."

**Branch:** `claude/prior-history-claims`, six commits, one per phase, each
typechecked on its own so it can be reverted alone. Not pushed to `master`.

## What was wrong

The app already had the gate. `lib/client-coverage.ts` says whether Journey
holds a client's whole story (complete / partial / unknown), and the Hub card
used it. Most other screens didn't. The same migrating client, a woman with
twelve years of FileMaker sessions and three in Journey, read:

| Screen | What it said |
| --- | --- |
| Active Session: the machine sheet, the set-up prompt | "First time on this machine" |
| Profile: the machine window, Programming → All machines | "Never performed by this client", "First performed Sep 2" |
| Active Session: the session bar, the grid's columns | "#3" |
| Post-session (the client is standing next to it) | "First time" beside every machine, "3 new machines", "session #3" |
| Profile header | "Completed sessions 0" while the count loaded, and forever if the count failed; "3" as if it were her total |
| Profile: the Journey grid | "Start of history"; and with a failed count, her page numbered #7 down to #1 |
| History tab | "No visit in 4 weeks" in crimson, and "3-week break" rows, for weeks recorded only in FileMaker; rows S1, S2, S3 |
| Progress report (printed, handed to her) | "3 Total Sessions · First Session Sep 2" |
| Profile banner | No "Report Required": it judged tenure from the day Journey's record was created |
| Kaizen Deep Dive | "All time" |
| Profile header, report header | "Client since Sep 2026", "Joined Sep 2026" |

Two more things came up along the way:

- The Active Session and the profile judged coverage by the **iPad's** studio
  cutover. The rule is the client's **home** studio's.
- `client.firstSessionDate` is stamped by the Active Session the first time
  **Journey** sees a client. For a migrating client that is recent, and
  "Client since" ranked it above Mindbody's own first visit.

## The rule now

**A claim about the client** ("first time", "session #4", "a five-week
break", "total sessions") **is made only when Journey holds her whole story.**
Anything short of that gets a claim about our records ("nothing recorded",
"sessions in Journey", "in Journey since") or says nothing. Every wording
lives in one file, `src/lib/history-claims.ts`, and every function in it
defaults to the cautious wording. A screen that forgets to pass coverage says
too little. It never calls a twelve-year client new.

| Claim | Complete story | Anything else |
| --- | --- | --- |
| Machine with nothing on it | First time on this machine | Nothing recorded on this machine |
| Machine window | Never performed / First performed / Times performed | Nothing recorded … in Journey / First in Journey / Times in Journey |
| Post-session tag and headline | First time · 2 new machines | (nothing) |
| Session number | #413 | no number, unless a prior record gives her total (then #413 again) |
| Profile count | Completed sessions | Sessions in Journey (and "—" while unknown, never 0) |
| Grid rail | Start of history | Start of Journey |
| Deep Dive's widest range | All time | All in Journey |
| Report tile | Total Sessions · First Session | Sessions · Since, plus "412 before Journey" when recorded |
| No report yet | … no progress report on file | No progress report in Journey yet |

### Breaks: the days Journey owns

Long-standing clients stay "partial" forever (their prior history is
permanent), so "no breaks unless complete" would have switched the History
tab's absence warning off for most of the roster for good. Instead,
`ownedWindow` works out the days Journey sees every session for: the whole
timeline for a complete story, and otherwise the days from the home studio's
cutover, or after her prior record runs through, whichever is later. A gap
counts as a break only if it **begins** inside that window. With no cutover
set (beta), nothing is claimed. Once her studio is live, a real break is a
break again.

With no owned day yet, the History tab's two break tiles become **"In Journey
since"** and **"Before Journey"** (the recorded prior count, or "not
recorded yet").

### Colour

The ongoing-break notice, row and tile used the crimson that is reserved for
rep quality. They use the equipment tokens' warning plum (`--eq-warn`) now.

### Report Required

The banner appears once the client has been with the studio three months,
judged from the **oldest** date anywhere on her record (`earliestKnownDate`)
or from a prior record. Before, it used the day Journey made her document.

### Client since

The three proven dates (first session in Journey, Mindbody's first visit,
Mindbody's created date) are each only an upper bound on when she started,
so the **earliest** now wins. For a new client they're days apart and nothing
changes. This reverses one deliberate test ("prefers the first session over
the first appointment"). It is its own commit (phase 6) so it can be reverted
alone. It also moves the Overview's "N years with the studio" anniversaries
onto the earliest date.

## Phases

1. `lib/history-claims.ts` and its tests; `homeCutoverOf`; `earliestKnownDate`.
2. The floor: Active Session (home cutover, session bar, grid heads), machine
   sheet, set-up prompt, Now Bar, post-session, Hub cards.
3. The profile: header count, machine window and All machines, grid heads and
   rail, Report Required, home-cutover coverage.
4. History: the owned window, the tiles, plum, numbering on top of prior history.
5. Progress report and Deep Dive.
6. "Client since" takes the earliest proven date.

## Tests

- New pure tests: `history-claims.test.ts`, `client-since.test.ts`, plus
  additions to `client-coverage`, `post-session`, `client-history/model` and
  `joined`.
- New render tests: `features/equipment/floor-claims.render.test.tsx` (machine
  sheet and set-up prompt), `features/client-history/HistoryView.render.test.tsx`.
- Render tests extended: the Active Session (session number, home cutover),
  post-session, the Journey grid (heads, rail, today's column), the profile
  header, the machine window, the Deep Dive, the progress report.
- `ClientProfileView` itself still has no mount. What changed inside it is
  mounted by the header, grid and machine-window tests. The banner's decision
  is a tested pure function.

## Merging with `client-codex`

`client-codex` makes the same coverage change in `ClientProfileView`
(`coverageOfClient` with the home studio), so that block will conflict, and
the two sides agree. Take either and keep `canQuoteNumber`, which this branch
adds just below it. The unused `historyCoverage` / `studioDayKeyOf` imports in
`ClientProfileView` are left for `client-codex` to remove, as it already does.
Nothing else here touches the files it changes, apart from appended test cases
in `VictoryHUDScreen.render.test.tsx`.

## Left open

- **"Visits a week" and "Typical gap"** on the History tab still count only
  Journey's sessions. Not a first-time or break claim, but during beta it
  undercounts a client whose sessions are split with FileMaker.
- **The session number written on a new session** is still `sessionCount + 1`.
  For a migrating client with no prior record, that's Journey's count. Every
  screen now gates it; the stored number is unchanged.
- **Operations' "on a break" watchlist and the renewal engine** read Mindbody
  attendance, not Journey sessions. They were outside this sweep. They already
  treat days before the first synced booking as unknown.
- **The progress report's default narrative** ("Thank you for your
  consistency…") is unchanged. It makes no claim about history on its own.

## On the client codex (landing, Sep 24 2026)

This round was written before the codex, so its screens stopped at the
codex's edge. At the landing every codex page was checked for the claims
this round governs (first session, "new", breaks, session numbers, counts,
"since" dates, "never"), and none needed rewording, because each already
words them through the coverage and the prior record the profile hands down:

- **Overview**: its Story slot is the Story's own since line; "No notes in
  Journey yet" and "No Pulse saved in Journey yet" say where they looked.
- **Story**: "First session." only when Journey holds the whole story and no
  prior record exists, else "First session recorded in Journey."; the since
  line counts the prior record's sessions and Journey's apart, adds the
  coverage caveat, and dates the start from the prior record's `from` or
  Mindbody's own first visit, never from Journey's first session unless the
  story is complete (`storySince`).
- **Body & Pulse, Over time**: counts are "in Journey", imported and logged
  sessions are named for what they are, and the footer names the sessions
  before Journey it does not draw.
- **Account**: the contract history's first tile is the years before
  Journey (or "Not recorded here" with the caveat); "first visit" only of
  Mindbody's own date; Mindbody's visit count is labelled as Mindbody's.
- **Goals & Focus**: makes no claim about her past beyond what is written.

Left open: the header's "Client since" (`clientSinceLabel`) and the Story's
since line can disagree on the same screen for a long-standing client whose
only date is the day Journey met her ("Client since Sep 2026" above, "In
Journey since Sep 2026" below), and the header does not read the prior
record's `from`. Changing the header's words is AJ's call.
