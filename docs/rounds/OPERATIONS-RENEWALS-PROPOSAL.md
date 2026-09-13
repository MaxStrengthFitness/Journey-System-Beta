# Operations Dashboard + Renewals — Architecture Proposal

Round: **Renewals**, Sep 10 2026.
Branch (proposed): `operations-renewals` off `master`.
Business background this builds on: `docs/business/packages-and-pricing.md` and `docs/business/renewals.md`.

**Decisions locked before writing this (AJ, Sep 10):**

| Decision | Answer |
| --- | --- |
| Name of the Admin Dashboard | **Operations Dashboard** |
| Packages | The Trial (6 mo, 48 sessions), Committed (12 mo, 96), Life Transformed (18 mo, 144). Billed every 4 weeks, auto-renew on completion, monthly or prepaid |
| Unused sessions | Never expire. They bank through breaks and surgeries |
| When the renewal conversation starts | About 10 sessions before the end today. **Every timing threshold is a studio setting** |
| Who talks to the client | Trainers ask; head trainers and studio leaders step in over price or progress |
| What trainers can do | Log the client's thinking: who talked to them, how they feel, what they are on the fence about |
| Per-trainer renewal rates | Studio leaders only |
| What counts as a lost client | A studio setting |
| Outreach | None. The app prepares people; people have the conversation |
| InBody | Store results in the app |
| FileMaker history | Imported after beta launch, probably 1–2 years back |

**Status (Sep 11):** built on `operations-renewals`, one commit per phase (§9). §10 records AJ's answers; §11 records what was built and where it differs from this plan. How to ship it is in `RENEWALS-ROUND.md`.

---

## 1. What your answers changed

### 1.1 The real problem is two clocks drifting apart

Every package runs on two clocks at once:

- **The billing clock.** A payment every 4 weeks for a fixed number of payments. When the last one is made, the contract auto-renews and billing starts again.
- **The session clock.** The package is sized for twice a week, so 8 sessions per 4-week payment, and the sessions never expire.

The website's numbers pin both down (confirm against the Mindbody contract templates — see §10):

| Package | Sessions | Payments | Billing runs | Rate | Payment | Prepay rate |
| --- | --- | --- | --- | --- | --- | --- |
| The Trial | 48 | 6 × $560 | 24 weeks | $70 | $560 | $67 |
| Committed | 96 | 12 × $480 | 48 weeks | $60 | $480 | $57 |
| Life Transformed | 144 | 18 × $432 | 72 weeks | $54 | $432 | $51 |

A client who trains exactly twice a week finishes both clocks on the same day. Anyone else drifts, and **the drift is predictable from their pace**. For a Committed client (96 sessions, billing ends at week 48):

| Average visits per week | Sessions last | Still banked when the auto-renew charges |
| --- | --- | --- |
| 2.0 | 48 weeks (~11 months) | 0 |
| 1.75 | ~55 weeks (~12.6 months) | 12 |
| 1.5 | 64 weeks (~14.7 months) | 24 |
| 1.0 | 96 weeks (~22 months) | 48 |

The 1.5 row is your "they commit to 12 months and it takes 14" problem, to the week. It is visible after about eight weeks of attendance — months before the charge — because by then the pace is clear.

> **Plain version:** Mindbody knows the calendar (when the next charge is). Journey knows the habit (how often the client really comes). Neither can see the collision alone. Put them together and the app can say, in week 8, "Mary is on pace to have 24 sessions left when she auto-renews in March."

### 1.2 "10 sessions before" is the right trigger — it needs a partner

Starting the conversation at 10 sessions left is a good rule, and it becomes the default. But it only catches one of the two ways the clocks go wrong:

- **Sessions run out first** (a client training more than twice a week): the 10-sessions rule catches it.
- **Billing ends first** (breaks, surgery, 1.5×/week): the client may still have 24 sessions when the card is charged, so "10 sessions left" never fires before the charge. This needs a second trigger based on the **charge date**.

So there are two triggers, both studio settings: *sessions left* (default 10) and *days before the auto-renew charge with sessions still banked* (default 30 days, 4+ sessions).

### 1.3 What the app can actually see today

As of the Sep 9 production dry run: 627 clients, 203 sessions total (8 clients), and at most 16 clients with any Mindbody contract or membership on file. Contract changes are handled by the webhook code but never subscribed to, and the subscription only covers Solon's site. **Phase 0 exists to fix this**; without it the renewal screen would be empty.

### 1.4 Found while scoping — context for §5.6 and §8

- The old `RetentionDashboardView` (deleted Sep 6) never worked: it read 24 hours of sessions, the first 2,000 exercise logs in the database, and only clients whose `remainingSessions` was above 0, a field the Mindbody sync sets to 0 for every client it creates. It had no contract dates at all.
- `server.ts` proxies Mindbody client data (`/api/mindbody/client-demographics`, `/client-commercial`) without checking the caller is signed in.
- Client documents are keyed by Mindbody client ID alone. Mindbody guarantees those IDs only within one site, and MSF has two.
- `progressReports`, `journalEntries`, `exerciseLogs`, `clinicalIncidents` and `schedules` are still readable by any signed-in user. New collections in this round must not copy that.
- The client profile's **Retention Status — MIA Tracking** switch writes `retentionMeta`, which nothing has read since the old dashboard was deleted. This round reads it again (as a pause), so the switch starts working.

---

## 2. How the app will read a client's renewal

### 2.1 Words used below

| Term | Meaning |
| --- | --- |
| **Renewal cycle** | One contract term, keyed by Mindbody's `clientContractId`. Ends when the next contract starts, or when the studio's "lost" rule fires |
| **Charge date** | When the contract completes and auto-renews: Mindbody's `EndDate`, or start + payments × 28 days |
| **Sessions left** | Mindbody's remaining count when available (authoritative); otherwise package sessions minus sessions used this cycle, labeled *estimate* |
| **Pace** | Visits per week over the last 8 weeks, not counting Vacation / Snowbird / Medical time |
| **Run-out date** | Today + sessions left ÷ pace |
| **Banked at charge** | Sessions left minus the visits expected before the charge date, if above zero |

### 2.2 The four situations, and the flags

Each client is in exactly one situation. Every one of them renders as a sentence, never a score.

| Situation | Sentence on screen | What it asks of a leader |
| --- | --- | --- |
| **On track** | "9 sessions left · auto-renews Nov 14 · on pace" | The normal conversation, at 10 left |
| **Will bank** | "Auto-renews Nov 14 with ~16 sessions still banked" | Talk before the charge; decide in Mindbody whether to push the renewal |
| **Will run out** | "Out of sessions around Oct 3, six weeks before billing ends" | Early conversation or more sessions |
| **Away** | "Snowbird until Apr 1 · clocks paused" | Nothing until they are back |

Flags ride alongside, each with its evidence: payment problem (card declined or autopay suspended — source to confirm, §10), nothing booked in the next 14 days, 2+ cancellations or no-shows in 30 days, on a break (14+ days, no away event), a rough patch (2 of the last 4 sessions "Wiped Out" or low energy / mood), open pain incident, a Red in the last 90-day check-in, no progress report this cycle, and missing Mindbody data.

Every threshold is a **named constant with a minimum sample**, the rule Insights already follows: a client with three sessions has no "pace" yet, and the screen says so instead of guessing.

### 2.3 Studio settings (each studio customizes its own)

| Setting | Default | Why this default |
| --- | --- | --- |
| Start the conversation at | 10 sessions left | Current practice |
| Warn before the charge when | ≤ 30 days out and ≥ 4 sessions banked | Enough time to talk and adjust in Mindbody |
| Planning horizon | 3 months | The 1 / 2 / 3-month view asked for |
| A break is | 14 days with no visit | Same constant as the History tab |
| A client is lost after | 30 days past the charge date with no new contract | Studio decides |
| Pay-as-you-go counts as | Retained | Studio decides |
| Away events pause the clocks | Yes | Snowbirds are not churn |
| Package table (names, sessions, rates, payments, prepay) | The website's numbers | Pricing varies by location |

The package table also lists **how each package is named in that studio's Mindbody**, because contract names differ between locations and the app has to recognize "Committed 12 Month EFT" as the Committed package.

---

## 3. Who sees and does what

| | Trainer (Life Transformer) | Head trainer / Studio leader | Franchise owner / Admin |
| --- | --- | --- | --- |
| Renewal chip on the client profile, briefing line | ✓ | ✓ | ✓ |
| Log a renewal conversation (leaning, concerns, note, "needs a leader") | ✓ | ✓ | ✓ |
| Read a client's conversation history | ✓ (clients they can open) | ✓ | ✓ |
| Operations → Renewals pipeline | — | ✓ their studio | ✓ their studios |
| Set stage, who is leading, outcome | — | ✓ | ✓ |
| Per-trainer renewal rates | — | ✓ | ✓ |
| Studio renewal settings and package table | — | ✓ | ✓ |

> **Plain version:** trainers report from the floor; leaders steer. A trainer never has to open the Operations Dashboard — it is only available to studio leaders and above — so everything a trainer needs comes to the screens they already use.

---

## 4. Screens

### 4.1 The rename

Labels only: the App Mode toggle's **Admin** becomes **Operations**, and **Go To Admin Panel** becomes **Go to Operations**. The internal names (`appMode === "admin"`, `currentView === "admin-dashboard"`) stay as they are — renaming internals touches dozens of lines for no visible benefit, and each touch is a chance to break navigation.

A new **Renewals** tab goes first in the Studio Management group.

### 4.2 Operations → Renewals (leaders)

Four numbers across the top: **Before the charge** · **Talk now** · **Coming up (3 months)** · **Missing Mindbody data**.

Below them, lanes by *how soon something dies*, the Hub's lifespan rule:

1. **Before the charge** — will-bank clients inside the warning window, plus payment problems. These have a hard date.
2. **Talk now** — 10 or fewer sessions left and no decision recorded.
3. **Coming up** — charge dates in the next 1, 2 and 3 months, grouped by month.
4. **Lapsed** — past the studio's lost rule; a win-back list.

Each row: name · trainer · package with both clocks in one line ("Committed · 9 left · auto-renews Nov 14") · latest leaning ("Unsure — price") · one line of proof ("2×/wk for 11 months, stronger on 12 of 14 machines") · the next step.

Filters: needs a leader · on the fence about price · upgrade candidates · nobody has talked to them yet.

A leader-only panel shows renewal outcomes this quarter by studio, package and trainer. Per-trainer numbers need at least 5 outcomes before they show, and they are labeled as context, not a verdict — the same care Insights takes with return rate.

The tab and the settings editor are built from the admin kit, so they follow `src/features/admin/README.md`: dirty-tracked saves that write only the diff, `AdminRows`, the admin tokens, plain studio English.

### 4.3 The Renewal Brief (tap any client)

One screen to prepare for the conversation. It is ordered to lead with **health, not bodybuilding**, because that is what your clients say they came for:

1. **Their journey** — how long they have been with you, sessions this cycle, consistency ("in 46 of the last 48 weeks").
2. **Health wins** — InBody changes (muscle up, body fat down), 90-day check-in changes (sleep, energy, pain), goals from the last progress report.
3. **Strength** — the five biggest machine gains, in plain words.
4. **Best rhythm** — time of day or rest-gap patterns from the Clinical Review engine, only when its confidence is "solid".
5. **Where they stand** — both clocks, and banked sessions explained in one sentence.
6. **Options** — the studio's package table applied to this client (§6).
7. **Conversation history** — every logged conversation, newest first.

The Brief is computed when it is opened, from the same engine the Clinical Review already uses, so it costs reads only for the one client being prepared for.

### 4.4 What trainers see

| Where | What |
| --- | --- |
| Client profile header (`ProfileHeader.tsx`) | A renewal chip: "9 sessions left · auto-renews Nov 14". Tap for the Renewal card: status, conversation history, **Log a conversation** |
| Post-session screen (`VictoryHUDScreen.tsx`) | Only when the client is in a window: "Renewal: 9 left. Talk about it today?" → a 15-second sheet: leaning (5 big chips), on the fence about (price · commitment length · results · schedule · health · travel · trainer fit · other), optional note, **Needs a leader** |
| Pre-session briefing (`BriefingScreen.tsx`) | The latest conversation in one line — "Unsure, price. Jen is following up." — so the next trainer doesn't ask again |
| Studio Hub, "Clients waiting on us" | Renewal items: conversation due, progress report due before the conversation, follow-up requested |
| Trainer profile | **My renewals**: clients they have coached in the last 60 days who are inside a window |

Trainers' floor observations ("does better in the mornings") keep going in the Journal, which the Brief already reads. No new place to write them.

### 4.5 InBody in the app

- An **InBody** card on the client profile: the latest result plus weight, muscle and body-fat trend lines — the "Body Composition History" block of the printout, but kept forever and visible on the iPad during a session.
- **Add scan**: manual entry of the headline numbers first (weight, skeletal muscle mass, body fat mass, percent body fat, BMI, phase angle; segmental optional). Two minutes per scan.
- The Brief and the 90-day progress report pull the changes automatically.
- Later, cheaper to enter: a photo of the printout read by the Gemini endpoints the server already has, with the trainer confirming each number; then the **LookinBody Web API**, which uses an API key from your LookinBody Web account (arranged through InBody's integration team).

Body composition is health data, so its permissions follow the **sessions** rule (only people who can open the client), not the loose `progressReports` rule.

---

## 5. Data architecture

### 5.1 The flow

```
Mindbody change events ──┐  contract created / updated / cancelled (webhooks)
Mindbody nightly pull ───┤  contracts + pricing options, only clients near a window
Journey attendance ──────┤  schedules (completed, cancelled, no-show, next booking)
Journey coaching ────────┤  sessions, check-ins, machineStats, 90-day snapshot, events
InBody scans ────────────┘
          │
          ▼
  buildRenewalSnapshot()  ← one pure, tested function
          │
          ├─► clients/{id}.renewal                    what trainers may see
          ├─► studios/{s}/renewals/{contract}         stage, lead, outcome (leaders)
          └─► studios/{s}/renewals/{contract}/touches  conversation log (trainers write)
```

> **Plain version:** instead of every iPad re-reading every client's history each time a screen opens — which is exactly why the old Retention dashboard failed — the server writes a small "report card" per client overnight. Screens read report cards. Heavy thinking happens once a night, in one place.

### 5.2 Where things are stored, and why

| Data | Location | Why there |
| --- | --- | --- |
| The snapshot (situation, clocks, flags, proof) | `clients/{id}.renewal` | Arrives with the client document the app already listens to, and inherits the tenancy rules finished on Sep 7 |
| The renewal cycle (stage, who is leading, outcome) | `studios/{studioId}/renewals/{clientContractId}` | One per contract term, so history accumulates: renewed in March, upgraded 12→18 in April |
| Conversation log | `.../renewals/{id}/touches/{touchId}` | One document per conversation. Several trainers write, and one shared array would let two iPads overwrite each other — the same lesson as initiative submissions |
| Studio settings and package table | `studios/{studioId}/config/renewals` | Leader-only writes, enforced by the path |
| InBody scans | `clients/{clientId}/inbodyScans/{scanId}` | Belongs to one person; permissions follow the client |

> **Plain version:** Firestore permissions work on whole documents, not on individual fields. Anything trainers should not see — or should not be able to change — has to live in its own document.

**Store dates, not countdowns.** The snapshot saves "auto-renews 2026-11-14", never "41 days". A countdown changes every night for every client, which means rewriting 627 documents nightly and waking every open listener; a date changes only when something about the client changes.

### 5.3 TypeScript interfaces

```ts
// src/features/renewals/types.ts

export type RenewalSituation = "on-track" | "will-bank" | "will-run-out" | "away" | "lapsed" | "unknown";

export type RenewalFlagCode =
  | "payment-problem" | "no-future-booking" | "missed-sessions" | "on-break"
  | "rough-patch" | "open-pain" | "check-in-red" | "no-report-this-cycle" | "missing-mindbody-data";

export interface RenewalFlag {
  code: RenewalFlagCode;
  /** The sentence shown on screen, evidence included. */
  text: string;
}

/** Server-written. clients/{id}.renewal */
export interface RenewalSnapshot {
  version: number;
  computedAt: unknown;                 // Firestore Timestamp
  clientContractId: string | null;     // the current cycle
  packageKey: string | null;           // "trial" | "committed" | "transformed" | a studio's own
  packageLabel: string | null;         // "Committed · 12 months"
  billingStart: string | null;         // YYYY-MM-DD, Eastern
  chargeDate: string | null;           // the auto-renew date
  autoRenews: boolean | null;
  sessionsLeft: number | null;
  sessionsLeftSource: "mindbody" | "estimate" | null;
  pacePerWeek: number | null;          // null until the minimum sample is met
  runOutDate: string | null;
  bankedAtCharge: number | null;
  situation: RenewalSituation;
  conversationDue: boolean;            // sessionsLeft <= the studio's threshold
  /** Earliest date something needs doing. The pipeline's sort key. */
  focusDate: string | null;
  flags: RenewalFlag[];
  proof: {
    weeksAttended: number | null;      // of the last 12
    machinesImproved: number | null;   // from machineStats first vs latest
    bestGain: { machineName: string; pct: number } | null;
    inbody: { muscleLbChange: number; bodyFatPctChange: number; since: string } | null;
  };
  /** Set while an away event (Vacation / Snowbird / Medical) or the MIA pause is active. */
  awayUntil: string | null;
  lastVisitDate: string | null;
  nextBookingDate: string | null;
  /** Trainers who coached this client in the last 60 days — powers "My renewals". */
  coachIds: string[];
  /** e.g. "No Mindbody contract on file — sync from the Admin card" */
  dataGaps: string[];
}

export type RenewalLeaning = "renewing" | "leaning-yes" | "unsure" | "leaning-no" | "not-renewing";

export type RenewalConcern =
  | "price" | "commitment-length" | "results" | "schedule" | "health" | "travel" | "trainer-fit" | "other";

/** studios/{studioId}/renewals/{clientContractId} — leaders own it. */
export interface RenewalCycle {
  clientId: string;
  clientName: string;
  clientContractId: string;
  packageKey: string | null;
  chargeDate: string | null;
  stage: "not-started" | "talking" | "decided";
  leadTrainerId: string | null;        // who is leading the conversation
  latestLeaning: RenewalLeaning | null;
  latestConcerns: RenewalConcern[];
  needsLeader: boolean;
  lastTouchAt: unknown | null;
  lastTouchBy: string | null;
  outcome: "renewed" | "upgraded" | "downgraded" | "pay-as-you-go" | "lost" | null;
  outcomeAt: unknown | null;
  nextClientContractId: string | null;
  /** The trainer who coached the most sessions this cycle — for leader-only rates. */
  primaryTrainerId: string | null;
}

/** .../renewals/{id}/touches/{touchId} — one per conversation, never edited. */
export interface RenewalTouch {
  authorId: string;
  authorName: string;
  at: unknown;
  leaning: RenewalLeaning;
  concerns: RenewalConcern[];
  interestedIn: "same" | "longer" | "shorter" | "prepay" | "monthly" | null;
  note: string;
  needsLeader: boolean;
}

/** studios/{studioId}/config/renewals */
export interface RenewalSettings {
  conversationAtSessionsLeft: number;  // 10
  chargeWarnDays: number;              // 30
  chargeWarnMinBanked: number;         // 4
  horizonMonths: number;               // 3
  breakDays: number;                   // 14
  lostAfterDays: number;               // 30
  payAsYouGoCountsAs: "retained" | "lost";
  pauseDuringAwayEvents: boolean;      // true
  packages: PackageTier[];
}

export interface PackageTier {
  key: string;                         // "committed"
  label: string;                       // "Committed"
  months: number;                      // 12
  payments: number;                    // 12, one every 4 weeks
  sessions: number;                    // 96
  ratePerSession: number;              // 60
  paymentAmount: number;               // 480
  prepayRatePerSession: number;        // 57
  /** How this studio's Mindbody names the contract. Matched case-insensitively. */
  mindbodyNames: string[];
}

/** clients/{clientId}/inbodyScans/{scanId} — InBody 270S */
export interface InBodyScan {
  testedAt: string;                    // from the printout, Eastern
  device: string;                      // "InBody 270S"
  weightLb: number;
  skeletalMuscleMassLb: number;
  bodyFatMassLb: number;
  percentBodyFat: number;
  bmi: number | null;
  totalBodyWaterLb: number | null;
  dryLeanMassLb: number | null;
  fatFreeMassLb: number | null;
  basalMetabolicRateKcal: number | null;
  smi: number | null;                  // kg/m²
  phaseAngle: number | null;           // whole body, 50 kHz
  segmentalLean: Partial<Record<"rightArm" | "leftArm" | "trunk" | "rightLeg" | "leftLeg",
    { lb: number; pctOfIdeal: number | null }>> | null;
  source: "manual" | "photo" | "lookinbody";
  enteredBy: string;
  createdAt: unknown;
}
```

### 5.4 The engine — mostly pieces you already have

`src/features/renewals/engine.ts`, pure functions with tests, in the same style as `features/admin/insights/metrics.ts`:

| Function | Built from |
| --- | --- |
| `matchPackage(contract, settings)` | The studio's `mindbodyNames` list |
| `billingClock(contract, tier, today)` | Mindbody `EndDate`, or start + payments × 28 days |
| `pace(visits, events, today)` | `toVisitDays`, `computeCadence` and `AWAY_EVENT_TYPES` from `features/client-history/model.ts` |
| `sessionClock(sessionsLeft, pace, today)` | Mindbody remaining count, else the package total minus visits this cycle |
| `situationOf(...)`, `flagsFor(...)` | The thresholds in `RenewalSettings` |
| `proofFor(client, scans)` | `client.machineStats` (first vs latest weight), `subjectiveSnapshot`, the scans |
| `upgradeCandidate(...)`, `optionsFor(...)` | §6 |
| `buildRenewalSnapshot(...)` | Everything above |

None of these modules import the Firebase browser SDK, so the server job can run the same code the tests cover.

### 5.5 The nightly job

`server/cron-renewals.ts` as a Render cron job at about 2:30 AM Eastern, next to the leaderboard job (roughly $1 a month). Per studio:

1. Read the studio's renewal settings.
2. Read its clients, its schedule rows from the last 60 days and next 30, and its sessions from the last 90 days — **a fixed window**, so the cost stays flat as history grows. (The current leaderboard job reads every exercise log ever written, every night; this one must not.)
3. Pull Mindbody commercial data only for clients whose focus date is inside 120 days or whose data is more than 30 days old, capped so the day stays under Mindbody's 1,000 free calls.
4. Build snapshots and write only the ones that changed. Open or close renewal cycles; record outcomes when a new contract appears.

Plus `POST /api/renewals/recompute` (signed-in callers only) to refresh one client right after a Mindbody sync or a logged conversation.

> **Why Render and not a Cloud Function:** the Render server already holds the Mindbody credentials (the Aug 29 decision kept them out of Cloud Functions), it deploys whenever `master` is pushed, and its cron jobs contact nobody.

### 5.6 Mindbody changes — backend, needs your go-ahead

1. **Require a signed-in user on every `/api/mindbody/*` route** (verify the Firebase ID token and that the caller works at a studio on that site). Before this round sends more client data through them, not after.
2. **Check for client-ID collisions** between the two sites with a read-only script. If any exist, client identity has to become site + ID before anything joins contracts to workout history.
3. **Subscribe `clientContract.*` and `clientMembershipAssignment.*`** on both sites (29068 and 5746957). The handlers were written Aug 29; what is missing is the subscription (and a current functions deploy).
4. **Pull what renewals need:** keep `UpcomingAutopayEvents` from the contracts call (the scheduled charges — currently thrown away), and add the pricing-options call that carries each package's session count and remaining sessions. Auto-renew itself arrives on the contract webhook (`isAutoRenewing`); the pull API only reports `AutopayStatus`. Before writing the engine, pull 5 real clients read-only and look at the actual shapes — that settles where "remaining" and "declined" really live.
5. **No writes to Mindbody.** Mindbody can suspend or terminate contracts through its API; this app won't. When a client will bank sessions, the app tells a leader early and the leader adjusts the contract in Mindbody.

### 5.7 Firestore rules and indexes

- `clients/{id}`: an ordinary trainer update can no longer change `renewal` (only the server writes it).
- `renewals/{id}`: readable by trainers who work at the studio; stage, lead and outcome writable by that studio's leaders; a trainer's write may touch only the `latest*`, `needsLeader` and `lastTouch*` fields.
- `touches/{id}`: any trainer at the studio can create one as themselves; nobody edits one; a leader can delete a mistake. (The same accountability shape as the upkeep log.)
- `config/renewals`: read by the studio's trainers, written by its leaders.
- `inbodyScans/{id}`: readable only by people who can open the client (the sessions pattern, reusing `clientIsReadableBy`); written by trainers at the client's studio.
- One composite index: `clients (homeStudioId ASC, renewal.focusDate ASC)`.

Rules tests go in `tests/firestore.rules.test.ts` and run with `npm run test:rules` on Windows, as usual.

### 5.8 Cost

| Piece | Rough cost |
| --- | --- |
| Nightly job reads (fixed window, 4 studios) | Tens of thousands of reads a night — well under $1 a month |
| Screens | One query per studio for the pipeline; the Brief reads one client on demand |
| Mindbody | Webhooks for changes; pulls only near a window; the first backfill spread over two or three nights to stay under the free 1,000 calls a day |
| Render cron | About $1 a month |

---

## 6. Upgrade conversations: price and commitment fear

You said price is the top reason people leave, and that 18 months intimidates people who "just want to be healthy." The Brief is designed around that.

**Show the math, from the studio's own table.** For a Committed client considering Life Transformed:

| | Committed | Life Transformed |
| --- | --- | --- |
| Per session | $60 | $54 |
| Every 4 weeks | $480 | **$432 — $48 less every payment** |
| 144 sessions | $8,640 | $7,776 — **$864 less** |
| 144 sessions, prepaid | — | $7,344 — $1,296 less |

The line that answers "can I afford a bigger commitment" is the second one: the longer package lowers every payment.

**Use their own evidence against the fear of not continuing.** "You've trained twice a week for 46 of the last 48 weeks. Eighteen months is the habit you already have, at $6 less a session."

**Answer "I'm not a bodybuilder" with health numbers.** Muscle up and body fat down on the InBody, better sleep and less pain on the 90-day check-in, and "stronger on 12 of 14 machines" rather than pounds lifted.

**Be honest about fit.** A client who reliably comes 1.5 times a week will bank sessions on every package. The Brief says so, so the conversation can be about the right package for their real habit — which also prevents next year's collision.

**Guardrails in code.** An upgrade suggestion appears only when attendance is consistent, progress is visible, and there is no open pain, Red check-in or payment problem. No copy that pressures; it is information for a conversation between people.

The Double Transformation Guarantee ("show up consistently 2 × week…") is itself about attendance, which the app now measures. A later idea: show a client's consistency toward that guarantee — it is the honest answer to "what if I don't see progress?".

---

## 7. FileMaker import: a recommendation on scope

Import **two years of detailed history, plus one "first ever" record per machine per client**, and stop there.

- Two years covers the current cycle and the one before it — everything a renewal conversation uses.
- The "first ever" record is what makes "since you started" true. `client.machineStats.firstWeight` is already write-once for exactly this reason; the importer just has to feed it the earliest FileMaker weight even when the detailed rows stop at two years.
- Imported clients get a "history in Journey starts" date, so the Brief says "History starts Mar 2024" instead of showing a five-year member as "+0%".

It is its own round once the data arrives from the old developers. Nothing in this round waits for it.

---

## 8. Risks and things I want on the record

- **The data is the long pole.** Until Phase 0 runs, at most 16 of 627 clients have contract data. Every screen shows missing data as missing rather than inventing it.
- **Mindbody's exact shapes are unconfirmed** for remaining sessions and declined payments. The 5-client read-only look in Phase 0 comes before the engine for this reason.
- **Client-ID collisions across the two sites are unverified.** If they exist, identity changes first.
- **Trainer identity.** Conversation logs record the trainer document id. Trainers whose document id still differs from their sign-in id (the `pendingClaim` path) need the Sep 6 claim to have run.
- **Other collections' read rules** (`progressReports`, `journalEntries`, `exerciseLogs`, `clinicalIncidents`, `schedules`) stay open to any signed-in user. Not this round, but worth a date.
- **The iPad review backlog** keeps growing; this round adds screens to it.
- **No outreach.** Nothing in this round sends a message to anyone.

---

## 9. Phase plan — one branch, one commit per phase

Branch `operations-renewals` off `master`. Each phase typechecks and passes tests on its own, so any single phase can be reverted.

| Phase | What | Touches the backend? |
| --- | --- | --- |
| 0 | Mindbody safety and plumbing: route authentication, the collision check, contract/membership subscriptions on both sites, the extra pull fields, the 5-client discovery report | **Yes — needs your OK** |
| 1 | Admin → Operations rename (labels only) | No |
| 2 | Studio renewal settings and package table: config doc, leader-only editor, rules | Rules |
| 3 | The renewal engine: pure functions and tests | No |
| 4 | The nightly job, the recompute endpoint, snapshot rules, the index | Yes (server) |
| 5 | Conversation log and trainer screens: profile chip and card, post-session prompt, briefing line, Hub items, My renewals | Rules |
| 6 | Operations → Renewals and the Renewal Brief | No |
| 7 | InBody: entry, trend card, Brief and progress-report hooks, rules | Rules |
| 8 | Outcomes and leader-only renewal rates | No |

Deploy order afterwards, as always: indexes → `npm run test:rules` → push `master` → rules → subscribe the webhooks → first Mindbody backfill (spread across nights).

---

## 10. Answers (AJ, Sep 10–11)

1. **Phase 0: go ahead.** "Everything else is golden."
2. **What a package looks like in Mindbody**, from two screenshots AJ sent on Sep 11:
   - A **paid-in-full** client holds one pricing option named for the package, "144 PIF", with a count and a remaining number (109 of 144 left) and an expiry date.
   - A **monthly** client gets a new pricing option with each payment: "48 Sessions - 2X Week", **8 sessions each**.
   - Complimentary sessions are their own pricing option, "Session Comp" (2 sessions). They count toward sessions left but aren't a package.

   So "sessions left" comes from **pricing options**, not memberships: the sessions on hand, plus 8 for each payment still to come.
3. **Declined cards: not now.** The app shows Mindbody's autopay status ("autopay is suspended") and nothing more.
4. **Defaults: kept.** 10 sessions left; 30 days before the charge with 4 or more banked; a 14-day break; lost 30 days after the end; pay-as-you-go counts as kept.
5. **InBody:** manual entry of the printout first. **Each studio has its own LookinBody Web account**, so a later import needs one API key per studio.
6. **Name:** "Renewals".

---

## 11. What was built, and where it differs from this plan

| Area | What was built | Why it differs |
| --- | --- | --- |
| Refreshing one client (Phase 4) | **No `POST /api/renewals/recompute`.** Single-client screens (the Renewal card, the Brief) work the snapshot out live in the browser (`useLiveRenewal`). The nightly job stays the only writer of `clients/{id}.renewal` | The Render web service holds no Firestore admin key (`render.yaml`). An endpoint would have needed one. |
| Route authentication (Phase 0) | `server/auth.ts` verifies the Firebase ID token with the project id alone, then reads the caller's trainer document and the studio list over the Firestore REST API **with the caller's own token** | Same reason: no admin key on the web service. Browser calls go through `authedFetch` (`src/lib/authed-fetch.ts`). |
| Where the tab sits (Phase 1–2) | Operations → Renewals is second, right after Overview. It has three views: **Pipeline**, **Outcomes**, **Settings** | Second rather than first, so the dashboard still opens on the studio's day. |
| Renewal cycles | A cycle's key is the Mindbody contract id, or `pif-<pricing option id>` for paid in full | Paid-in-full clients have no contract to key on. |
| A renewal already signed | When the next contract is already on the books while the current one runs, the snapshot says "renewed · next starts …". Prompts stop, the pipeline drops the client, and the job records the outcome that night | Not in the plan. Without it, clients who had already renewed kept being chased until their old contract ended. |
| Outcomes (Phase 8) | The nightly job records **renewed / upgraded / downgraded** when a newer package appears and **lost** when the studio's lost rule fires. It takes back its own "lost" if the client comes back. **Pay-as-you-go is a leader's call**, made in the Brief. The job never overwrites a leader's outcome | From Mindbody alone, the job can't tell single sessions from a package the studio hasn't matched in its settings. |
| Per-trainer rates | Outcomes are attributed to whoever coached the most visits in the package's last 90 days. A trainer shows from 5 outcomes, labeled "context, not a verdict" | As planned. The attribution rule is new. |
| InBody on the progress report (Phase 7) | The report reads the client's scans live. Nothing is copied into the report | `progressReports` can be read by any signed-in user; body composition is health data. |
| Deploy order | Indexes → rules tests → **rules → push** | Rules before the push is the Sep 10 pattern: the new rules only add to what's there, so the running app is unaffected, and the new app finds its rules waiting. |
| Where attendance starts | Before a studio's first synced booking, attendance is **unknown, not zero**. Pace and proof say "not enough data yet" instead of "no visits" | Most history is still in FileMaker. |

Still open after this round:

- **Two older security holes the review found** (`RENEWALS-ROUND.md` §9). A trainer can edit their own role and studio lists, and any trainer can edit any studio document. Both undo role checks this round relies on. The fix is a small rules round and needs AJ's OK.
- **Client-ID collisions** between the two sites: run `scripts/check-mindbody-client-collisions.ts` before subscribing site 29068 to contract webhooks.
- **Webhook subscriptions:** deploy the Cloud Functions, then `node register-webhook.js --site 29068 --list` (look first), then subscribe.
- **The first backfill:** `npx tsx scripts/run-renewals.ts --pull` (dry run), then let the nightly job pull about 300 clients a night.
