# Trainer Profile Redesign + Kaizen Roster — Architecture Proposal

Round: **Trainer Dossier**, Sep 6 2026.
Branch (proposed): `trainer-profile-kaizen-roster` off `master`.
Replaces `src/components/TrainerProfileView.tsx` (617 lines) and expands
`src/components/EditTrainerModal.tsx` (646 lines).

**Decisions locked before writing this:**

| Decision | Answer |
| --- | --- |
| Name of the tracked-client list | **Kaizen Roster** |
| Who can see a trainer's roster | Whole studio team (owner writes, team reads) |
| The military voice | Replaced entirely |

Nothing below has been coded yet. Read §7 for the phase plan, then say go.

---

## 1. What the screenshots are actually telling us

Your three annotations circle three different bugs, and only one of them is a
design problem. Worth separating them, because the fix for each is different.

### 1.1 "Total Ops Vol: 0 Logged Sessions" is not a display bug — it is structural

`TrainerProfileView` counts sessions from the `sessions` prop. That prop comes
from `useSessions` (`src/hooks/useSessions.ts`):

```ts
const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
where("createdAt", ">=", Timestamp.fromDate(twentyFourHoursAgo)),
where("hostedAtStudioId", "==", activeStudioId)
```

The app only ever holds **the last 24 hours of sessions for one studio** in
memory. That is the correct choice for the Hub — you do not want 40,000 session
documents streaming into a tablet — but it means a career total can never be
computed from it. The same query is why **"Recently Logged" is empty**: nothing
was logged at Solon in the last 24 hours, so there is nothing to show.

Pointing this at a bigger query is the wrong fix (it would mean reading every
session document a trainer has ever coached, on every profile open, forever).
The right fix is the one you already accepted for Top Trainer: **a persisted
counter that gets incremented once, at write time**, and a one-off backfill for
history. Details in §4.1.

> **Plain version:** counting is expensive if you count from scratch every time.
> Keep a running tally instead, bump it by one whenever a session is saved, and
> read the tally. Firestore has an atomic `increment()` for exactly this, so two
> trainers finishing at the same moment can't stomp each other's count.

### 1.2 The dossier is hardcoded because nothing writes to it

`Trainer` already has `bio`, `certifications` and `employmentStartDate` in
`src/types.ts`. **No editor in the app ever writes any of them.** `EditTrainerModal`
has fields for name, nickname, initials, email, colour, role, PIN, studios,
calendar visibility and Mindbody staff id — and nothing else. So every trainer in
the system falls to the same three placeholders:

- "No tactical biography provided…"
- "Level 1 Practitioner"
- "Baseline Personnel"

The data model is fine. The editor is missing. §3.2.

### 1.3 The voice

"Tactical Command Center", "Combat Grade Certifications", "Total Ops Vol",
"Station Access (Permanent)", "Guest Credentials (Temporary)", "No Active Guest
Ops". Nothing else in the app talks like this — the Equipment tab, Journey Grid,
Journal and Client Dossier are all plain, dense and calm. Full replacement map in §2.2.

### 1.4 Two things I found that you did not ask about, but that block this work

**(a) A `staff.updated` webhook would corrupt client data today.**
In `functions/src/mindbody/index.ts`:

```ts
const isBookingEvent = !isCommercialEvent && (lowerType.includes("booking") || lowerType.includes("appointment"));
const isClientEvent  = !isBookingEvent && !isCommercialEvent;   // ← catch-all
```

`isClientEvent` is a catch-all, not a test. A `staff.updated` event contains no
`clientId`, matches neither booking nor commercial, and therefore falls into the
**client profile upsert branch**. Subscribing to staff events before fixing this
would start writing staff data into the `clients` collection. This is fixed in
Phase 2 *before* the subscription is touched. It also hardens the handler against
every future Mindbody event type we haven't thought about.

**(b) The staff photo is already being fetched and thrown away.**
`server.ts` line ~486 already calls `GET /public/v6/staff/staff?Limit=200` and
normalises `imageUrl: s.ImageUrl || null` for every staff member — then
`EditTrainerModal` uses only `id` and `fullName`. One existing API call already
returns the whole studio's photos. See §4.3 for why that changes the plan you sketched.

---

## 2. Naming and vocabulary

### 2.1 Kaizen Roster — and a collision to handle deliberately

You chose **Kaizen Roster**, which fits: the roster is the clients you have
decided are worth deliberate, ongoing attention — *there is always room for
improvement*, applied to your coaching rather than to a set.

The risk I flagged is real and needs a rule, not a hope. As of the Active Session
round, **a red kaizen mark on a cell means "that rep needs improvement."** If the
Kaizen Roster is drawn in the same red kaizen mark, a trainer glancing at a client
card cannot tell "I'm tracking this person" from "this person is doing it wrong."

**The rule, enforced in `trainer-profile.tokens.css`:**

- The **red kaizen mark (`--jg-quality-poor` crimson) is reserved to rep quality.** It never appears on the roster.
- The Kaizen Roster uses **the kaizen wordmark in brand slate `#5B6770` / blue `#0A548B`**, never crimson, never orange.
- Roster membership on a client card is a **small slate kaizen glyph**, visually a sibling of the note indicator, not of a quality mark.
- The two never render within the same component.

Documented in the feature README so a future round doesn't quietly undo it.

### 2.2 Copy replacement map

| Current (military) | New | Why |
| --- | --- | --- |
| Tactical Command Center | *(removed — the name is the header)* | The eyebrow said nothing |
| Professional Dossier | **Profile** | It is a profile |
| Intelligence Summary | **About** | |
| Combat Grade Certifications | **Certifications** | |
| Level 1 Practitioner *(fallback)* | *(empty state: "No certifications recorded — add them in Edit Profile")* | A fallback should not read as data |
| Service Timeline | **Tenure** | |
| Duty Start Date | **Started** | |
| Baseline Personnel *(fallback)* | *(em-dash)* | Same reason |
| Total Ops Vol | **Sessions Coached** | And it will finally be a real number |
| Network Access | **Studio Access** | |
| Verified Multi-Location Footprint | *(removed)* | |
| Primary Home Base | **Home Studio** | |
| Station Access (Permanent) | **Also Works At** | |
| Single Base Clearance | **Home studio only** | |
| Guest Credentials (Temporary) | **Cross-Train Access** | Matches the term the approval flow already uses |
| No Active Guest Ops | **None active** | |
| Daily Roster | **Today's Schedule** | Frees "roster" for the Kaizen Roster |
| Recently Logged / Historical Sessions | **Recently Coached** | |
| No recent activity recorded. | **No sessions coached in the last 30 days.** | Says what was actually checked |

---

## 3. React components

### 3.1 New feature folder

Follows the convention every redesign round since Journal has used
(`src/features/<name>/` with its own tokens, README and tests):

```
src/features/trainer-profile/
  TrainerProfileView.tsx      shell + layout; replaces src/components/TrainerProfileView.tsx
  IdentityBar.tsx             avatar · name · role chips · home studio · Edit / Calendar
  AboutPanel.tsx              bio · certifications · tenure  (Area 1 of IMG_0668)
  CoachingLoad.tsx            Sessions Coached (all / 90d / 30d) · clients coached · avg per week
  StudioAccessPanel.tsx       home · also-works-at · cross-train  (Area 2 of IMG_0668)
  TodaySchedule.tsx           upcoming appointments; replaces "Daily Roster"
  RecentlyCoached.tsx         last 30 days, real data  (the red arrow in IMG_0670)
  KaizenRoster.tsx            the tracked list — the new headline section
  KaizenRosterRow.tsx         one client: avatar, name, reason chip, last/next session, note
  AddToRosterDialog.tsx       client search → reason → optional note
  TrainerAvatarImage.tsx      Mindbody photo with initials fallback  (shared, see 3.3)
  useTrainerStats.ts          reads trainer.rollups; falls back to a scoped query while backfilling
  useKaizenRoster.ts          add / remove / edit reason / reorder
  adapters.ts                 Firestore doc → view model
  types.ts
  trainer-profile.tokens.css  light + dark, WCAG AA, contrast noted per value
  trainer-profile.css
  index.ts
  README.md
  roster.test.ts              add/remove/dedupe/cap
  stats.test.ts               rollup maths + backfill parity
```

`src/components/TrainerProfileView.tsx` is **deleted**, matching how
`TrainerControlHubView.tsx` was handled last round.

### 3.2 Existing components modified

| File | Change |
| --- | --- |
| `src/components/EditTrainerModal.tsx` | **Bio** textarea (600 char cap), **Certifications** tag editor (add/remove chips), **Start date** picker, **avatar preview** beside the staff picker, **Refresh photo** button. Restructured into three sections — Identity / Mindbody / Access & Role — because it is currently one long scroll. |
| `src/components/CreateTrainerModal.tsx` | Same Mindbody staff picker, now showing each candidate's photo, so linking is visual instead of an ID guess. |
| `src/features/calendar/TrainerAvatar.tsx` | Accepts an optional `photoUrl`; renders the image when present, falls back to the existing tone-coloured initials on absent/broken/slow. The tone hash stays — colour identity must not change just because someone uploaded a headshot. |
| `src/features/calendar/types.ts` | `TrainerRef` gains `photoUrl?: string | null`. |
| `src/features/client-profile/ProfileHeader.tsx` | Kaizen Roster toggle on the client — add/remove without leaving the client. |
| `src/components/ClientDirectoryView.tsx`, `ClientsView.tsx` | Slate kaizen glyph on clients that are on *your* roster, plus an "On my Kaizen Roster" filter. |
| `src/AppContent.tsx` | Lazy-import path swap; `TrainerProfileView` no longer receives the 24-hour `sessions` array for its totals (it still gets it for "is there a session in flight"). |
| `src/hooks/useTrainers.ts` | **Unchanged** — the roster and rollups ride along on the trainer doc that is already streamed app-wide, so badges cost zero extra reads. |
| `src/types.ts` | §5. |
| `server.ts` | §4.3. |
| `register-webhook.js` | `staff.created`, `staff.updated`, `staff.deactivated` added to `eventIds`. |
| `firestore.rules`, `firestore.indexes.json` | §6. |

### 3.3 Layout (iPad Pro landscape, the primary case)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [photo]  AUSTIN JURGENS  "AJ"            ▸ Edit Profile  ▸ Studio Cal.   │
│          Franchise Owner · Admin · Solon · Mindbody synced ●             │
├────────────────────────────────┬─────────────────────────────────────────┤
│ ABOUT                          │ COACHING LOAD                           │
│  bio…                          │   1,284  Sessions Coached               │
│  CERTIFICATIONS                │      63  last 30 days                   │
│  [chip] [chip] [chip]          │      41  clients coached                │
│  TENURE  Started Mar 2019      │    14.2  avg / week                     │
├────────────────────────────────┴─────────────────────────────────────────┤
│ KAIZEN ROSTER · 12 tracked                        [+ Add to Roster]      │
│ ┌────────────────────────────────────────────────────────────────────┐   │
│ │ ◈ JUDY DAUS      Progression   #46 · last Sep 2 · next Sep 8  ›     │   │
│ │ ◈ CRAIG KOLAR    Return        #12 · last Aug 19 · none booked ›    │   │
│ │ ◈ MARY ELLIS     Form          #31 · last Sep 4 · next Sep 9  ›     │   │
│ └────────────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────┬───────────────────────────────────────┤
│ TODAY'S SCHEDULE · 6             │ STUDIO ACCESS                         │
│  10:00 Barbara …    #0   0 left  │  HOME  Strongsville, Ohio             │
│  10:30 Shelly Pe…   #0   0 left  │  ALSO  Solon · Mentor                 │
│  …                               │  CROSS-TRAIN  None active             │
├──────────────────────────────────┴───────────────────────────────────────┤
│ RECENTLY COACHED · last 30 days                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Portrait stacks in the same order. Kaizen Roster sits **above** Today's Schedule
deliberately: the schedule answers "what's next", the roster answers "who am I
actually working on", and the second question is the one a profile page exists for.

### 3.4 Kaizen Roster behaviour

- **Add** from the profile (client search) or from a client's own header (one tap).
- Each entry carries a **reason chip** — Progression · Form · Return · Retention · Milestone · Other — so the list is scannable rather than a bag of names.
- Optional **note** and optional **review-by date**; entries past their review date sort to the top with a slate "due" marker.
- **Cap of 40** entries, enforced in `useKaizenRoster`. A roster of 200 is a client list, not a roster, and it would bloat a document that streams to every device.
- **Remove** is immediate, no confirm — it is a bookmark, not a record.
- Reads are open to the whole studio team; **writes are owner-only** (plus Admin), enforced in rules, not just in the UI.
- Adding a client **never notifies anyone** — honours the Sep 4 no-outreach freeze.

---

## 4. Firebase Cloud Functions

### 4.1 Sessions Coached — the rollup (fixes the "0" in IMG_0668 and the red arrow in IMG_0670)

**New file `functions/src/trainerRollups.ts`**, exported from `functions/src/index.ts`:

```
export const onSessionRollup = onDocumentWritten({
  document: "sessions/{sessionId}",
  region: "us-central1",
  database: "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa",
}, handler)
```

Behaviour:

1. Fires only on the transition **into** `status === "Completed"` (before ≠ after).
2. Resolves the coaching trainer: `trainerId` → `startedByTrainerId` → `trainerInitials` match, the same precedence `TrainerProfileView` uses today.
3. In one transaction: sets `rollupCounted: true` on the session **and** applies `FieldValue.increment(1)` to `trainers/{id}.rollups.sessionsCoached`, plus `lastSessionAt`, and `firstSessionAt` if unset. If `rollupCounted` is already true it exits — a re-write can never double-count.
4. `sessionsCoached30d` is **not** incremented here (a rolling window can't be a counter). It is recomputed nightly by `recalcTrainerWindows` (`onSchedule`, 03:00 America/New_York), which also refreshes `clientsCoached` from `trainerTally` data. One scheduled read per night, not one per profile open.

**New callable `backfillTrainerRollups`** (Admin/Founder only, `functions/src/trainerRollups.ts`): pages `sessions` in batches of 500, tallies per trainer in memory, writes each trainer's counters once, and stamps `rollupVersion`. Same shape as the `useTopTrainer` backfill you already approved — run once from Admin > System Backend > System Tools, then never again. Also covers the legacy FileMaker CSV import path.

`useTrainerStats` shows the persisted number when `rollupVersion` is set; while it is absent it shows the 30-day figure with a quiet "backfilling" note rather than a wrong lifetime total.

### 4.2 `staff.*` webhook handling

**Edited `functions/src/mindbody/index.ts`** — event routing hardened first:

```ts
const isStaffEvent      = lowerType.startsWith("staff.");
const isCommercialEvent = lowerType.includes("clientmembershipassignment") || lowerType.includes("clientcontract");
const isBookingEvent    = !isCommercialEvent && !isStaffEvent && (lowerType.includes("booking") || lowerType.includes("appointment"));
const isClientEvent     = !isCommercialEvent && !isStaffEvent && !isBookingEvent && lowerType.startsWith("client");
// anything else: recordLimboEvent({ kind: "unhandled" }) and return 200 — never a client upsert
```

**New `functions/src/mindbody/staffResolver.ts`**

```ts
export type StaffResolution =
  | { kind: "matched"; ref: DocumentReference }
  | { kind: "unlinked" }        // no trainer carries this mindbodyStaffId
  | { kind: "ambiguous" };      // two or more do — a data error, never guessed at

export async function resolveTrainerByStaffId(
  firestore: Firestore,
  staffId: string | number,
  siteId?: string | number,
): Promise<StaffResolution>
```

Queries `trainers where mindbodyStaffId == String(staffId)` with `limit(3)`.

> **The one rule that matters here:** a `staff.*` webhook **never creates a trainer
> document.** A trainer doc is an RBAC principal — it carries `role`, `pinHash`
> and studio access. Letting an external system mint one is exactly the class of
> privilege-escalation the rules audit already caught once. An unmatched
> `staff.created` goes to `mindbodyLimbo` with `kind: "staff"` and surfaces in
> Admin > Limbo Queue for a human to link. Clients are different — a client doc
> grants nothing, so `ensureCanonicalClient` may create one.

`LimboKind` in `clientResolver.ts` widens to `"booking" | "client" | "commercial" | "staff" | "unhandled"`.

**New `functions/src/mindbody/staffProfile.ts`** — a pure mapper, no I/O, easy to test:

```ts
export function mapStaffEventToPatch(
  payload: Record<string, unknown>,
  eventType: string,
): Record<string, unknown>   // only `mindbody.*` keys, never a top-level trainer field
```

**Field ownership — the important architectural call.** A trainer document holds
two kinds of fact:

| Journey-owned (never touched by sync) | Mindbody-owned (sync writes freely) |
| --- | --- |
| `role`, `pinHash`, `requiresPinReset` | name, email, photo, active flag |
| `brandColor`, `initials`, `nickname` | Mindbody home location |
| `primaryHomeStudioId`, `accessibleStudioIds`, `activeGuestStudioIds` | |
| `bio`, `certifications`, `kaizenRoster`, `rollups` | |

The sync writes **only into a nested `mindbody` map**, never to top-level fields.
The UI then decides what to display: Mindbody's name and photo win unless a local
override exists, and synced values render with the same "from Mindbody" treatment
the Client Dossier round established. This means a `staff.updated` event can never
silently change someone's role, studio access, or colour — and a rogue or
mis-mapped event is contained to one map you can inspect.

Existing standards are honoured unchanged: `verifyMindbodySignature` first,
`tryRecordEvent` gate, `recordHealthEvent({ type: "webhook_success", hydrationLatencyMs })`
on the way out, `recordAttemptFailure` → `recordDeadLetter` on exhaustion.

**Tests** (matching the existing `*.test.ts` convention): `staffResolver.test.ts`,
`staffProfile.test.ts`, plus new cases in `index.test.ts` covering — staff event
does **not** hit the client path; unlinked staff lands in limbo; ambiguous staff
lands in limbo; unknown event type returns 200 without writing.

### 4.3 The staff photo — where the fetch actually belongs

You sketched `GET /public/v6/staff/{staffId}/imageurl` inside Cloud Functions.
I'd push back on part of that, for two reasons:

1. **Every other outbound Mindbody call already lives in `server.ts`** on Render
   — `/api/mindbody/staff`, `/locations`, `/staff-appointments`,
   `/client-demographics`, `/client-commercial`, plus `getMindbodyToken`. Adding
   a second outbound integration point in Cloud Functions means two copies of the
   key handling, the token cache, and the error normalising.
2. **`/api/mindbody/staff` already returns every staff member's `ImageUrl`** in
   one call and discards it. The per-staff endpoint is one HTTP round trip per
   trainer; the bulk call you already make covers the whole studio.

Proposed split — bulk where it's free, per-staff only where it isn't:

| Path | Where | When |
| --- | --- | --- |
| **Bulk** — keep `imageUrl` from the existing `GET /staff/staff?Limit=200` | `server.ts` *(one-line change)* | Every time the Edit/Create modal opens its staff picker. Photos appear with **zero new API calls.** |
| **Single refresh** — new `POST /api/mindbody/staff-image` → `GET /public/v6/staff/{staffId}/imageurl` | `server.ts` *(new route)* | The "Refresh photo" button in Edit Trainer. |
| **Server-side refresh** — `fetchStaffImageUrl()` | `functions/src/mindbody/staffImage.ts` *(new)* | After a `staff.updated` webhook, and from the weekly refresher. Cloud Functions **does** need its own small fetcher here, because a webhook has no browser to route through. |

**New `functions/src/mindbody/staffImage.ts`**

```ts
export async function fetchStaffImageUrl(
  apiKey: string, siteId: string, staffId: string,
): Promise<string | null>

export async function refreshStaffImage(
  firestore: Firestore, trainerRef: DocumentReference,
  opts: { apiKey: string; siteId: string; staffId: string; maxAgeMs?: number },
): Promise<{ refreshed: boolean; url: string | null }>
```

Write-through cache on the trainer doc: `mindbody.imageUrl` +
`mindbody.imageFetchedAt`. `refreshStaffImage` no-ops when the cached value is
younger than `maxAgeMs` (default 7 days), so a burst of `staff.updated` events
cannot turn into a burst of API calls — which matters, because Mindbody's Public
API is metered and the Webhooks API is not.

**New `syncMindbodyStaffImages`** — `onSchedule("0 4 * * 0", America/New_York),`
weekly: walks trainers with a `mindbodyStaffId` and refreshes any photo older
than 7 days. Catches photos changed in Mindbody without an event, and re-signs
any CDN URL that has rotated.

**New callable `refreshMindbodyStaffImage`** (authenticated; self or leadership)
so the Edit modal's button works from a device that can't reach `server.ts`.

### 4.4 Function inventory after this round

```
functions/src/index.ts
  + export { onSessionRollup, recalcTrainerWindows, backfillTrainerRollups } from "./trainerRollups"
  + export { syncMindbodyStaffImages, refreshMindbodyStaffImage } from "./mindbody/staffImage"

functions/src/trainerRollups.ts        NEW   onDocumentWritten + onSchedule + onCall
functions/src/mindbody/staffResolver.ts NEW  + staffResolver.test.ts
functions/src/mindbody/staffProfile.ts  NEW  + staffProfile.test.ts
functions/src/mindbody/staffImage.ts    NEW  + staffImage.test.ts
functions/src/mindbody/index.ts         EDIT event routing + staff branch
functions/src/mindbody/clientResolver.ts EDIT LimboKind widened
```

---

## 5. TypeScript interfaces

`src/types.ts` (mirrored, admin-SDK-flavoured, in `functions/src/mindbody/staffProfile.ts`):

```ts
/** Facts Mindbody owns about a staff member. Written only by the sync — never edited in-app. */
export interface MindbodyStaffSnapshot {
  staffId: string;
  siteId?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  imageUrl?: string | null;
  imageFetchedAt?: any;          // Timestamp
  isActive?: boolean;
  homeLocationId?: string;
  locationIds?: string[];
  lastSyncAt?: any;              // Timestamp
  lastEventType?: string;        // "staff.updated" — for the Integrations Hub
}

export type KaizenReason =
  | "Progression"   // pushing a specific adaptation
  | "Form"          // 4 P's work in flight
  | "Return"        // coming back from a layoff
  | "Retention"     // at risk, needs attention
  | "Milestone"     // approaching something worth marking
  | "Other";

export interface KaizenRosterEntry {
  clientId: string;
  /** Denormalised so a roster row renders before the client list resolves. */
  clientName: string;
  reason: KaizenReason;
  note?: string;                 // 240 chars
  addedAt: any;                  // Timestamp
  addedByTrainerId: string;
  /** Optional check-back date; drives the "due" sort and the slate due marker. */
  reviewBy?: any;                // Timestamp
}

/** Persisted counters. Never computed on read. */
export interface TrainerRollups {
  sessionsCoached?: number;      // lifetime, incremented at write time
  sessionsCoached30d?: number;   // rolling window, recomputed nightly
  clientsCoached?: number;       // distinct clients, recomputed nightly
  firstSessionAt?: any;
  lastSessionAt?: any;
  rollupVersion?: number;        // set by the backfill; absent = not yet backfilled
  rollupUpdatedAt?: any;
}

export interface Trainer {
  // …everything currently there is unchanged…

  /** Local photo override. Beats mindbody.imageUrl when set. */
  photoUrl?: string | null;
  /** Everything the Mindbody sync owns. Nothing outside the sync writes here. */
  mindbody?: MindbodyStaffSnapshot;
  /** Max 40. Owner writes, whole studio team reads. */
  kaizenRoster?: KaizenRosterEntry[];
  rollups?: TrainerRollups;
}
```

**Why an array on the trainer doc rather than a subcollection.** `useTrainers`
already streams every trainer document to every device. Putting the roster on
that document means roster badges work everywhere — client list, client header,
calendar — for **zero extra reads**. A 40-entry cap keeps the document ~8 KB
against a 1 MB limit. Adds and removes use `arrayUnion`/`arrayRemove`, which are
atomic, so two devices can't clobber each other. A subcollection would be the
right call at 500 entries; at 40 it is a second listener for nothing.

`UpdateTrainerPayload` (`src/types.ts` line ~206) gains the fields the modal will
now actually write — it already carries `bio`, `certifications` and
`mindbodyStaffId`, so this is only:

```ts
export interface UpdateTrainerPayload {
  // …existing…
  employmentStartDate?: any;     // the Start date picker had nowhere to land
  photoUrl?: string | null;
}
```

`CreateTrainerPayload` is left alone: rollups, roster and the Mindbody snapshot
are all things that arrive *after* a trainer exists, and its comment ("crucially
excludes any ID field to avoid creation of orphan references") is doing real work.

Calendar (`src/features/calendar/types.ts`):

```ts
export interface TrainerRef {
  // …existing…
  photoUrl?: string | null;      // Mindbody photo; initials fallback stays the default
}
```

---

## 6. Firestore rules and indexes

**Rules** (`firestore.rules`, `match /trainers/{trainerId}`):

- Read stays `isAuthenticated()` — that is what makes team-visible rosters work with no new plumbing.
- Update gains a guard: `kaizenRoster` is writable **only** by `request.auth.uid == trainerId` or a super-admin. Leadership can edit a trainer's role and access, but not curate their roster.
- `rollups` and `mindbody` become **server-write-only** — client updates that touch either key are rejected. Both are derived data; a tablet has no business setting a session count.

**Indexes** (`firestore.indexes.json`): the staff lookup is
`where("mindbodyStaffId", "==", x)` — a **single-field** query, which Firestore
indexes automatically. **No composite index is needed**, and I'm deliberately
resolving site ambiguity in memory (limit 3, then filter) rather than adding a
composite just to save two document reads.

One data hygiene note: this lookup only works if `mindbodyStaffId` is stored as a
**string** everywhere. Phase 2 includes a one-line normaliser (`String(id).trim()`)
in both trainer modals, plus a migration pass in the backfill callable for any
doc that currently stores it as a number.

---

## 7. Phase plan — one branch, one commit per phase

Branch `trainer-profile-kaizen-roster` off `master`, per your standing preference,
so any phase can be reverted on its own.

| # | Commit | Contents |
| --- | --- | --- |
| 1 | Types, rules, rollup functions | `src/types.ts`, calendar `TrainerRef`, `firestore.rules`, `functions/src/trainerRollups.ts` (+ tests), backfill callable wired into Admin > System Tools |
| 2 | Mindbody staff sync | Event-routing fix, `staffResolver.ts`, `staffProfile.ts`, `LimboKind` widening, tests, `register-webhook.js` eventIds, `mindbodyStaffId` string normalisation |
| 3 | Staff photos | `server.ts` bulk passthrough + `/api/mindbody/staff-image`, `functions/src/mindbody/staffImage.ts`, weekly refresher, callable, `TrainerAvatar` photo support |
| 4 | Profile shell + voice | `src/features/trainer-profile/` scaffold, tokens (light + dark, AA-checked), `IdentityBar`, `AboutPanel`, `StudioAccessPanel`; old view deleted; full copy replacement |
| 5 | Real numbers | `CoachingLoad`, `useTrainerStats`, `TodaySchedule`, `RecentlyCoached` |
| 6 | Kaizen Roster | `useKaizenRoster`, `KaizenRoster`, `KaizenRosterRow`, `AddToRosterDialog`, client-header toggle, client-list glyph + filter, `roster.test.ts` |
| 7 | Edit Trainer modal | Bio, certifications, start date, avatar preview + refresh, three-section restructure; same picker in Create Trainer |
| 8 | Docs + green build | Feature README (including the kaizen-colour rule), `npm run typecheck`, vitest, contrast test |

**Deployment order matters in Phase 2/3.** The Cloud Function fix ships *before*
`register-webhook.js` is run against the live subscription — that script PATCHes a
production subscription and real staff events start arriving the moment it
succeeds. I will not run it; that stays your call, with your credentials.

---

## 8. Risks and things I want on the record

1. **`functions/src/mindbody/issueUserToken.ts` has hardcoded sandbox credentials** — site `-99`, `mindbodysandboxsite@gmail.com`, password in plain text — in a **deployed** Cloud Function. Not in scope for this round, but it should not stay in the repo. Say the word and I'll fold a fix into Phase 2.
2. **Adding `staff.*` to the live subscription is irreversible in practice** — you can remove the event ids again, but events that arrive in between will have been processed. Phase 2's tests are the gate.
3. **The backfill reads every session document once.** For ~40k sessions that is one-off and cheap, but it must be run deliberately from System Tools, not on app load.
4. **`functions/node_modules/once` is still missing `once.js`** in this checkout, so the mindbody vitest suite can't start locally. I'll reinstall functions deps at the start of Phase 2 or the new tests can't be proven.
5. **Mindbody staff photos may be absent** for most of your staff. The initials fallback stays first-class rather than being treated as a degraded state.
6. **Studio access display depends on `Studio.name`,** and `Studio` (line 1176) makes `id` optional (`id?: string`). `StudioAccessPanel` looks studios up *by* id, so any studio doc that reaches the client without one renders as a raw id. I'll fall back to the id in a muted style rather than showing a blank chip.
7. **Two Mindbody location ids, two shapes.** `Studio.mindbodySiteId` is a string, `Studio.mindbodyLocationId` is `string | number`. `staffResolver` and `staffProfile` will coerce both with `String(x).trim()` before comparing, the same way `resolveStudio` already does in the webhook.

---

## 9. What I need from you

Approve, or redirect on any of: the field-ownership split (§4.2), the photo-fetch
split between `server.ts` and Cloud Functions (§4.3), the roster-as-array
decision (§5), and the phase order (§7). Then I build all eight phases in one
pass on the branch and hand it back for the iPad review.
