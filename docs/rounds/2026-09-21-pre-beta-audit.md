# The pre-beta audit — Sep 21 2026

**Branch:** `pre-beta-audit`, cut from `catalog-gate` (not `master` — see the note
below). Five commits. **Nothing pushed, nothing merged, no trainer has seen any
of it.**

**Verified on this branch:** typecheck **10** — the baseline, unchanged. Suite
**3,756 passing in 252 files**, one skipped, run in the cloud container at
`TZ=America/New_York`. `firestore.rules` untouched, no index change, no Cloud
Function change, nothing run against the live database. `npm run test:rules` is
yours and was not needed.

---

## Read this first — two things that change how to read the rest

**1. Most of this audit already existed, and you have not seen it.**

`docs/rounds/claude-experiment/` holds **eight audit documents, about 360 KB**,
dated Sep 20, committed as "Claude Experiment, Phase 1". It was produced the same
way this one was — parallel reviewers, one screen area each, a cited line for
every claim — and it is good work. It covers the Active Session, the app shell,
the client profile, machines, studio operations, the backend, the design system
and types/tests.

**Nothing in it is referenced by `ROADMAP.md`.** Its findings were never triaged
into the working list, so they are invisible to every session that starts by
reading the roadmap — including, nearly, this one. Two of tonight's reviewers
found it on their own and re-verified it against today's code: most of what it
found is still live.

That is the most useful thing I can tell you tonight, and it is a process
finding rather than a code one. **Producing findings is not the bottleneck. Getting
them onto the roadmap is.** Before commissioning another audit, triage that one —
it will take an hour and it is cheaper than anything else on this page.

Where a finding below is also in that document I say so, so you do not pay twice.

**2. I branched off `catalog-gate`, not `master` as the prompt says.**

`master` is 17 commits behind and carries none of `START-HERE.md`, the rewritten
`ROADMAP.md`, or the catalog gate round. Auditing it would have measured the app
against a standard that does not exist there yet.

---

# A. What would hurt a trainer on day one

Ranked by what it actually costs. Rank is how close the thing is to the set
itself — Rank 1 is during the set, Rank 4 is back office.

---

### 1. The app calls a twelve-year client new — on five screens, and the fix is already written

**This is the finding of the night.** It is one rule, broken in five places, and
the machinery to fix it exists in the codebase and is already used correctly in
seven others.

Your rule: *prior history is real history. An empty Journey history means "no
detail here", never "this never happened".* The studios are mid-migration, so a
roster is mostly people with hundreds of sessions behind them that Journey cannot
see. Here is what those people are shown today:

| Where | What it says | Line |
| --- | --- | --- |
| **The Now Bar**, walking up to the machine | "First time on this machine" | `src/features/journey-grid/SessionNowBar.tsx:450` |
| **The Hub card**, where a trainer lands | `#1`, a "First session" chip, an orange milestone bar | `src/components/schedule/ScheduleBlock.tsx:88,91,314`; `src/lib/hub-markers.ts:85` |
| **The briefing**, before the session | "Last session · Never", "First session", "Routine A · Never run" | `src/features/briefing/BriefingScreen.tsx:464,430`; `briefing-facts.ts:152` |
| **The post-session screen**, with the client standing there | "Sessions 4", "Lifetime volume", "Lifetime reps" | `src/components/VictoryHUDScreen.tsx:603-605` |
| **Operations → Insights**, what a leader reads | "N on their first session" | `src/features/admin/insights/metrics.ts:274` |

`src/lib/prior-history.ts` exists for exactly this. It exports `historyCoverage`,
`canQuoteLifetime`, and `NEVER_LABEL` / `NEVER_PHRASE` — which give you "Nothing
recorded" for a client we cannot vouch for and "Never attempted" only for one we
can. Seven files import it and use it correctly, including the client profile and
`admin/overview/moments.ts`, whose comment reads *"Session milestones: only when
the total may be quoted."*

**None of the five screens above imports it at all.** I checked each one
individually; the count is zero in every case.

So the same client reads correctly on her profile and incorrectly on the screen a
trainer lands on, the screen they read before walking over, the screen at the
machine, and the screen you show her at the end.

**Rank 1** (at the machine) through **Rank 4** (Insights). **Certain.**

This is not one fix; it is five, and each needs a decision from you about the
wording — which is question 1 in section E. Two of the five appear in the Sep 20
audit; three do not.

---

### 2. The stopwatch counts its own ticks, not the clock

The in-app stopwatch is how a TSC or static hold gets its seconds, and those
seconds are the only honest time-under-tension number in the whole app.

`src/features/journey-grid/SessionNowBar.tsx:98`
```js
const id = setInterval(() => setTime((t) => t + 1), 1000);
```

It counts how many times a one-second timer fired. Browsers under-fire that timer
when busy, and **iPadOS suspends it outright when the screen locks or the tab goes
to the background** — which is exactly what happens when a trainer starts the
watch and sets the iPad down on the machine for a 60–120 second hold.

Three files away, the session timer does it the right way and says so in its own
comment — `src/components/ActiveSessionTimer.tsx:69`: *"Re-render once a second;
the value itself is computed, never accumulated."* It derives elapsed time from
timestamps. So does `machine-clock.ts`. The stopwatch is the one timer in the app
that accumulates.

The number it produces flows into `totalTimeUnderLoad`, `machineDurationSeconds`
and `averageTimePerRep`.

**Rank 1. Certain** that it accumulates. I could not measure the real drift on a
device — that is question 3.

*(New. Not in the Sep 20 audit.)*

---

### 3. Logging a static hold means hitting a 22-pixel button, twice

Your first product rule is that nothing tappable is under 40px. The entire
static-hold path is under it:

`src/features/journey-grid/journey-grid.css:1392-1404` — the REPS | SEC switch is
a 44px-tall box with two `flex: 1` children stacked in it, so each is **22px**,
at 9.5px type.
`:1430` — the stopwatch play button is **30px** wide.
`:1437` — the reset button is **24px**.

The rest of the bar is correct: the set, quality and outcome buttons are all
44 × 44. It is this one path.

**Rank 1. Certain** from the CSS; not measured on a device.

*(Sep 20 audit #13. Still live.)*

---

### 4. Red means three different things on the live screen

`src/features/journey-grid/journey-grid.css:1610` paints a critical note flag with
`--jg-q-poor`, which is the kaizen ring's own colour (`:769`). Same reuse at
`:2294` and at `:605`/`:646` for a machine-note glyph.

The comment directly above it, at `:1587`, says the opposite: *"Red is reserved
for rep quality in the grid… so a critical note and the kaizen ring never read as
the same thing."*

A trainer scanning the live screen for red finds three meanings in one colour.

**Rank 1. Certain.** *(Sep 20 audit #26. Still live.)*

---

### 5. Tapping Finish and changing your mind freezes every machine clock

`src/components/WorkoutTrackerView.tsx:1551` sets a local pause flag. It never
writes `pausedAt` to the session. "Keep Training" (`:3110`) only closes the
dialog. The effect that would clear the pause is keyed on `pausedAt`, which never
changed — so every per-machine timer stays stopped for the rest of the session,
while the session clock (which reads the document) keeps running.

Trainers do tap Finish and then add one more machine. After that, "time on
machine" is silently wrong for everything that follows, and the readout on the bar
sits frozen in front of them.

**Rank 1. Certain.** *(Sep 20 audit #4. Still live.)*

---

### 6. The crash-recovery guard cannot ever be true

`src/components/WorkoutTrackerView.tsx:456` — the comment says *"Adopt only for
the client on screen."* The check is `!selectedClient?.id || data.clientId === selectedClient.id`,
inside an effect with an empty dependency array, so it captures `selectedClient`
as `null` from the first render. The left side is therefore always true and the
client check never runs.

There is a second net upstream that usually sets the right client first, so this
is a race rather than a certainty — but the guard written to prevent it is dead.

**Rank 1. Certain** the guard is inert. *(New.)*

---

### 7. Torso Rotation never gets its timing written

`WorkoutTrackerView.tsx:516` branches on the machine id `torso_rotation`. The
app's canonical id is `m-torso-rotation` (`src/data/default-machines.ts:202`), and
every other per-side decision in the same file goes through `isPerSideMachine()`,
which accepts both. So the sided path writes to `_Left`/`_Right` keys and the
close path looks for a key that does not exist. The one machine you record two
sides for is the one whose time fields are never written.

**Rank 2. Certain** the two paths disagree. *(Sep 20 audit #7. Still live.)*

---

### 8. Two things fixed tonight, because they were safety claims made on no data

**The briefing said "clear to go" when it did not know.** The Before-you-start
panel printed *"Nothing flagged — clear to go."* whenever its count was zero. That
count comes from the journal stream, which starts empty and **stays** empty if the
read fails — it catches the error and stops. The screen never asked whether the
notes had loaded. So on a slow or refused read, the one screen whose job is *is
there anything here that could hurt them* answered **no**, with authority, on
nothing. It now says the notes are not loaded and claims neither way. START is
untouched and still never blocks. *(New. Fixed — commit 4.)*

**"Remember this" said Saved when nothing was saved.** `createFordEntry` returns
null when the write is refused. `FordQuickCapture` dropped that, cleared the
textarea and flashed "Saved". The sentence a client just said is the only copy of
itself, and this feature exists to keep it — so a failed write was the one case
where it was guaranteed to be lost. It now keeps the text on screen and says "Not
saved — still here, try again". *(New. Fixed — commit 3.)*

---

### 9. Marking a note Critical promised something the app never does

The Loudness control told the trainer that Critical is *"Pinned, on the briefing,
and marks the Hub card."* The briefing half is true. The Hub half is not: the
Hub's red triangle reads `client.priorityNote`, `client.hasPriorityNote` and
`client.events`, and **nothing anywhere in `src/`, `server/`, `functions/src/` or
`scripts/` writes any of the three.** It is a read with no writer — the inverse of
your "every number has a reader" rule, on the loudest safety affordance in the
app.

I changed the sentence to match the code rather than the other way round, because
whether the Hub card *should* carry it is your call and it costs the Hub a read of
every client's notes. That is question 6.

**Rank 4 screen, Rank 1 consequence. Certain.** *(Also Sep 20 audit, §26 of
`03-client-profile.md`. Promise corrected tonight — commit 2.)*

---

### 10. The rest, in one line each

- **"No need to remind me" cannot be undone.** `restoreThread` is written and
  exported and has **no caller** anywhere. One mis-tap hushes a Critical note on
  that trainer's briefing until somebody adds an update to the thread.
  (`dismissal-store.ts:74`. Rank 3, certain.) It is still visible mid-session.
- **Discarding a personal detail deletes it for good** (`ford-write.ts:192`,
  `deleteDoc`, no confirm), while discarding a note in the tray directly above it
  is archived and recoverable (`file-unfiled.ts:31`). Same word, same screen,
  opposite consequence. (Rank 3, certain.)
- **The post-session screen tells the trainer what to load next time** — "room to
  add a little next time", "ease off a touch next time" (`src/lib/post-session.ts:286-294`).
  Your rule is that the app never suggests a progression. (Rank 3, certain the text
  is there; question 7.)
- **On the dose Dial, the worst answer is the strongest green.** The scale is
  Goldilocks — "Wiped out … Just right … Barely worked" — but the colour function
  reads the value, not the scale, so "Barely worked" renders solid green
  (`scales.ts:327`, `:145-151`). Every other Dial in the app is worse→better.
  (Rank 3, certain about the code.)
- **A note draft dies on an app kill while the session survives** — the draft is
  in `sessionStorage`, the live session in `localStorage`
  (`session-draft.ts:76` vs `live-session.ts:60`), and the module header claims a
  crash-and-resume keeps it. (Rank 3, certain.)
- **Firestore failures speak developer English to the trainer**:
  `"Firestore Action Failed: … on … Error: …"` (`firestore-errors.ts:93`), with a
  blocking `alert()` at `:98` when no toast host is mounted. A studio leader gets
  *"Run `firebase deploy --only firestore:indexes`"* (`DelightQueue.tsx:125`).
  (Rank 3, certain.)
- **Operations → Insights prints rates below the minimum sample it names on the
  same screen.** The narrative panel is correctly gated at 20 sessions and says so;
  the tile row sits outside that guard (`AdminInsightsTab.tsx:253`), so three
  sessions produce "Sessions with a note 33%" and "Client return rate 0%".
  (Rank 4, certain.)
- **A studio leader cannot see their own studio's Calendar week or day** — the
  trainer picker is disabled for everyone but Admin/Founder
  (`CalendarView.tsx:423`), while the Hub shows every trainer's column to
  everyone. Nothing records this as a decision. (Rank 4, certain the code does it;
  I think it is unintended.)
- **The Calendar's week page is a trainer leaderboard inside one studio** — sorted
  by volume, with a percentage share each (`selectors.ts:101`, `WeekView.tsx:107`)
  — while the equivalent Operations panel is alphabetical and prints "A list, not a
  ranking" on screen (`overview/team.ts:7-8`). (Rank 4, certain; question 4.)
- **Confetti.** 36 particles burst across the post-session screen
  (`VictoryHUDScreen.tsx:247`), plus a pulsing orange all-caps banner on a first
  session. Your clause is *in a clinically-controlled environment* — "sentences,
  not scores, no hype, no celebration". The code's own comment argues against
  itself. (Rank 2. Product call — question 8.)
- **A ~350-line "Edit Client Profile" form on the Hub that nothing can open** —
  `startEdit` is in the prop type but not the destructure
  (`ClientsView.tsx:133-148`), so it is never called. It writes name, height,
  weight, age, occupation, phone and email straight onto the client document —
  fields Mindbody owns — one line away from being live. (Rank 4, certain.)

---

# B. The three empty columns

You named these. They are **three different causes**, and there is a fourth column
with the same cause as two of them.

**First, a fact that reframes it:** none of the three can render literally blank.
Each has a fallback string — "No package on file" (`directory-row.ts:36`),
"Unknown" (`:38`), "N/A" (`ClientDirectoryView.tsx:697`). So what you are seeing is
the app's honest-unknown path, not a rendering failure. **If you are actually
seeing white space, everything below is wrong** — that is question 9.

### Membership and Sessions Remaining — the nightly job has never run

Both read `client.renewal`. **`server/renewals-job.ts:378` is the only thing in the
entire repo that writes that field** — I grepped `src/`, `server/`,
`functions/src/` and `scripts/`, and the only other matches are a CSS class name, a
label and a type parameter.

The app is *structurally forbidden* from writing it: `firestore.rules:1349` and
`:1358` refuse it, with the comment *"Nobody writes it from the app — not even an
admin."* So no amount of iPad use will ever fill these in.

The job's only scheduled runner is the Render cron `journey-cron-renewals`, and
`ROADMAP.md` still lists **"Render Blueprint sync for `journey-cron-renewals`"** as
outstanding — in the same sentence noting that the *existing* cron is still under
its old name `journey-cron-leaderboards`, which means no Blueprint sync has
happened since that file was written. The renewals round document says that sync
is what *creates* the service. And the roadmap also says the renewals dry-run has
never been done, so the manual path has not run either.

**Conclusion: the job has never run, so the field does not exist on any client.**
Certain from the code; only the Render dashboard can falsify it.

**Fix: no code change.** Run `npx tsx scripts/run-renewals.ts --commit` from the PC
once — it backfills every studio immediately instead of waiting for 2:30am — or
sync the Blueprint. Then match the Mindbody package names in Operations →
Renewals → Settings, which the roadmap also lists as outstanding: until that is
done, **Membership will stay empty even after the job runs**, because the label
needs a matched tier. Sessions Remaining does not — it can come straight from a
Mindbody balance. **So expect Sessions Remaining to come back first and Membership
to lag.**

**Bonus: it is four columns, not three.** "Next Session" reads
`renewal.nextBookingDate` (`directory-row.ts:50`) and is showing "Unscheduled" for
everyone for the identical reason.

### Last Session — the roadmap's defect is real, and it is not the cause

Confirmed at `ClientDirectoryView.tsx:419-424`: `sessions` queried with an
equality on the studio, `clientId in` 30 ids, `limit(100)`, **no ordering**. Exactly
as the roadmap describes.

But it **cannot** produce a uniformly empty column. The query is filtered to the 30
clients being asked about, so if the studio has any sessions for any of them, some
rows get a date. An unordered `limit(100)` produces *stale*, never *empty*. Refuted
as the cause.

The actual cause is almost certainly that **there are no session documents for
these clients at this studio yet, and no client carries `lastSessionDate`** —
which is written only on a finished Journey session, by the FileMaker importer, or
by a Mindbody client event. Mid-migration, none of those is true at scale. The cell
is telling the truth.

There is also a **second, unreported defect**: client ids are marked "asked" before
the fetch (`:400`), but the result is only committed if non-empty (`:435`), and an
empty result is not an error. So when a batch of 30 comes back with nothing, the
effect never re-runs and **clients 31–40 of the default list are never queried at
all**. (Certain.)

**One check settles all of it.** Open the directory with the browser console open
(F12). If *"Could not fetch last sessions for clients:"* appears, the query is
failing — a missing index or a refusal — and the fix is a deploy. If nothing
appears, the query ran and found nothing, and the fix is the FileMaker import. That
single observation separates every remaining explanation.

### Ruled out, with what was checked

The code not reading the field (it streams whole documents, no projection); rules
refusing the client read (you pass as founder with zero document reads); the rules'
read budget on the sessions query (short-circuits on a pure map lookup before any
read); a missing composite index (the required one **is** declared at
`firestore.indexes.json:405-418`, and a genuinely missing one raises an error that
the catch would log); session documents lacking the fields (every one of five
writers sets both); a stale iPad overwriting `renewal` (impossible by rule); wrong
component (it is the right file).

---

# C. What looks wrong but is not

Each of these was suspected and then disproved. This section exists so nobody
chases them again.

- **Tapping Next without typing logs a set.** It does not — it is a pure focus
  change (`WorkoutTrackerView.tsx:3305`).
- **Reps are pre-filled.** They are not; last time's count is a placeholder only
  (`SessionNowBar.tsx:371`).
- **Weight is pre-filled from a practice set.** It is not — practice sets are
  filtered out first, with the comment *"A practice set's lighter load must not
  become tomorrow's prescription."*
- **"Last" and "Best" on the bar include practice sets.** They do not
  (`stats.ts:39,69`).
- **The session-start seed loop can overwrite logged sets.** This was the Sep 20
  audit's one "critical". **It is fixed** — it is now a single merged batch
  committed before the trainer can reach those machines.
- **Invisible or raw control characters in `WorkoutTrackerView.tsx`.** None; the
  file is clean UTF-8.
- **The post-session screen quotes a trend it cannot support.** It does not — it
  requires 3 sessions on 3 machines and says so.
- **Closing the Pulse dialog loses the last tap.** It does not; a pending write is
  flushed on unmount.
- **A hushed Critical note disappears everywhere.** It does not — dismissals apply
  to the briefing only; the Active Session flag sheet reads the notes raw.
- **`client.sessionCount` excludes FileMaker history.** It includes it — that is
  why the client *profile* is right and the five screens in A1 are wrong.
- **START can be blocked.** It cannot; every dial, region and note is optional.
- **A second floor editor exists on Operations.** It does not — Operations → Floor
  and My Studio → Machines mount the same component, exactly as decided.
- **Insights makes narrative claims with no floor.** It does not; the minimums are
  enforced. Only the tile row escapes.
- **The Overview's "%" tiles are unbacked scores.** They are exact tallies of
  today's own bookings, with the denominator printed beside them.
- **The grant opens Operations.** It does not — role-only, as intended.
- **`docs/START-HERE.md` overstates the project.** It does not. It claims "about
  220,000 lines"; `src/` is 220,878. (Section G covers the numbers that *were*
  stale.)

---

# D. The Mindbody migration

**Two corrections to the brief before the plan, because both were secondhand and
neither survived checking.**

1. **`client/clientcompleteinfo` appears nowhere in this repo, and `ROADMAP.md`
   does not mention it.** A case-insensitive grep across `src/`, `server/`,
   `scripts/`, `docs/`, `functions/src/` and `ROADMAP.md` returns exactly one hit:
   the audit prompt itself. **Nothing here establishes what that endpoint returns
   or that it would cut five calls to two.** Treat "5 → 2" as unverified until
   somebody reads Mindbody's API documentation.
2. **The client directory's "read budget of 200 per visit" is not shipped code.**
   It is a proposal line in `docs/rounds/2026-09-18-operations-audit-prep.md:165`.
   The real caps are three `limit(30)`s and one `limit(100)`.

### What Master Sync costs today — counted from the code, not estimated

**Five Mindbody calls per found client**, one for a missing one. The code says so
itself (`server/mindbody-client.ts:315`: `calls: 1 + commercial.calls + 1`):

1. `client/clients` — identity and demographics. Sequential, first; not found → stop.
2. `client/clientcontracts` ┐
3. `client/clientservices`  ├ one `Promise.all`
4. `client/activeclientmemberships` ┘
5. `client/clientvisits` — lifetime visit count; **only the total is read**

Calls 2–5 fire as **four concurrent requests per client**. Plus a token call per
site per 55 minutes. Firestore cost is **1–2 writes to one document**.

**A batched alternative already exists and is proven in-repo**, and it is not
`clientcompleteinfo`: `scripts/check-mindbody-client-collisions.ts:118-123` calls
`client/clients` with **50 ids per call**. So call #1 is already batchable 50:1 with
code that runs today. Calls 2–5 are single-client and have no batched form
anywhere. **The verified saving is 5N → 4N + N/50**, not 5N → 2N.

### The limits that actually apply

**There is no retry, no backoff, no rate limiter and no 429 handling anywhere in
the Mindbody client.** `mindbodyGet` does one fetch and, on failure, logs a warning
and returns. A grep of that file for sleep, delay, throttle, retry, backoff or 429
finds nothing but query parameters. **That is the single biggest gap between what
exists and what a 1,000-client run needs.**

What throttling does exist, all in the renewals job: 4 concurrent pulls, a 300-client
nightly budget, 400-document batch commits. Mindbody bills calls over 1,000 a day —
that is a **billing threshold, not a rate limit**, and the repo contains no
requests-per-second figure and nothing that reads a `Retry-After` header.
Backoff patterns do exist (`fetchWithRetry`, 8 retries, linear delay) but they are
written against **Firestore REST, not Mindbody**.

### The Aug 30 storm, and what it teaches this specific job

Three contributing causes, all recorded: a self-heal step that **wrote to a
collection from inside a listener on that same collection**, so every write
re-triggered the listener — and when a fetch failed with a 429, the roster came
back short, every schedule looked invalid, and it **erased correct client ids,
turning a transient read failure into permanent data loss**; one aggregation query
per snapshot during a 432-appointment sync; and sequential client creation inside
the appointment loop.

The rules that came out of it are the design constraints for this backfill:

- **A failed read means unknown, never empty.** The storm's worst damage was a
  failed read being treated as "this client has nothing".
- **No per-client queries in a loop.** Read the collection once, build maps.
- **Every aggregation gets de-duplication, a TTL and a cooldown, and runs
  sequentially.** Sixty at once is the shape of the storm.
- **One shared lease, not one timer per device.**

### The shape of the script

`scripts/backfill-client-since.ts` is the house pattern and its safety model should
be copied almost verbatim: dry run by default, nothing written without `--commit`,
a client that already has the value is **skipped always**, `update()` with named
fields so a bug cannot touch anything else, a JSON report of every decision to
`backups/` either way, and re-running is harmless. Auth is a service account
through `scripts/lib/admin.ts` — the Firebase CLI token path is dead and 12 of the
scripts are still on it; the new one joins the 6 that are not.

**Resumability: the model already exists, twice.**
`scripts/migrate-canonical-client-ids.ts:360-375` keeps a **resume log** — a file of
completed ids, read once at the start, appended only *after* an item fully
succeeds, with per-item failures collected rather than aborting the run. That is
"restartable without redoing work". And `client.mindbodyMasterSyncedAt` already
exists as a per-client ledger field, written by Master Sync itself — **but it is an
ISO string with no index, and Firestore cannot query for an absent field**, so
"who has never been synced" must be an enumerate-and-filter, exactly as
`backfill-client-since.ts` does it.

Better still, `src/features/renewals/job-plan.ts:37-68` is a **budgeted,
idempotent, self-resuming sweep that already works**: it ranks every client
(near a renewal and not pulled this week → never pulled and active → not pulled
for a month → never pulled and quiet), sorts, takes the top N, and misses nobody
across successive nights. That is the right architecture, and it is written.

### The plan

1. **Count first, with a command that exists.** `npx tsx scripts/run-renewals.ts`
   — dry run, no writes, **no Mindbody calls at all** without `--pull`. It prints
   per-studio client counts and the window's bookings and workouts. This also
   answers section B at the same time. *Nobody has a real client count today;
   "~250 a studio" is your estimate, not a measurement.*
2. **Rule out the id collision before anything writes.**
   `scripts/check-mindbody-client-collisions.ts` — the two Mindbody sites share one
   client-id namespace in `clients/` and this has never been checked. If the same
   id exists at both sites as two different people, they share one Journey
   document, and a bulk sync would write one person's details over the other's.
   **This must run before the backfill, not after.**
3. **Add the missing floor to `mindbodyGet` first** — a 429/5xx retry with
   exponential backoff that reads `Retry-After`, and a token-bucket rate limit.
   Everything else depends on it, and it is also the one piece that benefits the
   live app.
4. **Then the backfill script**, `scripts/backfill-mindbody-master.ts`: service
   account, dry run by default, `--commit`, `--studio`, `--limit`, `--key`; a
   resume log in `backups/`; a skip rule on `mindbodyMasterSyncedAt` newer than a
   given date; batch call #1 at 50 ids; throttle calls 2–5 with a concurrency of 4
   at most, matching the renewals job; a JSON report every run.
5. **Verification is the point, not speed.** The run's own report is not proof —
   it only knows about clients it reached. Prove it the other way: enumerate every
   client document, filter to those with no `mindbodyMasterSyncedAt`, and print
   the list. **The deliverable is a report of who has *not* been synced, and it
   must be empty.**
6. **Run it yourself, watching, the first time.** Start with `--studio` and
   `--limit 25`.

**Unknowns nobody can close from the code**: Mindbody's actual rate limits
(requests/sec, burst, daily cap) — the repo knows only the billing threshold;
whether `client/clients` silently truncates a 50-id request (the code never reads
the pagination response on that call); the live project's Firestore quota tier; and
what `clientcompleteinfo` actually returns.

---

# E. Questions for you

The most useful part of this document. Grouped, and answerable from your phone.

### About clients who trained here before Journey — the biggest one

**1.** A woman you have trained for eight years, whose FileMaker history is not in
Journey yet. Today she reads as "First time on this machine" at the machine, "#1 ·
First session" on the Hub, "Last session · Never" on the briefing, and "Sessions 4"
on the screen she sees at the end. What should each of those say — nothing at all,
a dash, or words like "Nothing recorded here"? The safe wording is already written
in the code; it just is not being used on any floor screen. **Your answer to this
one unblocks five fixes.**

**2.** Who types in those old totals, and when — a studio leader sitting down with
the roster before beta (about 250 people a studio), or a trainer the first time
they open somebody? Until that happens, every screen above keeps calling
long-standing clients new.

### About the stopwatch

**3.** When a trainer starts the stopwatch for a static hold and sets the iPad down
on the machine — does the screen stay awake, or does it dim and lock? This decides
how badly the current stopwatch under-counts.

**4.** Those seconds are the only real time-under-tension we capture. How wrong can
that number be before it is worse than having none — 2 seconds, or 10? That sets
how hard we fix it.

### About red, and about what the app is allowed to say

**5.** On the live screen, red currently means three things at once: a set whose
reps broke down, a critical note about the client, and a machine that has a note on
it. You said red is reserved for rep quality. Which of the other two changes
colour — and is amber enough for a critical note, or should a critical note be the
loudest thing on screen even at the cost of the ring?

**6.** When a trainer marks a note Critical, the app was telling them it "marks the
Hub card". It does not — it only reaches the briefing. I have corrected the
sentence. Do you want the mark actually built (the Hub would have to read every
client's notes, so it costs a little on load), or is the briefing the right and only
place?
*Answered by AJ, Sep 24 2026: the red triangle only (the edge keeps its meanings), from one live read of the day's booked clients' Critical notes rather than a count on the client, and red for every trainer. Built in `docs/rounds/2026-09-24-hub-critical-flag.md`.*

**7.** When a trainer says a session landed as "Barely worked", the app currently
writes back *"plenty of room to add next time"*. It is the only place in the app
that says anything about next session's weight. Delete the advice and keep the plain
restatement, or keep it because the trainer said it themselves?

**8.** The post-session screen fires a burst of confetti and a first session gets a
pulsing orange banner. Your own rule is "no hype, no celebration — the numbers are
the celebration". Did you ask for those, or should they go?

### About the three columns

**9.** In those columns, do you see blank white space, or do you see the words "No
package on file", "Unknown" and "N/A"? The code cannot produce white space, so if it
really is blank, my diagnosis is wrong and I want to look again.

**10.** On Render, is there a cron job called `journey-cron-renewals`, and does it
show any run history? If it is not there, the renewals job has never run and that is
the whole story for two of the columns — plus a third you did not mention.

### About your studio leaders

**11.** On the Calendar, a studio leader can only see their own bookings today;
"Entire team" is greyed out for everyone but you and admins. On the Hub they see
every trainer's column. Should a leader get the whole studio's week and day, or is
one person at a time deliberate?

**12.** The Calendar's week page lists trainers biggest-first with a percentage
share each. Everywhere else the team list is alphabetical with no share, because of
"recognition, never ranking". Is the week page an exception you want — it is a rota
question, not a performance one — or should it be alphabetical too?

**13.** A studio with three sessions in a week currently shows "Sessions with a note
33%" and "Client return rate 0%", directly under a panel that says twenty sessions
is the minimum before any rate means anything. Should those tiles go blank below
twenty, or do you want the raw figure and to judge it yourself?

### About discarding things

**14.** When a trainer taps Discard on a personal detail at teardown ("grandson
graduates in May"), should it be gone for good, or go somewhere it can be found
again? A discarded *note* on the same screen is archived and recoverable; a
discarded *FORD detail* is deleted outright.

**15.** Should "No need to remind me" be offered on a **Critical** note at all, or
only on a Heads up? Right now it is on both, it is one tap, and there is no way for
that trainer to put it back.

---

# F. Small things

One line each, no ceremony.

- `docs/ARCHITECTURE.md` §2.3 says seven profile tabs; there are four.
- The Render cron service is still named `journey-cron-leaderboards` although it
  runs the machine-trends job.
- `npx vitest run functions` passes 14 files in 4.4s and **no command in the repo
  runs them**.
- A Firestore quota error is caught, stored in `lastQuotaErrorMessage`, and never
  surfaced — on the floor that looks like the app silently not working. Given Aug 30,
  that is exactly the signal a trainer needs.
- Twelve scripts in `scripts/` are still on the dead Firebase-CLI-token auth path.
- The oldest column the Journey grid can page back to is empty for a client with
  31+ sessions (the logs listener caps at 30 ids including the live one, the grid
  builds 30 *past* columns).
- FORD details past four untagged / six per pillar have no "show all" anywhere, so
  the sweep's promise that "nothing is lost" stops being true at five outstanding.
- Four 36px buttons file a client's personal detail (`ford.css:176`).
- An iPad locking during the walk-out ends the post-session screen and navigates
  home, with no way back to it.
- Two emptied files, `AdminMachineCreator.tsx` and `MachineDefinitionForm.tsx`, are
  unimported and can be deleted.

---

# G. What I changed

Five commits on `pre-beta-audit`. Nothing pushed. Each is independent and can be
reverted on its own. No Rank 1–2 screen, no rules, no indexes, no Cloud Functions,
nothing against the live database, no refactoring.

| | What | Why |
| --- | --- | --- |
| 1 | `CLAUDE.md`, `ROADMAP.md`, `docs/START-HERE.md` | Stale numbers. Measured here: tsc **10**, suite **3,756 in 252 files**. CLAUDE.md said 3,717 in 251 (pre-catalog-gate), START-HERE said ~3,545 and 3,500, ROADMAP called `catalog-gate` five commits when it is seventeen. |
| 2 | `src/types/journal.ts` | The Critical hint promised to mark the Hub card. Nothing writes the field it would need. Sentence corrected to match the code. |
| 3 | `src/features/ford/FordQuickCapture.tsx` | Stop reporting a failed save as saved, and keep the trainer's text on screen. |
| 4 | `src/features/briefing/BriefingScreen.tsx` | Stop claiming "clear to go" before the notes are known. |
| 5 | this document, plus `docs/ops/OVERNIGHT-AUDIT.md` | The audit, and the prompt's fix-allowance paragraph updated to what you chose tonight. |

**Not changed, deliberately:** everything in section A items 1–7. They are Rank 1–2,
or they need a wording decision from you, or both. The five prior-history screens in
particular are a single coherent round once you have answered question 1 — and doing
them piecemeal would leave the app saying two different things about the same
client.

---

## What I would do next, in order

1. **Answer question 1.** It unblocks the biggest finding here, and it is a wording
   decision, not a technical one.
2. **Triage `docs/rounds/claude-experiment/` onto the roadmap.** An hour, and it is
   worth more than another audit.
3. **Run the two read-only commands** in section D step 1 and step 2. They cost
   nothing, they answer section B, and the collision check is a prerequisite for the
   backfill.
4. **Check the live rules and indexes** — still the top item on the roadmap and
   still unverified.
5. Then the Mindbody backfill, with you watching it.
