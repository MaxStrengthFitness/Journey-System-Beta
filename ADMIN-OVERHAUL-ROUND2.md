# Admin Overhaul — Round 2

Branch `admin-overhaul-round2`, off `admin-overhaul-round1` at `133769c`.
Five commits, one per phase group. Sections 8, 10–13, 15, 16, 18 and 18a.

Round 1 covered sections 1–5 and 7, the offline-studio protocol, machine cloning
and the maintenance log. Section 6 (Insights) stays deferred at your request.

---

## What shipped

| Section | Phase | What landed |
|---|---|---|
| 8 | 1 | One announcement composer, shared by Admin and Franchise |
| 10–12 | 2 | One Mindbody diagnostic screen; the Downtown Studio Hub deleted |
| 13 | 3 | Bug reports show the diagnostics, plus status and a limit |
| 15 | 4 | Franchise command hub; last random-id trainer path removed |
| 16 | 4 | The redundant "Customize Studio" route removed |
| 18, 18a | 5–7 | Catalog landing, Academy grouping, one definition of "overdue" |

Verification at the end of the round:

```
43 test files, 1084 tests passing      (Round 1 ended at 38 / 873)
typecheck 42 errors                    (baseline 43 — see note below)
vite build clean
firestore rules 30 tests               (25 pass; 5 pre-existing failures)
```

The typecheck count went **down** by one. `CreateTrainerModal.tsx` carried a
shadcn `Select` `position` prop error and was orphaned by phase 4, so deleting it
removed the error with it. Nothing was suppressed.

---

## Six defects found that were not in the brief

Each of these was found by rebuilding something the spec asked for, not by
looking for bugs. They are listed worst first.

### 1. A franchise owner's network announcement went to the entire platform 🔴

Two composers wrote into `hub_announcements` with different conventions:

```
Admin      studioId "all" for universal, studioId <id> for one studio
Franchise  targetScope "network", targetId "all_owned", studioId "all"
```

The reader treats `studioId === "all"` as everybody. So an owner addressing
their own network published to every trainer at every studio in the system. The
card even labelled it "To: All Studios" — accurately, just not the studios
anyone meant. Nothing surfaced it: the franchise list filtered on
`authorId === me`, so the author saw a tidy list of their own notices and no
hint of where they had landed.

Fixed in `features/admin/announcements/audience.ts`, under test, shared by both
composers. Networks resolve to `targetStudioIds` at publish time, so the reader
does set membership against studios it already holds — no extra reads on any
device. Documents already in Firestore **narrow** rather than leak: `isTargeted`
reads `targetScope` first, so old network notices stop being universal
immediately and fall back to the owner-role check. No migration needed.

### 2. A trainer could never see what happened to their bug reports

`features/feedback/useMyFeedback` queries `bug_reports` filtered to
`userId == me`, and its own header says it exists "for when reports feel like
they go nowhere". The read rule was `allow read: if isSuperAdmin()`. That
listener was permission-denied for every trainer but the owner, silently.

Fixed in `firestore.rules`: a reporter may read their own report and nobody
else's, and still cannot change its status. Three rules tests.

### 3. A franchise owner could see an empty screen, permanently

```ts
const [selectedNetworkId, setSelectedNetworkId] =
  useState(displayNetworks[0]?.id || null);
```

`networks` arrives from a Firestore listener, so on the first render that array
is empty and the initial value is `null` — and `useState` ignores every later
argument. A super admin could recover with the picker; an ordinary owner had no
picker, it was rendered behind `isSuperAdmin`. So for an owner whose studios are
reached through network membership rather than `studio.ownerId`, the screen
stayed empty.

Fixed by resolving the selection as a derived value in
`features/admin/franchise/scope.ts` — which removes the class, not the instance:
it also covers a deleted network and an owner losing access to one.

### 4. Two buttons that reported results they had not measured

- **"Test Connect"** on the Integrations screen ran a one-second `setTimeout`
  and then reported success or failure from the **cached** health document. It
  made no request. Pressing it after changing a Site ID gave a confident answer
  about the old one.
- **The event log** fabricated an entry reading *"System initialized. Waiting
  for MindBody webhook events…"* whenever the collection was empty — an invented
  line in the one panel whose entire purpose is to be trustworthy.

Both replaced: "Check now" does the request the mockup's buried control actually
did, and an empty log says it is empty.

### 5. The bug report screen discarded every diagnostic the app collected

`features/feedback` captures the screen, studio, client, session, viewport,
orientation, theme, pixel ratio, app version, URL and the last five runtime
errors, all under `context`. `AdminBugReports` read `report.browser`,
`report.platform`, `report.os` and `report.studioName` — **top-level** fields the
current writer has never written — behind `if (report.browser || report.os)`,
which made the whole block dead code.

`features/admin/bugs/reportView.ts` reads both shapes (the pre-Sep-2026
documents really did keep those at the top level) and hands the screen one view.

### 6. A dead Firestore listener on every signed-in session

`src/hooks/useHubAnnouncements.ts` ran in `AppContent` and opened a live
`onSnapshot` on the whole `hub_announcements` collection for every signed-in
trainer. Nothing read its result. It survived the Sep 6 pass that moved
announcements into the notification bell, because deleting a bell does not
delete the hook that fed it. Deleted.

---

## Two smaller things worth knowing

**`bug_reports` had no limit.** The old fetch was
`getDocs(orderBy('createdAt','desc'))` with no `limit` — the entire collection,
every time the tab opened, on exactly the collection that grows without bound.
Now the newest 100.

**`FeedbackReport.status` was typed and never set.** open / investigating /
fixed / wont-fix has been in the type all along and no screen ever wrote it, so
every report was open forever and the list only grew.

---

## Deleted this round

Roughly 4,240 lines, all of it either a mockup, a duplicate, or orphaned by one:

```
src/components/mindbody/MindbodyDashboard.tsx        332   the Downtown Studio Hub
src/components/mindbody/StudioHubGrid.tsx            186
src/components/mindbody/ShiftRosterRow.tsx           154
src/components/mindbody/AppointmentCard.tsx          290
src/components/mindbody/WaitlistRecoveryWidget.tsx   184
src/components/mindbody/ClientReliabilityScore.tsx   126
src/components/mindbody/LedgerEntry.tsx              180
src/components/mindbody/CrossTrainApprovalCard.tsx   227
src/components/mindbody/CrossTrainAccessGate.tsx     118
src/components/IntegrationsHubView.tsx               818   folded into the above
src/components/AdminHubAnnouncements.tsx             419   → 108 on the kit
src/components/AdminBugReports.tsx                    88   → 403, with diagnostics
src/components/CreateTrainerModal.tsx                      orphaned by phase 4
src/hooks/useHubAnnouncements.ts                      37   dead listener
```

The cross-train pair implemented a request/approve flow that does not exist. The
live mechanism is `approvedCrossTrainStudioIds` on the client, edited in
`ClientDossier` and enforced in `lib/permissions.ts`.

`FranchiseDashboardView` went from 574 lines to 137 and is now wiring only.

---

## Review order on the iPad

1. **Admin → Announcements.** Post one to a single studio. Sign in as a trainer
   elsewhere and confirm the bell does *not* show it. This is the acceptance
   test for defect 1.
2. **Franchise → Message your network.** Confirm "Everyone" is not offered, and
   that the sentence under the form counts the studios before you publish.
3. **Admin → Mindbody.** A studio with no Site ID should report *that*, not
   "never synced". Press "Check now" with a wrong Site ID and confirm it fails
   with Mindbody's own message rather than a cached green.
4. **Admin → Bug Reports.** Send yourself feedback from the drawer, then open it
   here: screen, viewport, orientation and any runtime errors should all be
   present. Set a status and reload.
5. **Franchise hub**, signed in as an owner who is *not* a super admin, whose
   studios come from network membership. The screen should not be empty.
6. **Catalog.** Lands on body groups. Switch the picker to Academy and confirm
   Hip Abduction sits under Hips. Search "hips".
7. **Customize Studio** is gone from the admin nav; the header gear still works.

---

## Still open

- ~~**The cross-studio tenancy gap.**~~ **Fixed.** 5 of the 30 rules tests were
  failing, and four were one hole: `sessions` and `clients` were readable by
  any authenticated trainer with no studio scoping — a trainer at one studio
  could read every client and every session in the platform. The tests encoded
  a policy that was never written into the rules, and they had been failing
  invisibly because the suite could not run without JDK 21. Both the rules and
  every query that reads those collections are now scoped; see *The tenancy
  fix* below.
- ~~The fifth failure: nothing blocks `pinHash` on a trainer create.~~ **Fixed.**
- ~~**Section 6, Insights** — deferred by you, deliberately.~~ **Built.**
- The two WCAG failures Round 1 found in the shared palette affect screens
  outside admin and are not yet fixed at the source.

---

# After the round: tenancy, the sweep, and Insights

Three more commits landed on this branch after the eight phases above, and
`master` now carries all of it.

## The cross-studio tenancy gap — closed

`clients` and `sessions` were both `allow read: if isAuthenticated()`. Any
trainer at any studio could read every client record in the platform and every
session ever recorded, for every franchise.

**The machinery was already in `firestore.rules` and had never been wired to
the two collections it was written for.** `isTrainerOfClientData` encodes
exactly the policy `lib/permissions.ts` implements.

**Sessions are scoped by client, not by studio.** The obvious rule — "the
session's studio is one of mine" — is wrong here for two reasons:

- Eighteen read paths query sessions by `clientId`. Scoping those by studio
  would silently truncate the history of anyone who has trained at a second
  location, and cross-training is a feature.
- Sessions written before `hostedAtStudioId` was enforced carry `""`,
  `"unknown"`, `"legacy"` or nothing. A studio-only rule would make those
  unreadable by everyone including the owner.

So the rule asks what the app asks: *can this trainer read the client?* A
session can never be more visible than the person it is about.

**Read is wider than write on clients**, deliberately. A cross-train client
must be readable at the studio they are visiting; editing stays with the studio
that owns the relationship.

**The queries had to change first.** Firestore rejects an entire query if any
document it would return fails the rule, so tightening rules alone would have
blanked out the client directory, search, the workout tracker and the payroll
export rather than securing anything. Eleven read paths now name their studios
(`src/lib/tenancy.ts`, 15 tests) and four composite indexes support them.

Two were bugs on their own terms: the tracker's unassigned-session probe was
network-wide, so two studios with an open session could each adopt the other's;
and the payroll export fetched every session in the platform for the date range
and dropped the other studios' in memory.

> **Behaviour change:** client search now finds only clients your studio holds.
> "Global search" means every studio you may read, not the whole platform.
> Cross-train clients still arrive through the schedule, by document id.

## The error sweep — 42 typecheck errors down to 20

Three were real bugs, not type noise.

**Every post-session client feel was being discarded.** `FeelToggle` wrote
`'wiped' | 'good' | 'energized'`; `postFeelOf` in the clinical review matches
`"Wiped Out" | "Good" | "Energized"` and returns null otherwise. It survived
because `VictoryHUDScreen` declared its state as a *third* vocabulary and
reconciled them with `as any` — and the unit test fixture used the Title Case
spelling the UI never produced. All three now speak `ClientFeel`, and the
reader maps the legacy values so existing documents start counting without a
migration.

**A `.split()` on `targetMuscles`**, which is an array on some machine records —
a TypeError that took down the machine info dialog.

**`log.type === "Cardio"`** — nothing has ever written `type` onto an exercise
log. A condition that can never be true reads as coverage.

The rest were fields the code reads and writes that the types never declared
(`routineName`, `isUnassigned`, `lastSessionDate`, `firstSessionDateRaw`), now
declared so a rename cannot fail silently. Of the 20 remaining, 2 are in
`harness/`, which is gitignored local scratch.

## Insights (Section 6)

The old screen read 500 clients, 1,000 sessions and 1,000 exercise logs
unscoped — it would be rejected outright under the new rules.

It now leads with **sentences**, not totals: sessions never closed out, a
lopsided floor, who is not writing notes, machine variety, client return rate.
Every claim has a minimum sample stated as a named constant, and below it the
screen stays silent — a trainer who ran four sessions has not got a 25%
completion problem, and one bad call like that is how a manager stops trusting
a screen. Return rate is deliberately not attributed to individuals.

One query: sessions only, one studio, one date range, capped at 1,500.

---

# Deploying this

**The order matters.** Indexes must exist before the app asks for them, and the
app must be scoped before the rules are tightened.

Run these from `J:\Journey-System-Beta-master`, not from your home directory.

**`npx firebase`, not `firebase`.** `firebase-tools` is a devDependency here,
so it lives in `node_modules/.bin` and is not on your PATH. `npm run test:rules`
works because npm puts that directory on the path for the length of the script;
a bare `firebase` at the prompt does not get the same treatment and fails with
"not recognized".

```
# 0. Confirm you are logged in as the account that owns the prod project.
npx firebase login:list

# 1. Indexes first — additive, breaks nothing, takes a few minutes to build.
#    These must exist BEFORE the app ships, because the app asks for them
#    the moment it loads.
npx firebase deploy --only firestore:indexes --project prod

# 2. Verify the rules while the indexes build. Expect 37 passing.
npm run test:rules > rules-test.log 2>&1

# 3. The app. Render auto-deploys on any commit to master.
git push origin master

# 4. Rules last. Until this runs, the app is simply stricter than it needs
#    to be — which is the safe direction to be caught in.
npx firebase deploy --only firestore:rules --project prod
```

If step 2 fails, stop before step 4 — steps 1 and 3 are safe on their own.

**If the emulator will not start** ("port taken", or an empty log): a previous
run is still holding 8080.

```
netstat -ano | findstr :8080
taskkill /PID <the number at the end of that line> /F
```

---

# After Round 2: the Academy, and one palette

Two rounds landed on top of the above. Both are already merged into `master`
and ship with the same push.

## MSF Topics — the Academy, readable from the app

The catalog knew machines. It did not know the 214 Academy documents sitting
in `docs/`, so a trainer wanting the cueing for a movement had to go and find
a PDF. `src/features/academy/` parses that corpus at build time —
`scripts/build-academy-content.ts` writes `src/features/academy/content/*.json`,
111,666 words across 13 modules — and `AcademyView` reads it in five tabs:
Curriculum, Cueing, At the machine, Glossary, Deep dives. A machine's detail
page opens straight to its own Academy material.

Checking the catalog against the source documents turned up content problems
that had nothing to do with layout:

- **The neck machine was serving un-sourced content with its warnings
  stripped.** No MSF document for a "4-Way Neck" machine exists in the 214
  files. It carried `requiresHandoff: false` and no never-to-failure rule.
  Both restored, and the starting weight capped at the Academy's ceiling.
- The Leg Curl hyperextension warning, the Lumbar gap instruction and the
  Lateral Raise setup had each drifted from their sources. Restored.
- Three places where two Academy documents genuinely contradict each other —
  Leg Press foot rotation, Leg Curl gap, Lateral Raise gap — are marked
  **SOURCE CONFLICT … confirm with your Studio Leader** rather than silently
  picking a winner. **These three need a human ruling.**

## One palette

Ten of thirteen admin tabs were on the kit. The shell around them was not:
`adm` sat on individual nav buttons, so `--adm-*` resolved there and nowhere
else, and the frame stayed raw Tailwind slate while every tab inside it used
kit surfaces. Fixed, along with the last three tabs — System Tools, Routine
Templates, Limbo Queue.

Two of those changed behaviour, not only colour, because putting them on the
kit meant honouring the rules the kit encodes:

- **Limbo dismiss now confirms.** `primitives.tsx` has named it an outstanding
  offender since the kit was written. Throwing away a parked booking committed
  on a single tap, with a tooltip as its only warning.
- **The studio picker is the one admin select**, not a second implementation
  of one.

Every `.tsx` reachable from the admin surface — 57 files — now carries zero hex
literals and zero raw Tailwind palette classes, with six deliberate exceptions:
brand-colour *data*, the CSS variable that publishes it, and hex fills passed
to the anatomy library, which takes strings rather than classes.

## Still open

- **`demo-mode-foundation`** is 10 commits, unmerged, and overlaps this work in
  9 files including `firestore.rules` and two files these rounds deleted. It
  needs a deliberate merge, not a fast-forward.
- The two WCAG failures Round 1 found in the shared palette affect screens
  outside admin and are not yet fixed at the source.
- **Three source conflicts need a human ruling** — Leg Press foot rotation,
  Leg Curl gap, Lateral Raise gap. They are flagged in the app, not guessed at.
- `MACHINE_CATEGORY` omits Calf, Rear Delt and Scapular Retraction.
