# What Journey will cost to run: a model built from the code

## Corrected Oct 5 2026: the Enterprise edition's prices (the speed round, R31)

**Read this section first; it supersedes the Sep 25 model's prices and totals below.** That model priced Firestore as the Standard edition, multi-region ($0.06 per 100k reads), which is about 12 times too high for an indexed read on this database, and it had no line for collection scans, real-time updates, internet egress or point-in-time recovery. Production Firestore is the **Enterprise edition in us-west1** (one region), and it bills differently. The figures here are from the speed round's blueprint (https://claude.ai/artifact/3BVGAvBj8ooWwMNhQ2tEtt, §7), with prices fetched on Oct 5 2026. "Est." means an estimate. Read off invoices on the night of Oct 5 2026 (AJ's dashboards): Mindbody's ($13.56 for 6,779 calls), Render's (September $50.00, August $18.75), and Render's billing page (October projected $50 before the crons).

### The answer

- **Today (4 studios): about $66–68 a month**: Render $50 (workspace and web), the two crons about $2 (created on Oct 5 2026), Mindbody about $14 (one cent for every five calls), Firestore $0–2.
- **After the speed round, and once R20's gate allows the smaller web instance: about $48–50 a month.**
- **At 100 studios of 300 clients: about $720–790 a month after the fixes** (Mindbody about $645 of it), against **about $3.9k if nothing had changed** (about $1.7–7.3k; the scans). **Mindbody is the biggest line at every size from here**; every call it is spared is $0.002.

### Prices used (Oct 5 2026)

| What | Price |
| --- | --- |
| **Firestore read units** (Enterprise, us-west1) | **$0.05 per million, one unit per 4 KiB read.** An indexed lookup is about one unit a document. **A query with no index scans the whole collection and is billed on the summed bytes of every document it reads ÷ 4 KiB** |
| **Firestore real-time updates** | **$0.30 per million**, one per 4 KiB of each changed document, for every listener that receives it |
| **Firestore write units** | **$0.26 per million, one per 1 KiB**, and every index entry a write touches counts |
| Firestore storage · point-in-time recovery | $0.24 · $0.15 per GiB-month (PITR is on) |
| Internet egress (Render's crons read Firestore over the internet) | first 10 GiB a month free, then $0.12 per GiB, from any Render region |
| Firestore free tier | worth about $2 a month, and given to **one database per project**; this project has seven, so Journey's named database may not have it. It moves no total |
| **Render** | Pro workspace **$25** flat (25 GB bandwidth, then $0.15/GB; 1,000 build minutes, then $5 per 1,000; metrics and logs kept **14 days**). Web instance `1c-2g` **$25**, `0.5c-512mb` $7, `2c-4g` $85. Each cron service **at least $1 a month** ($0.00016 a minute). Edge caching included |
| Cloud Run functions (gen 2) | 2M requests, 180k vCPU-seconds and 360k GiB-seconds free per billing account, then $0.40 per million requests. Artifact Registry storage is charged even inside the free tier |
| Gemini 3 Flash (preview) | $0.50 per million input tokens, $3.00 per million output. **R33, answered Oct 5 2026:** the scans run in the MaxStrengthFitness App project (`gen-lang-client-0731527386`), which AI Studio shows on the **paid tier (Tier 1, Firebase payment)**, so Google does not use them to improve its products |
| **Mindbody** | **$0.002 for every call, from the first one (R29, answered Oct 5 2026 from the developer account).** The Sep 25 invoice was **$13.56 for 6,779 calls** (Aug 24 – Sep 23: Solon 1,191, the shared site 29068 5,588; busiest day 922), which is exactly 6,779 × $0.002. Mindbody's report shows "0 call overages" for the same cycle, so an overage is a separate, higher charge above a threshold Journey has not reached, not the per-call fee. The three readings this table used to carry (1,000 a day free, 5,000 a cycle free, $0.0033 after 1,000 a day) are all wrong. Booking through the API costs **$2.50 an appointment** |

### Today, line by line

| Line | How it is worked out | $ a month |
| --- | --- | --- |
| Render Pro workspace | flat | 25 |
| Render web `1c-2g` | flat | 25 |
| Two Render crons | $1 minimum each (they run about $0.05). **They did not exist until Oct 5 2026**: render.yaml was never linked as a Blueprint, so its two cron jobs were never created and the nightly renewals job had never run; AJ created both in the dashboard that night (region Ohio) | 2 |
| Render bandwidth and builds | 32 MB out and 8 of 1,000 build minutes in October to the 5th | 0 |
| Firestore | indexed reads about $0.1, scans about $1, real-time about $0.2, writes about $0.1, storage and PITR about $0.1 (modelled; the console showed 66K reads, 8.2K writes and 554 real-time reads in the 24 hours to Oct 5, which is pennies) | 0–2 |
| Mindbody | the Sep 25 invoice: 6,779 calls × $0.002 | about 14 |
| Functions, Scheduler, Auth, Gemini | free tiers, or not used | about 0 |
| **Total** | | **about $66–68** |

### After the speed round

| Change | $ a month |
| --- | --- |
| Web `1c-2g` → `0.5c-512mb` (R20; only after its gate: edge caching showing HIT, the one-scan slot, two recorded 14-day windows under 300 MB memory p95, and AJ's approval) | **−18** |
| The scans indexed (R1, R2, R24): about −$1 today, plus about $0.1 of index writes | about −1 |
| The deleted functions, TTL on the webhook's logs, edge caching, budgets | about 0 |
| **New total** ($25 + $7 + $2 + Firestore $0–2 + Mindbody about $14) | **about $48–50** |

Hobby instead of the Pro workspace would save $25 more but loses latency metrics, request logs and seats; not during these rounds.

### At 25, 50 and 100 studios

Assumptions: sessions a month = studios × clients × 1.6 × 4.33; six iPads a studio; history 1.75 × active clients. The "as is" column includes the unindexed scans the speed round removes, modelled at about 23–27 KB per company client per scan and good to about ±2× (an order of magnitude, not a forecast). "After" is indexed reads, real-time, writes, storage, PITR, device egress and the crons' egress; Render after is $25 + $7–14 + $2 + bandwidth $0–5 + builds $0–5.

| Studios × clients | Sessions a month | Mindbody A / B / C | Firestore as is (scans) | Firestore after | Functions | Render after | **Total as is** (central, range) | **Total after** (range; central at B) | After, per studio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 × 150 | 25,980 | $0 / $101 / $83 | $56 ($49) | $7–8 | $0–2 | $34–46 | **about $209** ($0.13–0.32k) | **$41–157**; about $149 | $6.0 |
| 25 × 300 | 51,960 | $0 / $151 / $165 | $209 ($195) | $14–16 | $0–2 | $34–46 | **about $412** ($0.2–0.65k) | **$48–229**; about $206 | $8.2 |
| 50 × 150 | 51,960 | $0 / $212 / $266 | $212 ($195) | $17–19 | $0–2 | $34–46 | **about $477** ($0.2–0.75k) | **$51–333**; about $270 | $5.4 |
| 50 × 300 | 103,920 | $0 / $313 / $433 | $811 ($780) | $27–36 | $1–3 | $34–51 | **about $1.2k** ($0.5–2.1k) | **$62–523**; about $383 | $7.7 |
| 100 × 150 | 103,920 | $0 / $435 / $634 | $819 ($780) | $32–44 | $1–3 | $34–51 | **about $1.3k** ($0.5–2.4k) | **$67–732**; about $517 | $5.2 |
| 100 × 300 | 207,840 | $0 / $635 / $964 | $3,186 ($3,119) | $40–78 | $2–9 | $34–51 | **about $3.9k** ($1.7–7.3k) | **$76–1,102**; about $740 | $7.4 |

**Settled on Oct 5 2026 (R29): Mindbody bills every call, so the true Mindbody line is column B plus $10** (B assumed 5,000 free calls a cycle; there are none), and the "Total after" central figures become about **$159 / $216 / $280 / $393 / $527 / $750** down the table; A and C do not apply, so the low and high ends of the "Total after" ranges are void. Mindbody is then the largest line in every row after the fixes.

The one figure to quote: at 100 × 300 the unindexed scans would have cost **about $3.1k a month (about $1.5–6k)**, against **about $1 a month** of index writes to remove them. Mindbody calls are B ÷ $0.002 + 5,000 (about 323k a month at 100 × 300, so about $645 a month). The crons' egress at 100 × 300 is about 40–75 GB a month, $5–11 past the free 10 GiB (R34 moves the crons next to Firestore if it passes $10).

### What drives the bill on this database

- **A query with no index costs the size of the collection, every time.** That is why the speed round added 39 composite indexes and a test (`src/lib/firestore-indexes.test.ts`) that fails when a new query has none. On Standard pricing a scan looked like one read a document; here it is every byte of every document, company-wide.
- **Real-time updates cost per listener.** A document written often and watched by every iPad (the studio document's sync lease, the trainer document's counters, `system/health`) is paid once per watching iPad. The speed round wrote `system/health` at most once a minute per function instance on success; scoping the trainers listener is R17, on its trigger (about 300 trainer documents).
- **A write pays for its index entries:** about 15–25 index writes a session after the speed round, about $1.1 a month at 100 × 300.
- **Render is fixed fees.** The web service is idle (Oct 5: about 100 MB of 2 GB, CPU about 0%, p90 5–22 ms), because iPads talk to Firestore directly. A bigger plan buys nothing.

### What the Sep 25 model got wrong, and what has changed since

- Its Firestore prices (Standard, multi-region) and its storage line ("Firestore bills its automatic indexes too"): Enterprise builds no automatic indexes, and its units are priced as above. A session document measured 527 bytes on average on Sep 27, not the ~10 KB assumed; `scripts/read-cost-report.ts` settles sizes.
- Drivers #1, #2 and #4 below were acted on by the cost plan (Sep 26 2026): the schedule pull runs every **30** minutes with ONE deep pull a day (`syncPolicy.ts` `DEFAULT_INTERVAL_MINUTES = 30`, `DEEP_PULL_HOURS = [0]`), the 2am function is deleted, and the Hub re-reads the week every **60** minutes (`SCHEDULE_STALE_MS`). The speed round deleted `onBookingReminderWrite` and `sendDailySummary`, wrote `system/health` at most once a minute, capped the bell's reads, and made one machines listener of two.
- The webhook's idempotency records and early-cancellation notes carry `expiresAt`; the speed round's ship steps set the TTL policies on both collections.
- Not re-checked in this correction: the Sep 25 model's per-studio read counts (drivers #3 and #5, and the "Working" tables). Treat them as the shape of the costs, not their size.

### How to check it against reality

1. **Firebase console → Firestore → Usage**, and **Query insights**: a day after the speed round's indexes are Enabled, no collection scan should be among the top shapes by read units on the session and profile path.
2. **Google Cloud → Billing**: Firestore dollars a studio a month should stay flat as studios are added (under $1).
3. **Render → Metrics**: memory p95 and p90 response, recorded in 14-day windows (Pro keeps 14 days), which is also R20's gate.
4. **Mindbody → developers.mindbodyonline.com → Reports → Invoice Detail and Activity by Studio**: calls a day and a site, at $0.002 each (R29 was answered there on Oct 5 2026).

---

## The Sep 25 2026 model (kept for its reasoning; its prices and totals are superseded above)

*Sep 26: the plan built on this model, with AJ's ranking of what has to be fresh, is `docs/rounds/2026-09-26-cost-plan.md` (arithmetic in `cost-plan-model.py`).*

*Sep 25 2026. Built from branch `lean-sync` (master, plus the unshipped packages release, plus the lean Mindbody sync). I only read code and changed nothing: no Firestore writes and no Mindbody calls. The arithmetic is in `running-costs-model.py` next to this file (`python docs/business/running-costs-model.py`).*

---

## The short answer

**Journey is cheap to run, and the lean sync did most of the work.** With the lean sync shipped and the webhook switched on, the whole bill (Mindbody, Firebase and Render) comes to about **$90–$130 a month at 5 studios, $300–$450 at 25, $550–$850 at 50 and $1,100–$1,750 at 100**. At 100 studios that is **$11–$17 per studio per month**. Mindbody is still the biggest line, and it grows steadily with each studio. Firestore reads are the second line, and the one to watch: three things in the code make it grow faster than the number of studios. First, a 2am Cloud Function reads the whole database every night for a report nobody opens. Second, every iPad in the company is sent every studio's and every trainer's bookkeeping updates. Third, every iPad re-reads the week's bookings every 15 minutes. Five fairly small fixes, listed below, bring the 100-studio bill to about **$640–$920** (roughly $6–$9 per studio). Render stays close to $52–$62 at every size. Storage stays under $25 a month through the first year, even at 100 studios. **The Atlas's pre-lean-sync figures (~$2,600 a month at 50 studios, ~$5,300 at 100) are out of date.** The new figures are about a third of those.

## The table

Monthly cost, **12 months after reaching that size**. The Firestore lines grow with history, so month 12 is later and more expensive than month 1. Each cell is **80 → 210 active clients per studio**. The model assumes the lean sync is shipped with the webhook switched on, which is the plan in `docs/rounds/2026-09-25-lean-sync.md`, and nothing else has changed.

| Studios | Mindbody | Firestore reads | Firestore writes | Storage | Render | **Total / month** |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | $25 – $42 | $14 – $35 | under $1 | under $1 | $52 | **$92 – $131** |
| 10 | $61 – $94 | $28 – $71 | $1 – $2 | $1 – $2 | $52 | **$143 – $221** |
| 25 | $167 – $202 | $77 – $185 | $2 – $6 | $2 – $5 | $52 | **$300 – $449** |
| 50 | $316 – $378 | $171 – $395 | $5 – $11 | $4 – $10 | $57 | **$552 – $852** |
| 100 | $606 – $731 | $413 – $894 | $9 – $22 | $8 – $20 | $62 | **$1,098 – $1,729** |

Not in the totals: **Cloud Functions, the Gemini chart reader and Cloud Scheduler together cost under $5 a month at every size** (see Working, §6).

**The same table with the five fixes below applied:**

| Studios | 5 | 10 | 25 | 50 | 100 |
| --- | --- | --- | --- | --- | --- |
| Total / month | $76 – $100 | $109 – $158 | $211 – $285 | $357 – $496 | **$636 – $915** |

**How far to trust each line:**

| Line | How sure |
| --- | --- |
| Render | Nearly certain. It comes from `render.yaml` and hardly moves. |
| Mindbody | About ±25% on the number of calls. **The price per call is an assumption**, so check it against the developer invoice. Under the older pricing model in the repo's own comments (1,000 free calls a day, then about a third of a cent each), the 100-studio Mindbody line would be **$917–$1,123** instead of $606–$731. |
| Firestore reads | About ±50%. The number depends on how the iPads are really used: hours on screen, and how often a profile is opened. |
| Storage | ±50%. It is cheap either way. |

---

## The five biggest cost drivers, and the cheapest fix for each

The ranking is by dollars at 100 studios × 210 clients. The order is the same at 50 × 80.

### 1. The Mindbody schedule pull: ~$690/mo at 100 studios (~$280 at 50)

Even after the lean sync, the background pull still runs every **15 minutes** at every open studio. Each run is at least one Mindbody call, which comes to about 56 calls per studio per day. That is roughly **half** of a studio's ~110–130 calls a day.

| Per studio per open day | 80 clients | 210 clients |
| --- | --- | --- |
| Near pulls (today + tomorrow, 1 page each) | 56 | 56 |
| Month pulls (4 a day, 2 or 5 pages each) + the morning's name lookups | 12 | 31 |
| Mindbody sign-in tokens (one per site per 55 minutes) | ~17 | ~17 |
| Refresh presses (assumed about 10 a day) | 15 | 20 |
| Master Sync, 5 calls a press (assumed about 1 a day) · the staff list on Team | 6 · 3 | 6 · 3 |
| **Total** (webhook on) | **~109** | **~133** |
| Extra while the webhook is still off: a month pull each time today's or tomorrow's bookings change | +6 | +25 |

Evidence:

| What | Where |
| --- | --- |
| The 15-minute default | `src/features/admin/syncPolicy.ts:42` (`DEFAULT_INTERVAL_MINUTES = 15`) |
| The four month-pull hours | `syncPolicy.ts:199` (`DEEP_PULL_HOURS = [0, 10, 14, 18]`) |
| Pull hours are an hour either side of the shift hours (default 5:30am–8pm) | `syncPolicy.ts:254`, `src/features/relay/board/now-context.ts:31-36` |
| The window sizes | `src/lib/mindbody-api-sync.ts:445-457` (`REFRESH_WINDOW_DAYS = 8`, `DEEP_WINDOW_DAYS = 30`, `NEAR_WINDOW_DAYS = 1`) |
| The proxy: pages of 500, lookups of 20 | `server.ts:597`, `:779` |
| How long a sign-in token is kept | `server/mindbody-client.ts:289` |
| Master Sync is 5 calls | `server/mindbody-client.ts:450`, `:507` |
| One staff call each time Team / Staff & Roles opens | `src/features/admin/staff/useStaffRoster.ts:72` |
| Weekly staff photos (1 call per linked trainer) | `functions/src/mindbody/staffImage.ts:217-263` |

**Cheapest fix.** Once the webhook has shown for a few weeks that it delivers cancellations in seconds, raise **Operations → Mindbody → sync interval** (`Studio.syncIntervalMinutes`, `src/features/admin/mindbody/AdminMindbodyTab.tsx:513`) from 15 to 30 minutes. This is a setting, not a code change, and it saves about **25% of the Mindbody line** (~$145/mo at 100 studios). Separately, run `scripts/probe-mindbody-location-filter.ts` once. If Mindbody honours the location filter, the shared site's month pull drops from about 8 pages to about 3.

### 2. The 2am "facility analytics" Cloud Function: up to ~$284/mo at 100 studios (~$54 at 50), and growing every month

Every night it reads **every client, every session ever and every set ever logged**, with no filter:

- `functions/src/index.ts:28-37` schedules it.
- `functions/src/index.ts:45-47` does the three reads.
- It writes `analytics/facilitySummary` (`:138`). **Nothing in `src/`, `server/` or `functions/` reads that document.**

After a year at 100 × 210 that comes to about 16 million reads a night. The cost doubles by year two, and a FileMaker import of old sessions would inflate it again.

It also loads everything into memory, so past a handful of studios it will probably **crash every night** after being billed for part of the read. `docs/business/does-this-scale.md` §4 flagged this on Sep 22, and it is still there on this branch.

**Cheapest fix.** Delete `calculateFacilityAnalyticsV2`. This is a Cloud Functions change, so it needs AJ's OK. Saves all of it.

### 3. Company-wide fan-out: ~$213/mo at 100 studios (~$38 at 50). This is the one cost that grows with the *square* of the studio count.

Three live connections on every iPad watch the **whole company**:

| Connection | Where |
| --- | --- |
| Every studio | `src/hooks/useStudios.ts:11-12` (`collection(db, "studios")`, no filter), mounted at `src/AppContent.tsx:527` |
| Every trainer | `src/hooks/useTrainers.ts:15-16`, mounted at `AppContent.tsx:526` |
| One health document | `src/contexts/MindbodyHealthContext.tsx:55-56`, mounted for everyone at `src/App.tsx:67` |

Firestore charges one read each time a watched document changes, on every iPad that is watching. These documents are written constantly, as bookkeeping:

| What writes | Where | How often |
| --- | --- | --- |
| The sync lease stamps the **studio document** | `src/features/admin/useAutoSync.ts:141`, `:191-194`, `:204` | about 2 writes per pull, ~124 per studio per day |
| The trainer rollup writes the **trainer document** | `functions/src/trainerRollups.ts:158-168` | every completed session |
| The webhook writes **`system/health`** | `functions/src/mindbody/index.ts:1279-1282` → `healthState.ts:55-124` | every event. This one is **new with the lean sync**, because it switches the webhook on |

So 100 studios × ~300 writes a day reach ~390 connected iPads: about 12 million reads a day.

**Cheapest fix.** Each of these touches Firestore structure or Cloud Functions, so each needs AJ's OK:

- Have `healthState.ts` write only when the status changes, or at most once a minute.
- Move the three sync fields (`lastScheduleSyncAt`, `scheduleSyncFailures`, `lastDeepScheduleSyncAt`) off the studio document into a small per-studio document.
- Move the trainer rollup counters off `trainers/{id}`, or scope the trainers listener to the studios the person can see.

Together these turn the squared term into an ordinary per-studio one and save about **$180–$200/mo at 100 studios**.

### 4. The Hub re-reads the week every 15 minutes, on every iPad: ~$173/mo at 100 studios (~$33 at 50)

`src/hooks/useLiveSchedule.ts:208-222` re-reads days 2–8 of the studio's bookings, a whole week of rows, every `SCHEDULE_STALE_MS` (15 minutes, `src/lib/schedule-window.ts:38`) on every iPad whose screen is on. At 210 clients that is about 460 rows × 4 an hour × 6 iPads.

With the lean sync, those days only change in Firestore at the four month pulls, by webhook, or on Refresh. So most of these re-reads fetch rows that have not changed.

**Cheapest fix.** Set `SCHEDULE_STALE_MS` to 60 minutes. That is one line, and Refresh and waking the iPad still re-read at once. It saves about 75% (~$130/mo at 100 studios). The better fix is to put the week on a live listener: the sync now writes only the rows that changed (`mindbody-api-sync.ts:1313-1329`), which was not true when the cost round removed that listener.

### 5. Each session's screens: ~$98/mo at 100 studios (~$19 at 50), and it grows with every client's history

| Screen | What it reads | Where |
| --- | --- | --- |
| Active Session | **all** of the client's sessions ever, with no limit | `src/components/WorkoutTrackerView.tsx:883-888` |
| Active Session | the sets of 30 of them | `:971-978` |
| Profile | a first page of **50** sessions (`SESSION_PAGE`), although its own comment says the first page is 15 | `src/components/ClientProfileView.tsx:135`, comment at `:918-921` |
| Profile | the sets of all 50 | `:861-879`, `:958` |

That comes to about 900 reads per session at month 12. A FileMaker history import would add a few hundred more to every Active Session.

**Cheapest fix.** Limit the tracker's sessions listener to the most recent ~30 by date, and set `SESSION_PAGE` to 15. That halves this line and stops it growing.

### Not a top-five dollar line, but it will bite: renewals go stale at scale

The nightly renewals job pulls Mindbody for at most **300 clients a night across the whole company**:

- `server/renewals-job.ts:64` (`DEFAULT_MAX_PULLS = 300`)
- `render.yaml:266` (`RENEWALS_MAX_PULLS: "300"`)

Its own rules ask for a weekly refresh of anyone within 120 days of a renewal (`src/features/renewals/job-plan.ts:18-24`, `:42-68`). Those rules want more than 300 a night from about **25 studios** (at 210 clients) or **30 studios** (at 80). At 100 studios, a client near renewal would be refreshed about every two months rather than weekly.

Raising the cap to keep up costs **+$28–$132/mo at 50 studios and +$92–$300 at 100**. The cheaper route is to lean on the webhook's contract events and shorten the "near a renewal" window, rather than polling everyone weekly.

---

## Where the Atlas's earlier estimate is now out of date

| | Atlas (before the lean sync) | This model (lean sync, webhook on) |
| --- | --- | --- |
| Mindbody calls per studio per day | ~600 (~3,000 a day at 4 studios with the shared site) | **~110–160** (about 75–80% fewer) |
| Total at 50 studios | ~$2,600/mo | **$552–$852** |
| Total at 100 studios | ~$5,300/mo | **$1,098–$1,729** |

The lean-sync round document's own Mindbody estimate ($300 at 50, $600 at 100) agrees with this model's $316–$378 and $606–$731. This model's figures are slightly higher because it also counts:

- the renewals job,
- sign-in tokens,
- Refresh presses,
- Master Sync,
- the staff list.

`docs/business/does-this-scale.md` says "1,000 free API calls a day, then about a third of a cent". That is the older pricing model. The lean-sync round document uses "$0.002 a call after ~5,000 free a month". **Neither has been checked against an invoice.**

---

## Assumptions (change these and the numbers move)

| Assumption | Value used | Where it comes from |
| --- | --- | --- |
| Active clients per studio | 80 (low) / 210 (high) | AJ |
| Sessions | 2 a week per client, 20 minutes | AJ. That is 27 (low) to 70 (high) sessions a studio a day |
| Open days | Monday–Saturday, **26 a month**. Nightly jobs run 30 nights | AJ (closed Sundays). Nothing on a Sunday pulls, because no iPad is open, but the nightly jobs do not skip Sunday |
| iPads per studio | 6 | AJ |
| Hours each iPad's screen is on | **10 a day** | Estimate. Reads scale directly with this: 8h → −15%, 12h → +15% |
| Full reconnects per iPad per day (a gap of more than 30 minutes re-reads everything it watches) | 3 | Estimate. This is Firestore's documented behaviour |
| Share of iPads connected at a given moment in open hours | 65% | Estimate |
| Trainers per studio · catalog machines · announcements | 8 · 40 · 100 | Estimate |
| Cancelled rows kept in the booking data | +10% | Estimate |
| Refresh presses · Master Sync presses | ~10 · ~1 a studio a day | Estimate |
| Clients near a renewal (weekly Mindbody refresh) | 60% of active clients. Everyone else, past clients included, monthly | Estimate. Past clients count because the nightly job ranks every client document that carries a Mindbody id |
| Client documents per studio (active + past) | about 2× active by month 12 | Estimate. 10–15 new clients a month, plus past ones |
| **Mindbody price** | **$0.002 a call after 5,000 free a month**, one developer account. Tokens are counted as calls. Webhook deliveries are assumed free | **Unverified.** Check the developer invoice |
| **Firestore prices** | Reads $0.06 / 100k, writes $0.18 / 100k, deletes $0.02 / 100k, storage $0.18 per GiB-month | Blaze, multi-region. **If the database is single-region, the Firestore lines roughly halve.** Check its location in the console. **Superseded Oct 5 2026:** the database is the Enterprise edition in us-west1 (one region), priced by read, write and real-time units; see the top of this page |
| Firestore free tier | Ignored | Google documents the free allowance as applying to one database per project. Journey's data is in the **named** database `ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa`, so assume it pays from the first read. The allowance is worth only about $2 a month anyway (50k reads + 20k writes a day + 1 GiB) |
| Render | Web `1c-2g` $25 + workspace $25 + two crons ~$2 | `render.yaml:39-52`, `:110` |

---

## Working

### 1. Mindbody calls per month

| Studios | 80 clients | 210 clients | Of which: nightly renewals (company cap 600 calls a night) |
| --- | --- | --- | --- |
| 5 | 18k | 26k | 3.4k – 8.6k |
| 10 | 35k | 52k | 6.7k – 17k |
| 25 | 88k | 106k | 17k – 19k (the cap binds at 210 clients) |
| 50 | 163k | 194k | 19.5k (capped) |
| 100 | 308k | 370k | 21k (capped) |

How the counts were built:

- **Per studio.** Take the daily figures in driver #1, multiply by 26 open days, and add weekly staff photos (8 trainers × 4.33 weeks).
- **Month-pull pages.** A 31-day window holds 2 × clients × 4.4 weeks × 1.1 bookings: 774 at 80 clients (2 pages of 500) and 2,033 at 210 (5 pages).
- **Name lookups.** Only the day's first month pull looks every client up (`syncPolicy.ts:242-251`, `useAutoSync.ts:137`), at 20 per call.
- **Near pulls.** 56 a day, which is about 15 hours of an iPad on screen at one pull every ~16 minutes. The pull is tried on a 60-second tick (`useAutoSync.ts:25`), and a shared lease (`useAutoSync.ts:122-146`) means only one iPad per studio does it.
- **Nightly renewals.** 2 calls a client (`src/features/renewals/job-plan.ts:24`, `server/mindbody-client.ts:359-398` with memberships off), plus a token per site.
- **The shared site** (Westlake, Strongsville, Willoughby on 29068). Its month pull fetches all three studios' pages (`server.ts:651-675`), which adds about 16–48 calls a day to each of those three. That is a few dollars a month.
- **The webhook makes no Mindbody calls.** There is no `fetch` in `functions/src/mindbody/index.ts`.

### 2. Firestore reads, per studio per open day (webhook on)

| Where the reads come from | 80 clients | 210 clients |
| --- | --- | --- |
| Hub re-reads days 2–8 every 15 minutes (`useLiveSchedule.ts:208-222`) | 42,000 | 111,000 |
| Screens around each session: profile, Active Session, Wrap-up (~900 each) | 24,000 | 63,000 |
| Reconnect reloads of what the studio's iPads watch: roster capped at 1,500 (`useStudioRoster.ts:104-108`), three live days (`useLiveSchedule.ts:256-267`), 24 hours of sessions (`useSessions.ts:31-37`), tasks, notes | 8,500 | 16,500 |
| Session and client changes sent to the studio's iPads, including heartbeats every 30 seconds (`WorkoutTrackerView.tsx:79`, `:2155-2163`) | 4,000 | 10,500 |
| The pull's own reads: the two-day window 56× and the month window 4× (`mindbody-api-sync.ts:782-789`) | 6,300 | 16,800 |
| Operations and My Studio (all studio-scoped and capped) | 4,100 | 6,700 |
| **Subtotal** | **~89,000** (~$1.40/studio/month) | **~225,000** (~$3.50/studio/month) |

**Company-wide on top of that** (driver #3):

- **Reloads.** 18 reloads a studio a day, each reading all N studios, all ~8N trainers, the machine catalog twice (`useMachines.ts:14` and `useMachineCatalog.ts:32`, two different queries) and the whole `hub_announcements` collection with no filter (`src/features/notifications/useHubAnnouncements.ts:73-74`).
- **Pushes.** About 0.65 × 6 × N × w per studio per day, where w is 190 writes per studio per day at 80 clients and 300 at 210.

**Scheduled jobs:**

| Job | Where | Reads |
| --- | --- | --- |
| Nightly renewals: the whole company's 122-day booking window, 91 days of sessions, every client | `server/renewals-job.ts:149-235` | ~65 × clients × studios a night |
| Nightly trainer windows: 90 days of sessions company-wide, then every trainer | `functions/src/trainerRollups.ts:298-351` | ~26 × clients × studios a night |
| Weekly machine trends: every client, and 90 days of sets | `server/machine-trends-job.ts:169-205` | ~740 × clients × studios a month |
| The 2am function | driver #2 | ~752 × clients × studios a night at month 12 |
| Webhook | `functions/src/mindbody/index.ts:61-66` | ~8 reads per event, plus a re-read of every studio at most once a minute |

**Rule checks.** Most role checks read the sign-in token claim (`firestore.rules:37-45`). There are 16 `get()`/`exists()` calls in the rules, so each write can add about one read. That is included in the roughness.

### 3. Firestore writes per session: ~55

| Part of the session | Writes |
| --- | --- |
| **Start**: the session, the placeholder set rows (one batch, `WorkoutTrackerView.tsx:1415-1490`), sometimes the client | ~8 |
| **During**: set writes, merged per set (`:75-77`, `:2008-2032`) | ~13 |
| **During**: heartbeats, at most one every 30 seconds (`:2155-2163`) | ~15–20 |
| **Finish** (`src/lib/sync-utils.ts:213-401`) | ~15.5 |
| &nbsp;&nbsp;the session | 1 |
| &nbsp;&nbsp;every set again | 6.5 |
| &nbsp;&nbsp;machine settings | 6.5 |
| &nbsp;&nbsp;client totals | 1 |
| &nbsp;&nbsp;journal note | ~0.5 |
| **The rollup function**: trainer + session flag (`trainerRollups.ts:158-169`) | 2 |

The sync writes a booking row only when something changed (`mindbody-api-sync.ts:1313-1329`). Other writes:

| Source | Writes |
| --- | --- |
| The sync lease | ~124 a studio a day |
| Webhook | ~4 an event |
| The renewal snapshot | only when it changed (`renewals-job.ts:383-395`) |

Writes stay around $10–$20 a month even at 100 studios.

### 4. Storage

There is **no Firebase Storage use** in `src/`, `server/` or `functions/`:

- staff and client photos are Mindbody web addresses,
- chart scans go to Gemini and are not kept.

Everything is Firestore documents. Firestore bills its automatic indexes too, which add about 2–4× the raw size of each document. Per session, including indexes:

| Item | Size |
| --- | --- |
| 6.5 set rows at ~5 KB | ~33 KB |
| The session | ~10 KB |
| Booking row(s) | ~4 KB |
| Journal note | ~4 KB |
| Webhook bookkeeping | ~3 KB |
| **Per session** | **≈55 KB** |

Per active client per year, that is ≈**5.5 MB**.

| Studios | End of year 1 (80 → 210 clients) | End of year 3 (80 → 210 clients) |
| --- | --- | --- |
| 5 | 2–6 GiB | about 3× year 1 |
| 25 | 11–28 GiB | about 3× year 1 |
| 100 | 43–113 GiB (**$8–$20 a month**) | 129–338 GiB (**$23–$61 a month**) |

A FileMaker import of old sessions as Journey documents would add history all at once. That importer is on hold.

The webhook's idempotency records carry `expiresAt` (30 days, `functions/src/mindbody/idempotency.ts:41-47`). They only expire once a TTL policy is set (gcloud, not the repo); the speed round's ship steps set one on `mindbodyEventLog` and `mindbodyBookingCancels` (Oct 5 2026). Either way the storage is small.

### 5. Render

The web service does not touch Firestore (`docs/business/does-this-scale.md` §1). It serves the app and proxies Mindbody.

**The web service: no tier change needed.** At 100 studios it handles about 7,000–8,000 Mindbody-proxy requests a day. The heaviest request is a shared-site month pull of about 4,000–6,500 bookings. `1c-2g` handles all of that, so the web instance stays at $25. A second instance (+$25) is worth adding around 50 studios for resilience, not for load.

**Two limits to note.** Neither is a cost:

- **The token bucket.** Every call shares one Mindbody rate limiter of 5 a second (`server/mindbody-client.ts:99-102`). That is fine unless many studios' month pulls pile up at 10:00, 14:00 and 18:00.
- **Cron memory (fixed Oct 1 2026, `oct1/job-memory`).** Both cron jobs run on 512 MB instances. Until Oct 1 both loaded the whole company into memory first, and were estimated to run out at roughly 430–1,100 active clients company-wide (the four studios had about 700). They now read **one studio at a time, only the fields they use**, and keep company-wide sums as small running totals (`docs/KNOWN-TRAPS.md`, "Jobs read per studio with select"). What they write is unchanged.
  - **Measured** on a generated company (live heap after a collection, dry runs, about 155 bookings and sets per client):

    | Job | Before | After |
    | --- | --- | --- |
    | Weekly machine trends | ~0.34 MB per active client, company-wide | ~0.02 MB per active client company-wide (the running totals), plus ~0.03 MB per client of the studio being read (its eight weeks of bookings for Openings) |
    | Nightly renewals | ~0.19 MB per client, company-wide | ~0.03 MB per client **of the studio being read**; almost nothing grows with the company |

  - **Headroom.** Node, the Firebase SDK and gRPC take about 60–90 MB of the 512, which leaves roughly 300 MB of heap to be safe with. The trends job then holds about **15,000 clients who trained in the last 90 days** (about 50 studios of 300) before it needs `1c-2g`; a past client costs it a few hundred bytes. The scale target (100 studios of 300) would want `1c-2g` for that one weekly run, about a dollar a month. The renewals job no longer grows with the company: a single studio would need several thousand clients to matter.
  - **Watch it in Render's log.** Each job now prints the heap's peak after each studio and for the run ("Solon: memory peak 41.2 MB heap used (process 120.3 MB now; the instance has 512 MB)." and "Memory: the run's peak was 63.0 MB of heap"). When the run's peak passes about 300 MB, move the job to `1c-2g` (billed by the minute; the table allows $7–$12 a month for this).
  - **Cost side effect.** The renewals job's old reads of every booking and every workout in a window had no index on the Enterprise database and scanned both whole collections every night; it now reads by client on indexes that already exist. The trends job's one 90-day read of `exerciseLogs` by `createdAt` was still that unindexed shape (streamed, so it no longer costs memory) until the speed round (Oct 5 2026, R24, AJ's OK) added `exerciseLogs (createdAt, machineId)`, which makes it a range read.
  - **Changed in the speed round (Oct 5 2026, R23):** the Cloud Function `recalcTrainerWindows` reads only completed sessions of the last 90 days on the existing `(status, createdAt DESC)` index, streamed and projected to the fields it uses, at 512 MiB and 540 s (it was 256 MiB, about 0.19 MB a client by the Sep 27 estimate). Cloud Logging says whether it succeeds and its peak memory.

### 6. The small lines

| What | Cost | Evidence |
| --- | --- | --- |
| **Gemini OCR** | ~$0 in normal running. Only the legacy chart importer uses it (`server/gemini-routes.ts:112`, `:130`; model `gemini-3-flash-preview`, `server/gemini.ts:3`), limited to 2 at once and 60 per window per person (`gemini-routes.ts:39-40`). At Flash-class prices (preview pricing unconfirmed), a chart page is about a cent, so onboarding one studio's paper charts is roughly $5–$20 once | as shown |
| **Cloud Functions** | ~$1–$2 a month at 100 studios. `onSessionRollup` runs on every write to a session (`trainerRollups.ts:212-241`), which is ~25 per session including heartbeats. That comes to ~4.5M runs a month, just past the 2M free. The webhook and the booking-reminder trigger (`functions/src/index.ts:298-332`) add a little more | as shown |
| **Cloud Scheduler** | Cents | `calculateFacilityAnalyticsV2`, `sendDailySummary`, `recalcTrainerWindows`, `syncMindbodyStaffImages` |

---

## How to check this against reality after go-live

1. **Firebase console → Firestore → Usage.** Compare reads a day against about 90k per studio at 80 clients and 225k at 210. Look for a spike at 2am (driver #2).
2. **Render → web service → Logs, search `client lookup`.** Each pull logs one line. A near pull should read `1 page(s)`.
3. **The Mindbody developer invoice.** It confirms the price per call, whether tokens are billed, and whether webhooks cost anything. That is the biggest unknown in the Mindbody line.
