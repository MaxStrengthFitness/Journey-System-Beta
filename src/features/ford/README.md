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
| Client profile → Notes & Profile → FORD | The page: what is coming up (the Mindbody birthday included), what is unfiled, the four pillars with their bands, and going above and beyond (`page/FordPage`) — see "The FORD page" below |
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

## The FORD page (client codex, Sep 2026)

Notes & Profile became seven pages, and FORD is the third: `page/FordPage.tsx`,
mounted by the codex's adapter (`client-codex/pages/FordPage.tsx`). It
replaced the Life section's hub (`FordSection`, deleted) and the work and
activity baselines that sat above it. Top to bottom, as the approved mockup
has it:

- **In one line** (`one-line.ts`, `page/OneLinePanel.tsx`; phase 11, AJ's
  decision 3a). The sentence a new trainer should read first — "Retired
  hygienist, pickleball regular, walking the Camino with Tom in May." —
  written by the team: anyone at her home studio may rewrite it, it saves the
  moment Save is tapped, and the line under it says "Written by the team ·
  last by Jess Moreno, Mar 15". Last writer wins; earlier versions are not
  kept. Up to 120 characters, one line. It also heads the Overview's FORD
  door. See "The one-line document" below for where it lives.
- **Coming up** (`coming-up.ts`). The birthday Mindbody holds leads, rolled
  forward on the studio's day through the same `daysUntilBirthday` Relay's
  Mine uses, beside the dated FORD details. An annual FORD "Birthday" on the
  same day folds into the birthday's row (its gesture rides on it); a legacy
  `client.events` birthday is dropped the same way but not linked. A birthday
  nobody planned for opens a new annual Family detail with the gesture open.
  The when is coloured by urgency (`urgencyOf`), never by pillar.
- **To file.** Captures with no pillar; four buttons that carry the letter AND
  the word (40px, no tooltip-only buttons), one tap files (`tagFordEntry`).
- **Four pillar cards** (`page/PillarCard.tsx`), each built the same way:
  the band (below), every standing fact, FORD's moments merged with the
  **older life notes** filed under that pillar (three, then Show all), the
  **Pulse lines**, a gap line, and **Ask next**.
  - Bands (`page/bands.tsx`): Family is the emergency contact and the
    birthday from the record; **Occupation is the Work block and Recreation
    is Active outside the studio**, each with Edit / Done — record fields
    (`occupation`, `workProfile`, `isRetired`, `activityLevel`,
    `recreationActivities`) written through the codex's ONE form and saved by
    its ONE Save bar, so Done never saves and the band says "Not saved yet"
    until Save. Dreams quotes the why from Goals & Focus, with a door there.
  - Older life notes are the journal's `life` notes from before FORD, placed
    by Notes' ONE selector (`olderLifeNotesByPillar` over
    `notesOnRecord().lifeSettled`): Birthday and Anniversary under Family,
    Vacation under Recreation, the rest under "Older life notes". A settled
    one (standing or resolved) leaves Notes for this page; a live one stays on
    Notes. They are journal notes, so a cross-train reader who cannot read
    FORD still sees them here.
  - Pulse lines (`pulse-links.ts`) quote the Pulse beside the pillar it is
    about — the stress worries "Caring for someone" and "A family member's
    health" under Family, "Work / career" and "Retirement transition" under
    Occupation, "I stay physically active outside of workouts." under
    Recreation — in the Dial's own words, from the two newest rounds that said
    anything about it. Read only, and the page says nothing is copied: FORD
    text must never travel into `progressReports`, which every signed-in user
    can read.
  - Ask next (`ask-next.ts`) is the newest open **Follow up next time** on
    the pillar's details (below); otherwise one of FORD_META's prompts,
    rotated by day and **aware of retirement** (`FORD_PROMPT_WHEN`): a
    retired client is never asked "How is work treating you?", a working one
    never how retirement is going. The briefing cue passes the same context.
  - **Where the words came from** (phase 17). A detail added from the
    client's Mindbody account notes by the Account page's intake card
    (`client-admin/IntakeNotesCard.tsx`, AJ's decision 4) carries `origin:
    "mindbody_intake"`, and the pillar says so beside it — "Pickleball
    2x/wk, gardening. · from the Mindbody account notes, added by AJ"
    (`provenanceOf`, page-model.ts) — so her sign-up words never read as
    something a trainer heard. Every other detail is its words alone, as
    before. The rules do not read `origin`, so the new value needed no rules
    change; `ORIGIN_WORDS` names it too.
- **Going above and beyond** (`page/AboveAndBeyond.tsx`): the gestures,
  Idea → Planned → Done, with "I'll do it" and "Mark done" through
  `setGestureStatus` — the Delight queue's own writer. Owners' names in full.

`page-model.ts` is the pure half: the pillar list, the older-note meta, the
gestures, `fordOverview` (for the Overview's FORD slot, in its own phase —
it carries the one line too) and `fordSubnavLine` (the sub-toggle's
"birthday in 17 days").

**The one-line document** (phase 11). In one line is a FORD document with the
FIXED id `one-line` — `clients/{clientId}/ford/one-line` — not a field on the
client document (a cross-train studio can read that, and FORD they cannot),
and not a collection of its own (a rules change, a deploy and one more
listener, for nothing). It is stamped with `fordStudioIdOf(client)` like
every detail, so the ONE filtered FORD listener delivers it, and
`useClientFord` takes it out of the list first (`splitOneLine`) and hands it
out as `oneLine`: it is never in `entries`, `buckets`, `untagged` or
`upcoming`. It is written **`isArchived: true`, `pillar: null`, `kind:
"one-line"`** on purpose, so every reader of details — the tray, the rollup,
Coming up, the Delight queue, the sweep, and an old iPad bundle that has
never heard of it — skips it (`one-line.test.ts` holds that). The first save
is the whole document (`setDoc`); every rewrite after is an update of the
words and who wrote them, never the studio or the client (the rule holds
both immutable). An empty box clears it (body `""`). A line is rewritten only
over one this iPad has READ: when FORD failed to load, the panel says so and
offers no editor, because a line is replaced, not added to — unlike a detail,
which a failed read does not stop. `saveFordOneLine` answers `saved`,
`failed` ("try again") or `blocked`: a FIRST line refused by the rules, which
retrying can never fix (see "Things that will bite you").

**Follow up next time** (phase 11, AJ's decision 3b). `followUp`,
`followUpAt` and `followUpBy` on a detail: a question for the next trainer
("How did the new boots do on the long walk?"), at most 140 characters. It is
written only by the detail dialog, and **stamped only when the question
changes** (`followUpPatch`) — the dialog sends every field on every save, and
re-dating an unchanged question would reorder Ask next. The pillar's Ask next
line shows the newest open one ("Follow up from Jess Moreno, Mar 15"); **Asked
it** offers "Save the answer" (a new detail under the pillar, same subject,
the trainer's words — then the question is cleared), "Nothing new, clear it"
(`clearFollowUp`: all three fields to null, and no rollup refresh — a
follow-up is not in the rollup) and "Not yet". While the panel is open it
HOLDS the question it was opened on (see "Things that will bite you"). A
detail holding a follow-up that Ask next is not showing says so after it,
with the question — "follow up next time: “Still Tuesdays?”" — and an
unfiled capture shows its question in the tray, so no question waits unseen,
even for a reader who cannot open the dialog. One pair of quotes typed around
the whole question is taken off (`normaliseFollowUp`): Ask next adds its own.
No rules change: the ford block has no allowed-keys list. The briefing does
not read follow-ups yet (a floor change, for AJ).

**One load.** The page opens no listener: FORD, the journal and the Pulse
history are the tab's (`useCodexData`). **Who may write.** A FORD detail is
written only by a reader the create rule accepts: the codex's `canEdit`, a
signed-in author (the Auth uid) and a client with a studio (`fordCanAdd`). A
failed READ still lets a trainer add; a refused one does not.

**The dialog keeps the sentence.** `FordDetailDialog`'s `onSave` may answer
`false`; the dialog then stays open with every field and says "Not saved —
still here, try again". **A new idea is unowned**: a gesture made in the
dialog at Idea has no owner until someone says "I'll do it" (the Delight
queue's "Needs an owner" depends on it); one that already has an owner keeps
them, and one moved to Planned or Done with nobody on it is owned by whoever
moved it.

## Files

| File | |
| --- | --- |
| `types.ts` | The enum, the document, the date helpers (`toDate`, and `shortDate` — the FORD page's one short date). **Read this first** |
| `ford-write.ts` | Every write. All of them swallow their errors — a failed detail is a lost sentence; a hard failure mid-session is a lost client |
| `ford-rollup.ts` | Pure functions over an array: the summary, grouping, upcoming dates, the `client.events` adapter |
| `useClientFord.ts` | One client's details, and the studio-wide Delight queue. Reports `status`: `loading` · `ready` · `failed` · `denied` |
| `read-status.ts` | What a FORD read that did not come back is, and the sentence a screen shows instead of its empty state |
| `ford.tokens.css` | Colour. Pillars get identity, never status — see the note at the top of the file |
| `ford.css` | The floor's capture and sweep, the Delight queue, the briefing row and the detail dialog. The FORD page draws from the codex kit and `page/ford-page.css` |
| `ford.test.ts` | The pure layer |
| `ask-next.ts` | Ask next: the newest open Follow up next time, else the prompts worth asking this client, rotated by day, aware of retirement (`FORD_PROMPT_WHEN` in `types.ts`); `followUpPatch` (stamp only on change). `ask-next.test.ts` holds the drift guard |
| `one-line.ts` | In one line: the fixed id, the 120-character cap, `splitOneLine` (what `useClientFord` takes out of the list) and the "Written by the team · last by …" line. `one-line.test.ts` proves the document never reaches the tray, the rollup or Coming up |
| `ford-write.test.ts` | The new writes: a follow-up's stamps, `clearFollowUp` (no rollup refresh), and `saveFordOneLine`'s create, rewrite, clear and three outcomes (`saved` · `failed` · `blocked`) |
| `coming-up.ts` | Coming up: the Mindbody birthday and the dated details, on the studio's day |
| `pulse-links.ts` | The Pulse lines beside each pillar. No Firestore, no writes |
| `page-model.ts` | The FORD page's pure selectors, its sub-toggle line and the Overview's FORD slot |
| `page/` | The FORD page: `FordPage`, `OneLinePanel`, `PillarCard`, `bands`, `ComingUp`, `UnfiledTray`, `AskNextLine` (with "Asked it"), `AboveAndBeyond`, `ford-page.css`. `FordPage.render.test.tsx` mounts it; `AskNextLine.render.test.tsx` holds "Asked it" against a clear the cache shows before the server answers |
| `useClientFord.render.test.tsx` | The query's shape, the four read states, and the floor callers' wording when FORD could not be read (the FORD page's is `page/FordPage.render.test.tsx`) |

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
  here yet". The FORD page, the briefing cue, the Active Session sheet and
  the post-session sweep each say "couldn't be read" or "kept by the client's
  home studio" instead (`FORD_READ_NOTICE`, `fordReadNotice`). A visitor is
  offered no capture, because the rules refuse that write too; a failed read
  still offers one — a failed READ is no reason to refuse a WRITE. A client
  with no studio gets its own sentence and no Add (`fordCanAdd`): a retry
  cannot help, and the create rule refuses a detail stamped with no studio.
- **`clients/{id}/ford/one-line` is not a detail** (client codex, phase 11).
  It is In one line, stored archived with no pillar so every reader of
  details skips it. Anything new that lists FORD documents must either take
  it out (`splitOneLine`) or drop archived documents, or it will show the
  line as an unfiled capture — and the delete rule lets its last author
  delete a pillar-null document, so a screen that offered "discard" on it
  would delete the team's line. No screen does.
- **A client who moved home studio cannot get a line at the new one** until
  someone clears the old line. The old line sits at the fixed id, stamped
  with the old studio: the new studio's listener filters it out (so the page
  says "No line yet" and offers "Write the line"), and every save there is a
  `setDoc` over it that the rules take as an update changing `studioId` —
  refused, every time. This is WORSE than an older detail, which is only
  hidden while new ones still save. `saveFordOneLine` answers `blocked` for a
  refused first line, and the panel says a line from an earlier home studio
  may be in the way, that trying again won't help, and that an administrator
  can clear it (the delete rule lets administrators and franchise owners
  delete it; no screen offers that yet). No data is moved.
- **An open "Asked it" holds its question.** Firestore applies `updateDoc` to
  this iPad's cache before the server answers, so the one listener delivers
  the follow-up as CLEARED the moment "clear" is tapped, and Ask next moves
  on. `AskNextLine` therefore keeps the question it was opened on (and its
  meta) until the panel closes, every action is handed the question it is
  for, and the FORD page gives the line no key per question — a remount
  would close the panel as if the clear had worked, lose "The answer is
  saved…", and bind a retry to another detail. A fake Firestore that does not
  apply writes locally first cannot show this; `AskNextLine.render.test.tsx`
  hands the line those props in order, and `FordPage.render.test.tsx` holds
  the update open (`holdUpdate`).
- **One FORD listener per screen** (client codex, phases 6 and 10). The
  Notes & Profile codex reads FORD once for all seven pages and hands the
  result to the FORD page, which has no hook of its own — it cannot open a
  second listener.
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
