# What Journey will cost to run: a model built from the code

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
| **Firestore prices** | Reads $0.06 / 100k, writes $0.18 / 100k, deletes $0.02 / 100k, storage $0.18 per GiB-month | Blaze, multi-region. **If the database is single-region, the Firestore lines roughly halve.** Check its location in the console |
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
| Screens around each session: profile, Active Session, post-session (~900 each) | 24,000 | 63,000 |
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

The webhook's idempotency records carry `expiresAt` (30 days, `functions/src/mindbody/idempotency.ts:41-47`). They only expire if a TTL policy is set in the Firebase console, and none is visible in the repo. Worth a check; either way the storage is small.

### 5. Render

The web service does not touch Firestore (`docs/business/does-this-scale.md` §1). It serves the app and proxies Mindbody.

**The web service: no tier change needed.** At 100 studios it handles about 7,000–8,000 Mindbody-proxy requests a day. The heaviest request is a shared-site month pull of about 4,000–6,500 bookings. `1c-2g` handles all of that, so the web instance stays at $25. A second instance (+$25) is worth adding around 50 studios for resilience, not for load.

**Two limits to note.** Neither is a cost:

- **The token bucket.** Every call shares one Mindbody rate limiter of 5 a second (`server/mindbody-client.ts:99-102`). That is fine unless many studios' month pulls pile up at 10:00, 14:00 and 18:00.
- **Cron memory.** Both cron jobs load company-wide windows into memory on 512 MB instances:
  - renewals: `server/renewals-job.ts:171-194`
  - machine trends: `server/machine-trends-job.ts:201-205`
  - **When they outgrow 512 MB**: trends at roughly 10–20 studios, renewals at 20–40.
  - **The fix**: move them to `1c-2g` and later `2c-4g`, billed by the minute (the table allows $7–$12 a month for this).
  - **Trends must be rebuilt by ~50 studios.** Machine trends needs to be rewritten to work one studio at a time before about 50 studios, because 90 days of every set would not fit even in 4 GB.

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
