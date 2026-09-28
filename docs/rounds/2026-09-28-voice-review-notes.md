# The voice review notes — a third look, and what was left

*Sep 28 2026. Branch `voice-review-notes` on master's `b5c8a35` (the calm
Hub), one commit per unit. The rounds before this one are
`2026-09-27-voice-review.md` (the build, Sep 26 in the evening) and
`2026-09-27-voice-review-followup.md` (the audit and its fixes, Sep 27).*

## What AJ sent

"Screen Atlas Voice Review — AJ's Notes" (a document dated Sep 28, written
up from the voice walkthrough of the Screen Atlas), with its prompt: for each
item in the "Code" action list, show where it lives in the code and propose a
plan before changing anything, explained for a beginner; priorities: the
Wrap-up rename, Network to Operations, Relay as Floor · Mine · Notes, a plan
for the standing schedule, options for Team. AJ added: *"this is based off
our blueprint and i want this all pushed to master"*.

## The nine code items, and where each one lives

Five of the nine were built on Sep 26 and followed up on Sep 27; both rounds
are on master. This round checked each against the code again.

| # | The notes' item | Where it is | State |
| --- | --- | --- | --- |
| 1 | Rename the post-session briefing to the wrap-up | `src/components/WrapUpScreen.tsx` (was `VictoryHUDScreen`); CLAUDE.md's decision "Briefing is strictly pre-session; Wrap-up is post-session"; the glossary | **Done** Sep 26 (`0315646`, `2d3fced`), follow-up A. The only "post session briefing" left in the code is AJ's own Sep 18 words, quoted in a comment (`client-notes/session-draft.ts`) |
| 2 | Move Network out of My Studio → Relay into Operations | `src/features/admin/network/` (`NetworkOverview`, `NetworkActions`, `network-actions.ts`): Operations → Overview → All my studios, and the foot of a one-studio owner's Overview. `relay/board/NetworkView.tsx` no longer exists | **Done** Sep 26 (`f22c2c8`, `3ecbdca`), follow-up B. The ranking of studios was dropped (AJ: its numbers were wrong) |
| 3 | Reshape Relay into Floor, Mine and Notes | `src/features/relay/PlannerView.tsx` (`TABS`, `PlannerTab`) | **Done** Sep 26. See "Relay's tab names" below: the blueprint's default renames them |
| 4 | Keep resolved open questions as a trail in client history | Not built. What it would stand on: Relay's asks (`studio-tasks/requests.ts`, kind `question`, with a `clientId`) and note threads (`client-notes/threads.ts`, `thread-write.ts`) | **Plan below, for AJ's word** |
| 5 | Build the trainer standing schedule | `src/features/standing-week/` (My Profile → My standing week; My Studio → Team agrees it) and `src/features/openings/` (Who's usually in, A new regular time) | **Done** as its own round (`2026-09-27-standing-week.md`), then Openings (`2026-09-27-openings.md`). "You're always my Monday at 8am" is a regular on the standing week; matching a client who wants Monday 8pm is Openings → A new regular time |
| 6 | Rethink the Team section | `src/features/relay/team/TeamPanel.tsx` | **Done**: AJ chose "people and standards" on Sep 26 (`a474b19`), follow-up C. The notes' sketch (who's in today, workload) is what the pivot moved to the Hub and Operations |
| 7 | Keep studio-local machine notes out of the company-wide catalog | `catalog/mutations.ts` (a studio's notes), `machine-db/ShareToggle.tsx` and `machine-db/hooks.ts` (the Share switch, off by default), `admin/catalog/` (only an administrator's Publish changes `machines/`) | **Holds on every screen.** Three things underneath need AJ's word (below) |
| 8 | Make the Studio settings area read-only for trainers | `src/features/my-studio/StudioSection.tsx`, `MyStudioView.tsx` | **Built in this round** (unit 1) |
| 9 | Visual rework of Learning, My Studio and Settings | `features/learning/README.md` "How Learning looks", `features/my-studio/README.md` "How My Studio looks", `features/settings/TrainerSettingsView.tsx` | **Light pass done** Sep 26 (Settings, Learning's colours) and Sep 27 (follow-up F and G: colours, type, 40px taps, whole names). AJ: "use your creative control ... Once we get a final design on our total project, we'll really take a deeper look". The deeper look is the Redesign Blueprints' rooms (Relay next; the Catalog and the Codex for Learning) |

## What was built

### Unit 1 — My Studio → Studio, read only for everyone else who works there

AJ, in the notes: *"Leaders edit it; trainers can view it read-only. Studio
settings are edited here and nowhere else."* Until now a trainer did not get
the Studio section at all (a test said so: "never offers the Studio section
to a trainer").

- **Who sees it.** The section is offered to anyone who leads the studio or
  works there (`leadsHere || mayReadWeeks`: home, also works at, a guest,
  franchise owners, administrators). The rules already let exactly them read
  the studio, its renewal settings and its notices, and they already refuse
  a trainer's writes, so **no rules change**. The section asks the same two
  questions itself, since a menu is not a gate.
- **What a trainer sees.** Every panel, with its fields locked (a disabled
  fieldset, the pattern `StudioDetailsForm` already had and nobody used): no
  save bar, no "Use Max Strength's defaults", no Publish or Take down. Each
  panel says who changes it ("Only this studio's leaders can change the
  studio's day."). The studio's notices are a plain list: title, Urgent, the
  first line and who posted it.
- **Readable, on an iPad.** A locked field draws its words in the kit's
  faint ink (3.1:1, meant for decoration), and iPad Safari fades a disabled
  field to 40% on top. On this page reading is the whole point, so the locked
  fields keep full ink (`.ms__readonly`, `my-studio.css`).
- **No Mindbody bill for looking.** The details form looked up the locations
  behind the Mindbody Site ID every time it opened: a Mindbody call through
  our server. A leader needs that to check a changed id; a reader never does.
  It is skipped when the form is read only, so a trainer's visit asks
  Mindbody nothing (`StudioDetailsForm.render.test.tsx` proves both sides).
- **The grant's hint** on Team now says what it adds: "Opens Team at
  {studio}, and lets them change its studio settings and machines".
- Tests: the My Studio mount test shows a trainer the section with every
  field locked and nothing that writes, and a trainer with the grant the
  editor; the InBody panel read only; the form's lookup.

### Unit 2 — Operations → Announcements posts as the signed-in person

Found by this round's audit of "edited here and nowhere else". The rules
accept a notice only when `authorId` is the signed-in person's Auth uid, and
Operations → Announcements sent the trainer document's id, which differs on
older accounts, so every publish from such an account failed with "Could not
publish". It now sends the uid first, as My Studio → Studio already did
(CLAUDE.md, "Use the Auth uid, not `authTrainer.id`"). A render test fails
without the fix.

The composer itself stays where it is. Posting a studio's notice from
Operations was AJ's call in the Operations overhaul (Sep 19: "leaders
announce to their own studio"), and a notice is a post, not a setting.

## AJ's answers (Sep 28 2026), and what they built

His answers to "For AJ's word" below, in his words:

1. The open-questions trail — the new link field, the Heads up on the next
   briefing, and building it in the Relay round: *"yes yes yes"*. It is
   being built in the Relay redesign round (`docs/rounds/2026-09-28-relay.md`).
2. The machine-notes rules: *"fix it"*.
3. The Share switch: *"it should submit to admins first for review, we can
   review in admin dashboard"*.
4. Operations → Mindbody's sync settings administrators only: *"yes"*.
5. Relay's tabs: *"Board Tracker Journal"* (the Relay round).

Then: *"lets keep moving to the next stage"* and *"lets try to complete all
rounds tonight and get it to master"*.

### Unit 3 — the rules: a studio's machine knowledge stays with it, sharing waits for an administrator, the sync settings are administrators'

One rules change, one commit, with its tests (206 passing, 202 before):

- **A studio's roster** (`studios/{s}/roster`: custom machines' whole
  definitions, local names, overrides) and its **Studio notes**
  (`studios/{s}/machineNotes`) are readable by the people who work at or
  run the studio, franchise owners and administrators (`writesForStudio`).
  Until now any signed-in account could read them by asking the database
  directly, which the Studio notes card promised it couldn't ("It does not
  follow you to other locations"). A machine an administrator shared stays
  readable by everyone through the `{path=**}/roster` rule, which also
  answers a direct read of that one document.
- **A studio's machine set-up** (`studioMachineSettings/{studio}_{machine}`)
  is read by the same people (the app reads it `where studioId ==`, which
  the rule can judge) and changed only by the studio's leaders and
  administrators, on the id the document names. Until now any trainer at any
  studio could create, change or delete any studio's set-up.
- **Only an administrator shares.** `shareDecisionOk` refuses a studio that
  sets `shared` to true, marks an offer "approved" or "declined", or writes
  the review fields; a studio may offer (`shareStatus: "pending"`) and take
  back. Administrators may list offers across studios. The check runs its
  field tests first and asks `isSuperAdmin()` only for a publish or a
  decision: the other way round, the tip and note rules ran out of
  Firestore's 1000-expression budget in the rules tests.
- **How often a studio asks Mindbody** (`autoSyncEnabled`,
  `syncIntervalMinutes`) is administrators' alone; a studio's leaders and
  franchise owners may still change everything else on the studio's record.

### Unit 4 — sharing waits for an administrator

- **The switch** says "Offer to all MSF studios". Offered, it says "Offered ·
  waiting for review" with "An administrator reads it before other studios
  see it. Tap to withdraw it."; shared, "Shared with all MSF studios"; after
  a no, "Offer again" with the administrator's note under it
  (`ShareToggle`, `shareStateOf`, `tapOffers`). A studio's own machine says
  the same in its card's sentence.
- **Admins → Waiting for review** (a new place on the Admins dashboard,
  `ShareReviewPanel`): every offer across studios, oldest first, each whole
  — what it is, whose (the studio the path names), who offered it and when,
  and what it says — with **Share with every studio** or **Don't share**
  (an optional note, up to 300 characters, the studio reads beside its
  switch). It reads once when opened, with Refresh; a failed read says it
  can't tell, never "Nothing waiting". Its three reads carry no index of
  their own (the database builds none automatically), so each scans that
  small collection group, and only administrators may run them.
- **Only the first share is reviewed.** A note or tip an administrator
  shared stays shared when its studio edits it. Whether every later edit
  should go back for review is for AJ.
- Offers already switched on before tonight stay shared: nothing changes a
  document that exists.

### Unit 5 — Operations → Mindbody's sync settings, for administrators

A studio leader sees "Automatic sync" and "Every" as read-only lines ("Administrators set how often a studio asks Mindbody, because it changes the Mindbody bill."); an administrator keeps the two controls. On the way, a real bug: the Mindbody panels' default interval was 15 minutes ("Matches syncPolicy") while the pull itself has run every 30 since the cost plan (Sep 26), so Operations → Mindbody and My Studio → Studio said "every 15 minutes" and called a studio lagging halfway to its real next pull. `diagnostics.ts` now takes `syncPolicy`'s default, so the two can't drift.

### Deploy (units 3–5)

`scripts/ship/ship-review-decisions.ps1`: `prepare` (the typecheck, the suite, THE rules tests on AJ's PC, the build), then `golive` (the restore tag, `firebase deploy --only firestore:rules`, the push). No index, no function, no server or Mindbody change. The rules narrow access and go first: the app the iPads run now only reads its own studio's machines, and for the minutes until the new app is live a studio's Share tap or a leader's sync change is refused with a message.

## For AJ's word

### Open questions as a trail in client history (item 4)

The notes: a low-urgency coaching question about one client, sourced from
the team, that needs an answer before she is next in, and whose whole
exchange stays on her record ("Austin opened it, Giovanni took it over,
together they got Nancy there").

What exists: Relay already takes "A question" in Capture, tied to a client
(`studios/{s}/taskRequests`, kind `question`, `clientId`), with replies, On it
and Can't, Take over, and a close that asks "What was the answer?". A client's
note is already a thread: an opening note, updates by whoever writes them,
each with its author, and closed when resolved (`journalEntries`,
`threadId`, `resolvedAt`). Nothing links the two: a closed question's replies
and answer are shown nowhere, and only the latest person to take it over is
kept.

The plan, needing **no new collection and no rules change**:

1. A question about a client opens a thread on her record, written by the
   person asking, and the ask remembers which thread it opened.
2. Each reply, each "I'll take it" and the answer are written onto that
   thread by the person doing it, so every line carries its real author
   (the rules only accept a note written by its own author, which is exactly
   what keeps the trail honest).
3. The answer closes the thread. The Notes page then shows the whole
   exchange, oldest first, under Resolved.
4. The Relay card names the client, and a closed question keeps its answer
   on screen.

Questions:

- **The briefing.** Should an open question show on that client's next
  briefing ("Open question from Austin: ...") so it is answered before she
  is in? The briefing is a floor screen, so this is yours to say. The
  default proposed: yes, as a Heads up, while it is open.
- **One new stored field.** The ask would keep the id of the thread it
  opened (`threadId`), and the thread would be labelled "Open question" (a
  new value for a note's kind). Both are additions to existing documents,
  no rules change; the house rule is that a new stored value needs your OK.
- **When.** It fits the Relay round of the Redesign Blueprints (the Ask
  sheet's "A question" tile and "Ask about this client"), so building it
  there saves building it twice. Or on its own now.

### Machine notes: what the screens promise and the rules don't (item 7)

On screen, a studio's notes stay with it: with the Share switch off (the
default) nothing a studio writes appears on another studio's Catalog, and
only an administrator's Publish changes the company catalog. Underneath:

- **The rules are looser than the screens.** Any signed-in account can read
  any studio's Studio notes (`studios/{s}/machineNotes`), its machine
  roster (custom machines' whole definitions and overrides) and its studio
  set-up (`studioMachineSettings`) by asking the database directly. The
  Studio notes card promises "It does not follow you to other locations".
- **Any trainer can change any studio's set-up card.** The rules let any
  trainer create, change or delete `studioMachineSettings/{studio}_{machine}`
  for every studio.
- **The Share switch is one tap to every studio.** With it on, a studio's
  note, tip or machine reaches every studio's Catalog under "From other MSF
  studios" without anyone reviewing it; for a note, any trainer at the
  studio can flip it, and later edits go out too. Is that still wanted, now
  that the notes say "Only the official standard flows company-wide"?
- **Publish copies a studio's set-up words.** Publishing a studio's own
  machine copies its whole definition into the catalog, the body-type
  adjustments included (where "for clients with really short arms" would
  sit), and the review highlights only the method fields. The review could
  list the studio-tier words too, so they are read before they become the
  standard's.

The first two are a rules change (tested on your PC, deployed before the
app). Say the word and they come next.

### Operations → Mindbody: a second editor, and a cost lever

Operations → Mindbody lets a studio leader turn automatic sync on or off and
change how often it runs. Those are fields on the studio's own record with
no editor on My Studio → Studio, so they break "edited here and nowhere
else" — and how often a studio asks Mindbody is a cost you decide ("A new
timer that asks Mindbody more often than this needs his OK"). Left alone,
because it is the Mindbody integration. Should studio leaders keep it (and it
moves to My Studio → Studio), or should it be administrators only?

### Relay's tab names

The notes say Floor · Mine · Notes, and that is what Relay has. The
Redesign Blueprints' Relay room (your pick, Sep 27, after the voice review)
asked "Rename the tabs to Board · Tracker · Journal?" and you left it blank,
so its default is yes. Which names should Relay's round build?

### The Team sketch

The notes sketch Team as "what the team is doing": who's in today, sessions
per trainer, where the workload sits. On Sep 26 you chose "people and
standards" instead ("Stripping out the hub and operations duplicate gives the
team tab a distinct standalone purpose"), and that is what is built. Nothing
was changed; say if the sketch should come back.

## Found in passing

- "Local set-up" is offered on a studio's own custom machine, and saving it
  can rewrite the machine as if it came from the catalog, which may drop it
  off the floor list. Flagged as its own task; not changed here.

## Deploy

No rules, no index, no Cloud Function, no Mindbody change. A push to master
deploys the app.

## Measured

| | |
| --- | --- |
| Typecheck | 4 (the baseline) |
| Suite | **7,116** passing in 471 files, none failing (`TZ=America/New_York npx vitest run --dir src`, the main checkout on AJ's PC); master's 7,111 in 469 plus five new tests in two new files |
| GitHub's way | `npm test` under `TZ=UTC`: 7,330 passing and 1 skipped in 485 files |
| Build | `npx vite build`: clean |
| Case check | no two tracked files differ only by case |
| After AJ's three answers | typecheck 4; **7,141** passing in 475 files (Eastern); rules tests **206** passing (202 before), on the emulator on AJ's PC; build clean |

The read-only Studio page was drawn on a harness page (LOTR data, no
Firebase) in headless Chrome at iPad portrait width; it has not been seen
in the signed-in app on an iPad. Walk Round 26 of
`docs/ops/TESTING-CHECKLIST.md`.
