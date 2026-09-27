# The voice review — AJ's notes on the Screen Atlas, built

*Sep 27 2026. Branch `claude/wizardly-davinci-x3onwn`, one commit per phase,
master merged in after the app review. The standing week has its own round
document, `2026-09-27-standing-week.md`.*

## What AJ asked for

AJ recorded a voice review of the Journey Screen Atlas. He asked for each item
to be found in the code and a plan proposed before anything changed. The key
decisions:

- rename the post-session screen from "briefing" to "wrap-up" everywhere;
- move the Network view out of My Studio → Relay into Operations;
- the client profile's four tabs are ordered by depth on purpose;
- Learning, My Studio and Settings need a visual rework to match the upgraded
  app.

Two things needed a rethink before beta: the My Studio Team section, whose
purpose was unclear and overlapped the Hub and Relay, and a per-trainer
standing schedule that locks recurring clients into fixed weekly slots.

His answers to the plan, in his words:

> "briefing is strictly pre-session while wrap up is post-session. I do like
> the idea to make it so the end session note is for the next trainer ... But
> also you should be able to note just to the client's profile without
> notifying that trainer as well."

> "I agree, drop the ranking entirely when network moves because the
> underlying metrics are currently flawed ... carrying it over would misinform
> users."

> "Your proposed wording is excellent and should be recorded exactly as
> written."

> "The visual rework, um, I want you to use your creative control to just kind
> of handle this stuff. Once we get a final design on our total project, we'll
> really take a deeper look at the visual."

> "Execute the people and standards pivot ... Relay must prioritize the
> trainers transitioning between clients. Leaders running the day have
> operations and the hub to rely on."

> "The lock should operate strictly within journey, option A, by checking
> actual MyBody bookings against the standing template and flagging for
> discrepancies ... Journey should never execute write holds ... Trainers
> should propose and set their own ideal week via my profile while leaders
> review and finalize those standings with newly focused team section."

---

## What was built, phase by phase

### Voice review 1 — an initiative posts with its default choices (`4aad65b`)

Found while tracing the Network: "Launch an initiative" on the Network tab,
and Team's "Route to team", sent `dueOn: undefined` for "No date" and
`perTrainer: undefined` for "No number". Firestore's browser library refuses
a document holding `undefined` before the write leaves the iPad. So a network
launch posted at "0 of N studios", and a routed cohort said "check your
connection". `targetForWrite` (`studio-tasks/initiatives.ts`) now leaves out
what was not chosen and keeps 0 as "participation only". The test's fake
refuses `undefined` the way the real library does, and fails without the fix.

### Voice review 2 — Relay's style names stop restyling other screens (`67f9f33`)

Relay's stylesheet defined `.pk-*` classes, and so did the packages sheet.
Once a stylesheet has loaded it stays in the page, so after anyone opened
Relay, the packages sheet was drawn with Relay's cards. Relay's classes are
`rk-*` now, the Now Bar's `rnb`, the shift rings' `shr`. The new
`src/css-class-owners.test.ts` fails when two stylesheets define the same
plain class. KNOWN-TRAPS: "One stylesheet owns a class".

### Voice review 3 and 4 — the Wrap-up, and its two notes (`0315646`, `2d3fced`)

- **The post-session screen is the Wrap-up**: its kicker, the journal card's
  origin ("Wrap-up"), the progress report archive ("· wrap-up") and FORD
  ("Caught at the wrap-up"). "Briefing" now appears only before a session. In
  code the screen is `src/components/WrapUpScreen.tsx` (it was
  `VictoryHUDScreen`). Stored values keep their words (`origin:
  "post_session"`, FORD's `origin: "briefing"`), as the Pulse rename did.
- **The End Session box is the Note for the next trainer.** It still files as
  a Heads up, which the next trainer's briefing shows for three weeks, and now
  it says so.
- **The Wrap-up's note is the Profile note.** At Note loudness it stays on the
  client's profile and never reaches the briefing ("Stays on {her name}'s
  profile. The next trainer's briefing won't show it."). Heads up or Critical
  sends it there too. This is AJ's "note just to the client's profile without
  notifying that trainer".
- CLAUDE.md's decision "Briefing is strictly pre-session; Wrap-up is
  post-session", the glossary, START-HERE, the floor and business docs, and
  ARCHITECTURE §2.4.

### Voice review 5 — the profile's tabs by depth (`f737191`)

Recorded exactly as approved, in CLAUDE.md, the client profile README,
`profile-nav.ts`, START-HERE and ARCHITECTURE §2.3: "The four tabs run by
depth: Journey (what she has done, the glance on the floor), Programming
(what she's meant to do), Notes & Profile (who she is), Activity Archive (the
whole record). Don't reorder, merge or add a tab without asking."
`profile-nav.test.ts` fails if the order moves.

### Voice review 6 and 7 — the network on Operations, the ranking gone (`f22c2c8`, `3ecbdca`)

- **Operations → Overview → All my studios** now holds what Relay's Network
  tab did: Focus this quarter (one per network you own; the banner on each
  studio's Floor) and Launch an initiative (asks first, names every studio,
  retries only the studios it missed). `admin/network/network-actions.ts` is
  the pure half. An owner who sees only one studio finds both at the foot of
  that studio's Overview, so nobody loses the door.
- **Relay is Floor · Mine · Notes**: the trainer between clients (AJ's answer
  to question 8).
- **The ranking of studios is gone.** Its "New this month" counted clients new
  to Journey during the migration, needed a missing index, and "Loops closed"
  favoured studios with more machines. Studios may be compared again only on
  measures with a named minimum sample (CLAUDE.md, Recognition, never
  ranking).

### Voice review 8 — My Studio → Team is people and standards (`a474b19`)

Team had answered the Hub's question (who's in today) and Operations' (the
month's client groups), each by a rule of its own. Now:

- **Gone from Team:** who's in today (the Hub), the client groups
  (Operations: Renewals, the attendance watch, the week's moments, the
  Delight queue), the four tiles and the per-person standing chips.
- **Team is** each person's week by name, never ranked, with no "Behind"
  verdict. It also holds the standing duties and their seven days,
  initiatives, the loops left open (with the shift list's reports, counted
  once beside the Floor Map's flags), the vault, and this studio's staff.
  Who is waiting to be let in shows at the top, with a button that goes to
  them.
- `relay/team/TeamPanel.tsx`'s header says what went and where.

### Standing week 1 to 7

See `2026-09-27-standing-week.md`. In short:

- A trainer proposes their usual week on My Profile: their hours and their
  regulars.
- A studio leader agrees it on My Studio → Team, as it is or changed first.
- Team then checks the next seven days' bookings against every agreed week and
  lists the free slots, the regulars booked elsewhere, and the slots someone
  else is booked in.
- Nothing is written to Mindbody.
- A move is claimed only with proof: after merging master, the check follows
  the client calendar's "real rebook" rule from the app review.

### Voice review 9 — Settings, and Learning's colours (`8c7df37`)

AJ asked for this to stay light until the whole design is settled.

- **Settings** now uses the card My Profile uses, in place of italic capitals.
  The role is shown by its name, and status words are in colours readable on
  white. The catalog-wide machine count goes. "Not linked" to Mindbody says
  who links you. The Operations door asks `mayOpenOperations` and opens in
  Operations mode. The gear button is "Trainer Settings", and the screen has
  a first render test.
- **Learning** (the Catalog and the Academy) had hand-copied colour tokens
  that drifted: clinical warnings were amber where the rest of the app says
  caution in plum, and in dark mode the orange buttons had white text on light
  orange. They now carry `equipment.tokens.css`'s values, held there by
  `learning-tokens.test.ts`. The catalog's Save button moved to the darker
  orange.
- The app's messages about a missing Mindbody Site or Location ID, and the
  Limbo subtitle, point at My Studio → Studio.
- **My Studio's restyle is deferred.** It is the biggest of the three screens
  and still changing ("we're still kind of choosing what is on which screen").

---

## Deploy order

The rules change is one new block, `studios/{s}/standingWeeks`, and it only
adds access. No index, no Cloud Function, no Mindbody change.

1. `npm run test:rules` on AJ's PC (the run that counts).
2. `firebase deploy --only firestore:rules`. The running app is unaffected.
3. Push to `master`: the app goes live.

`scripts/ship/ship-voice-review.ps1` does exactly this: `prepare` (changes
nothing), then `golive` (rules, restore tag, push). If the app goes live
before the rules, My Profile and Team say "the new database rules may not be
deployed yet" rather than failing quietly.

## Measured

| | |
| --- | --- |
| Typecheck | 4 (the baseline) |
| Suite | **5,866** passing in 377 files (`TZ=America/New_York npx vitest run --dir src`, the cloud container, after merging master) |
| Rules tests | 173, in the cloud container; AJ's run is the one that counts |
| Build | `npm run build` and `npm run build:backend` |
| Case check | no two tracked files differ only by case |

## Open, for AJ

- **Two names for signing out.** The trainer menu has "Switch Trainer" and
  "Log Out Facility", and both sign out; Settings says "Sign out". Whether to
  merge the first two is already recorded as your call (AppContent's comment).
- **The standing week on the Hub.** An agreed slot with no booking could show
  as a faint outline in the trainer's column. It isn't built: the Hub's open
  slots were removed on Sep 6 as "a sales question".
- **Operations → Changes still calls any other booking that week a
  reschedule.** The client calendar and the standing week now use the
  real-rebook rule. The app review offered `isRealRebook` for Changes too.
- **The same "Admin → Studios" wording inside `lib/mindbody-api-sync.ts`**
  (the sync's own messages and Limbo reasons) was left alone, because that
  file is the Mindbody integration.
- **My Studio's visual pass**, once the screens settle.
