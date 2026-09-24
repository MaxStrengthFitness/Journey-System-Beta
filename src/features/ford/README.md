# FORD — Family, Occupation, Recreation, Dreams

The studio's clients are not users of this app. Everything the team knows about
them as people arrives the same way it always has: someone mentions a
grandson's graduation between sets, and either it is remembered or it is gone.
FORD is the discipline of catching those lines, and this folder is where they
live.

The point is not the filing cabinet. It is the anniversary dinner somebody
actually paid for. A pillar full of beautifully organised facts that never
turns into a gesture has failed.

**Why it exists at all** (AJ, Sep 21 2026). The format's one real disadvantage:
twenty minutes, twice a week, one-on-one only. No class, no lounge, nobody
hanging around afterwards — **a studio like this has almost no natural
opportunity to build community.** So it gets built deliberately, in the few
minutes on either side of the set, and FORD is the frame for what to collect:
what is going on with their family and which dates could be acted on; what
their job actually consists of and what just changed in it; what they do for
fun, out of the house and in it; and where they are headed — what they want
from their life, what they wish they could do.

That is the test for anything built here. FORD is not a CRM and it is not
small talk filed for its own sake: it is the raw material for going above and
beyond, and a feature that does not end in someone doing something human is
not finished.

## The loop

| Where | What happens |
| --- | --- |
| Pre-session briefing | One quiet row: the soonest dated detail, or a question to ask when nothing is on file yet (`FordBriefingCue`) |
| Mid-session | **Remember this** — the second mode of the Notes sheet. One box, one button, no category required (`FordQuickCapture`) |
| Post-session | The sweep. Unfiled captures come back as cards with four big buttons (`FordSweep`) |
| Client profile → Life | The hub: what is coming up, what is unfiled, the four pillars (`FordSection`) |
| Operations → Delight queue | Every gesture the studio owes, across every client, in date order (`DelightQueue`) — with row actions since the Operations round (Sep 19): Take it, Hand it to… (the studio's people, by Auth uid), Done with what happened, Pass; a passed one-off files under "Passed — still open"; a switch shows what is done. Every write is `setGestureStatus`, the client record's own writer |

## Where the data sits, and why

One document per detail at **`clients/{clientId}/ford/{fordId}`**.

Deliberately **not** in `journalEntries`: that collection is readable by every
signed-in user in the live rules, and a client's home life is not company-wide
reading. Under the client, a detail inherits the tightest boundary the app has
— the studio the client belongs to.

Deliberately **not** an array on the client document either. That would have
been private too, but it could never answer "what is coming up across every
client at this studio", which is the entire reason for capturing any of it. A
subcollection is private *and* sweepable, through a collection group query
scoped by a denormalised `studioId`. Both properties at once is the whole
argument for this shape.

The rules live in one `match /{path=**}/ford/{fordId}` block. The recursive
wildcard is what makes the collection group read legal; it also covers direct
reads of a single client's details, so there is one rule to reason about
rather than two that can drift.

## The field that matters most is nullable

`pillar` may be `null`, and the rules deliberately do **not** validate it as
one of the four letters.

Null means *caught but not filed*. Mid-set a trainer types the sentence and
saves, and the category is chosen thirty seconds later at teardown. Requiring
a pillar at write time would put a decision between hearing the thing and
recording it, which is exactly how details get lost. Same anti-blocker rule as
the set outcomes: the app never stands between a trainer and their client.

If you are tempted to "fix" this by making the pillar required, read this
paragraph again.

## Two layers per pillar

|  | |
| --- | --- |
| **Pinned** | `isPinned: true` — a standing fact. "Wife is Karen." Reads oldest-first, like a paragraph that grew |
| **Moment** | `isPinned: false` — dated, and it expires. "Ethan graduates in May." Reads newest-first |

Same document either way, so a moment that turns out to be permanent is one
tap from becoming a standing fact and nobody retypes anything.

## The gesture

A detail with an `opportunity` is something the team intends to DO:
`idea → planned → done → declined`, with an owner and an **outcome**. The
outcome field is the one worth reading a year later — "took the dinner bill at
Giovanni's, she cried" is the institutional memory a new trainer inherits.

`idea` is the default on promotion and costs nothing: it means "worth doing
something about". `planned` means someone owns it. Ownership is a name, not an
assignment — the opposite of the task board, where work is claimed.

## Files

| File | |
| --- | --- |
| `types.ts` | The enum, the document, the date helpers. **Read this first** |
| `ford-write.ts` | Every write. All of them swallow their errors — a failed detail is a lost sentence; a hard failure mid-session is a lost client |
| `ford-rollup.ts` | Pure functions over an array: the summary, grouping, upcoming dates, the `client.events` adapter |
| `useClientFord.ts` | One client's details, and the studio-wide Delight queue. Reports `status`: `loading` · `ready` · `failed` · `denied` |
| `read-status.ts` | What a FORD read that did not come back is, and the sentence a screen shows instead of its empty state |
| `ford.tokens.css` | Colour. Pillars get identity, never status — see the note at the top of the file |
| `ford.css` | Layout for all three surfaces |
| `ford.test.ts` | The pure layer |
| `useClientFord.render.test.tsx` | The query's shape, the four read states, and every caller's wording when FORD could not be read |

## Things that will bite you

- **Every per-client FORD query names the client's studio** (client codex,
  Sep 24 2026). The read rule tests `resource.data.studioId`, and rules are
  not filters: Firestore refuses a list it cannot prove stays inside a studio
  the caller trains at, even when every document in it would pass one by
  one. `useClientFord` listed `clients/{id}/ford` with no filter from the FORD
  round (Sep 15) until then, so **every trainer below franchise owner saw an
  empty FORD** — only administrators and franchise owners saw anything, and
  AJ is an administrator, so nobody noticed. `refreshFordSummary` had the same
  fault, so only an administrator's save ever refreshed the rollup. Both now
  filter `where("studioId", "==", fordStudioIdOf(client))`, and **every
  writer stamps that same `fordStudioIdOf(client)`** (home studio, then the
  older `studioId`) — a detail stamped with any other studio would never come
  back. `tests/firestore.rules.test.ts` → "FORD — who can read her life" pins
  it.
- **No `orderBy` on that query.** Equality alone is served by the automatic
  index; `orderBy("occurredAt")` beside it needs the composite index
  `ford(studioId asc, occurredAt desc)`, and until one is deployed the query
  fails everywhere. The hook sorts on the client instead.
- **A failed read is unknown, not empty.** `status` is `failed` (the
  listener errored for a reason other than the rules, or the client names no
  studio to read by) or `denied` (a cross-train visitor: they can read the
  client document but not her FORD), and neither may be drawn as "Nothing
  here yet". The Life section, the briefing cue, the Active Session sheet and
  the post-session sweep each say "couldn't be read" or "kept by the client's
  home studio" instead (`FORD_READ_NOTICE`, `fordReadNotice`). A visitor is
  offered no capture, because the rules refuse that write too; a failed read
  still offers one — a failed READ is no reason to refuse a WRITE. A client
  with no studio gets its own sentence and no Add (`fordCanAdd`): a retry
  cannot help, and the create rule refuses a detail stamped with no studio.
- **One FORD listener per screen** (client codex, phase 6). A screen that
  already holds `useClientFord` for this client — the Notes & Profile codex
  reads FORD once for all seven pages — hands it to `FordSection` as `ford`,
  and the section's own read is disabled rather than opened a second time.
  Left out, the section reads FORD itself, as it always has.
- **Offline is not `failed`.** The app keeps a persistent cache
  (`src/firebase.ts`), so an offline iPad's read answers from what it last
  saw and comes back `ready` — empty if this iPad never opened the client's
  FORD. Don't test the "couldn't be read" notice in airplane mode; make the
  listener error instead (the render test does).
- **`fordSummary.pinned` is FORD text on the client document**, which a
  cross-train studio can read. Nothing outside this folder reads it. With the
  filter fixed, trainers' saves now refresh it too. Whether to stop writing it
  is waiting on AJ (client codex round); until he says so it is written as
  before.

- **Annual dates roll forward.** An anniversary recorded in 2019 reads "in 12
  days", never "seven years ago". `nextOccurrence()` does this; use it rather
  than the raw `eventDate` anywhere a date is shown.
- **`<input type="date">` values are parsed as LOCAL midnight** in
  `FordDetailDialog`. `new Date("2026-11-05")` is UTC and lands on the 4th for
  every studio in Ohio — which is exactly how an anniversary reminder fires a
  day late.
- **`fordSummary` on the client document is a cache.** Written best-effort
  after each save, swallowed on failure, self-healing on the next write. Never
  treat it as the truth; the subcollection is.
- **`client.events` is read, never written.** The dossier's Events section was
  deleted in the profile merge and the array is adapted at read time and
  flagged `isLegacy`. Nothing migrated, nothing deleted.
- **The Delight queue needs its collection group index.** Until
  `firebase deploy --only firestore:indexes` has run, the queue says so rather
  than rendering empty — an empty queue would read as "nobody has anything
  coming up".
- **Colour by urgency, never by pillar.** The app already teaches a trainer
  that orange is the live thing, blue is actionable and crimson is a set that
  needs work. Four more saturated colours would turn the screen into a paint
  chart. The pillars get a tinted letter mark and nothing else.
