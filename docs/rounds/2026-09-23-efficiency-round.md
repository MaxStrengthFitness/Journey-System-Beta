# The overnight efficiency round

*Sep 23 2026. AJ: "Take creative liberties and run some overnight projects to
increase speed and efficiency."*

Two audits, four rounds of changes, one measurement script, and a list of
things I deliberately did **not** do — which is the more useful half.

---

## The headline

**First paint went from 613.8 kB to 459.4 kB gzipped. A quarter less, measured
on real builds, with nothing rendering differently.**

And the cause was not the app. It was the build config, which was creating the
exact problem it had been written to prevent.

---

## 1. The login screen was downloading the charting library

`recharts` is not reachable from the app's entry point. Every screen that draws
a chart is already lazy-loaded — that work was done properly.

But recharts shares a few tiny utilities (`clsx`, `reselect`, `react-is`) with
the app shell. The old config named a `vendor-charts` group, and that made the
bundler hoist those shared utilities **into** it. The entry file then held one
live import into that chunk — and one import edge drags the whole file.

So every person signing in downloaded **recharts, d3, redux and immer**:
107 kB gzipped that nobody on the login screen will ever execute. React was
being duplicated into it as well.

The fix is the config alone — no source change — and it is worth **116 kB**.

Two smaller ones, which had to be done together or neither saved anything:

- `data/machine-definitions.ts` is a generated file, 115 kB, and was **27% of
  the main chunk**. It is read by one admin-only "restore standard machines"
  button.
- The demo-seeding card on the studio-selection screen — which every trainer
  walks through on the way to work — pulled the same file in through its own
  import chain.

Both handlers were already async, so both became a load-on-click. **38 kB.**

> **Worth saying:** this was already found and never acted on.
> `docs/rounds/claude-experiment/02-app-shell.md:171` names `vendor-charts`
> "preloaded via hoisted clsx". That whole folder — eight files from Sep 20 —
> still has not been triaged onto the roadmap, and this is the second finding
> in it that turned out to be real.

**The biggest one left, not done:** Firestore is 99.6 kB gzipped and loads
before anything renders, because `src/firebase.ts` starts it at module scope.
The login screen needs auth, not Firestore. Every `import { db }` would have to
become an await, so it is a round of its own — and it touches the Firebase
layer, so it needs your OK.

---

## 2. The progress grid was re-reading itself on every set

This is the one I would have wanted to find.

The grid fetches all exercise logs for the sessions it is showing. That fetch
lived **inside** the sessions listener's callback — and that listener fires on
every write to a session. During a live workout, that is every set a trainer
records.

So: a trainer logs a set → the listener fires → the screen re-reads a few
hundred documents it already had → redraws a grid whose contents did not
change. Then again on the next set. It also walked its batches one after
another, three round trips where one round of three would do.

Now it re-runs only when the *set of sessions* changes, and the batches go out
together.

This is wiring rather than rules, and the house rule is that a green test suite
proves nothing about wiring — so it got a mount test. I checked the test
actually catches the regression: with the old dependency it reads **6 times
instead of 2**.

Three more, all safe, all no-new-index:

- **The exercise history dialog** held every set a client had ever done on that
  machine, live, and it is opened many times a session. Now the last 20.
- **The schedules export** read every studio's bookings and dropped the other
  studios' in memory. The sessions export beside it was fixed for exactly this
  and carries the note; schedules was missed.
- **The schedule hook** added its studio filter only *if* a studio was chosen —
  so before you pick one it read every booking at every location. `useSessions`
  had the identical bug and its fix is the precedent.

---

## 2b. A backfill that could never succeed was retrying forever

Found while checking the audit's claim that the client profile reads a
client's whole history twice on every open. It doesn't — both reads are
one-time backfills, guarded so they run once per client and then write a
marker. The audit overstated it.

Underneath that, though, was something worse.

Both backfills clear their "already started" guard in the catch, so a failure
retries on the next app load. That is right for a dropped connection. It is
wrong for the two failures that will never resolve:

- **permission-denied** — this trainer is not allowed to write this client,
  and will not be tomorrow either.
- **resource-exhausted** — the quota is already gone, and re-reading a
  client's entire history in order to fail again is exactly how Aug 30 became
  a storm.

Either one meant re-reading a long-tenured client's whole history — every
session and every set, a few thousand documents — on **every app load, on
every device, forever**, for a write that could never land. And silently: both
paths only log a warning.

Now only a transient failure retries. Four tests, confirmed to catch the old
behaviour.

---

## 3. What I did NOT do, and why it matters

The audit found about 28 reads with no proper bound. I fixed four. Here is the
reason the other 24 are still there, because it is not obvious and it is the
thing to understand before anyone "just adds a limit":

> **Any server-side bound silently excludes documents that lack the field.**
>
> `orderBy("date")` drops every session with no `date` — it does not error, it
> just returns fewer rows. And a bare `limit()` with no `orderBy` returns an
> **arbitrary** subset, ordered by document ID.

So "add `limit(100)`" to the Limbo queue or the pending-submissions list is not
a bound. It is a silent truncation of a backlog, which is worse than the
unbounded read — at least the unbounded one is honest.

**The clearest case:** the Active Session's history listener reads every session
a client has ever had, with no limit. It is the most-opened screen in the app
and the fix looks trivial — `orderBy("date","desc"), limit(30)`, and the
downstream code already throws away everything past 30, so it is pure waste.

I did not do it. The sort in that file falls back to `startTime` with a comment
saying *"only when a session has no date at all"* — which is the code telling
us such sessions exist. Bounding it would hide somebody's sessions.

That is a data question, not a code question, so I wrote something to answer
it.

---

## 4. `scripts/read-cost-report.ts` — read-only, run it any time

It counts what is actually big, rather than what might be. It uses count
aggregations, not document reads, so counting a 300,000-row collection costs
about 300 reads, not 300,000.

```
npx tsx scripts/read-cost-report.ts
```

It answers, with real numbers:

- **How many sessions have no `date`** — the one thing blocking the fix above.
  If it says zero, that fix is a two-line change and I will make it.
- What one client profile costs to open (it reads the client's whole history
  **twice**, from two different hooks on the same screen).
- Which company-wide listeners are big today — announcements, trainers, the
  machine catalog.
- Which backlogs nobody clears — Limbo, pending access requests.
- **What the 2am function reads tonight.**

---

## 5. The 2am function — still the biggest thing on the list

`calculateFacilityAnalyticsV2` reads **every client, every session ever
recorded, and every set ever logged**, with no filter, every night. Nothing in
the codebase reads what it writes.

I have not touched it: Cloud Functions need your explicit OK, and a functions
change sitting in the repo waiting for someone's next deploy is worse than no
change at all.

The fix is one of two lines, and deleting it is the honest one:

```ts
// Either: delete the function and its schedule outright.
// Or, if the numbers are wanted later, window it like the machine-trends job:
const since = Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000);
const sessionsSnap = await db.collection("sessions")
  .where("createdAt", ">=", since).get();
```

The report above tells you tonight's number. Say the word and it is a
five-minute change plus a `firebase deploy --only functions`.

**Related, and higher frequency:** the Mindbody webhook handler reads the
**entire trainers collection** on every booking event, just to match a name in
memory. There is already a bounded resolver in that same folder
(`staffResolver.ts`) doing the right thing. Same rule — needs your OK.

---

## 6. Two things I checked and rejected

**Scoping the trainers listener.** Every device holds a live listener on every
trainer in the company. The audit flagged it and I was going to fix it — but
several places genuinely need the full list (the Admins "All locations" view,
client merges, name resolution for a trainer covering another studio), and
Firestore cannot express "my studios OR my home studio" in one query. Narrowing
it blind, overnight, with nobody to check the screens, is how you get a picker
that quietly stops listing somebody. At today's headcount it is ~20 documents;
it becomes worth doing before forty locations, not before breakfast.

**Turning off test isolation.** Vitest prints a hint on every run offering
"~12s faster with isolate: false". I tried it: **59 tests fail.** The suite
relies on per-file module isolation for its mocks. The hint is a trap for this
project — noted here so nobody spends an evening on it.

---

## Where things stand

| | |
| --- | --- |
| First paint | **613.8 → 459.4 kB gzip**, −25% |
| Typecheck | 10 — baseline, unchanged |
| Tests | **3,822 passing** in 257 files (+8 new, two new test files) |
| Build | green, all five cron bundles |
| Rules / indexes / functions | **untouched** — nothing to deploy but the app |

Commits: phases 20 to 23. All on `prior-history`, unpushed, waiting alongside
phases 16–19.

## What I need from you

1. **Run `scripts/read-cost-report.ts`** — it is read-only and it decides the
   next three fixes.
2. **The 2am function**: delete it, or window it? It is the single biggest
   number in your Firebase bill's future.
3. **The Mindbody webhook's trainers read** — OK to fix?
4. **Firestore off the login path** (~100 kB): worth a round of its own?
