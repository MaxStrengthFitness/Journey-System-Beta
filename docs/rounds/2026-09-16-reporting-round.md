# The reporting round — Sep 16 2026

Branch `reporting-round`, off `master` at `a00af6f` (the hub sync fixes).
One commit per phase, each typechecked on its own.

AJ's brief: the 23-page **Client Reports Audit** (his words, with iPad
screenshots of every screen). Standardise the whole reporting ecosystem —
everything a trainer notes or reports ABOUT a client, not the reps, weight
and rep quality of a set — so a trainer never re-learns how to log depending
on the screen. Held-tablet ergonomics, eyes-off touch. A 1–3 scale is too
vague, 1–10 too broad.

## The finding that shaped it

The app asked a trainer to rate things **eleven different ways**: sleep in
three words, stress 1–5, energy and mood three words each, body regions two
states, the post-session feel three words, the closing note Low/Medium/High,
journal notes Standard/Elevated/Critical, the 4 P's red/black/green AND a
1–5 rank, the assessment 0–10 per statement with pain and stress on their
own 0–10s. Underneath there are only two kinds of question — RATE something,
or WRITE something and say how loud — so the fix is one component for each.

## The decisions (AJ, Sep 16 2026)

### The Dial — for anything you rate

Five positions, one bar of five EQUAL segments across the full width of its
card, 48px tall, always the last thing in the card (thumb zone), always
**left = worse, right = better** — even for pain, whose words run Worst →
None. **The centre is where we expect them, and the trainer records drift:**

- *relative* (the floor): the centre is THIS CLIENT'S USUAL, or the RIGHT
  DOSE after a session (Goldilocks). Two intensities each way.
- *absolute* (Pulse and the report card): the centre is the middle of a fixed
  scale, and the words are the reference document's own frequency words —
  Not at all · Rarely · Sometimes · Often · Nearly always — stored at the
  0/3/5/8/10 anchors scale v2 already had, so **nothing in scoring, history
  or the change log moves**. Pain and stress intensity: Worst · Severe ·
  Moderate · Mild · None. A P on the report card: Needs work · Developing ·
  Solid · Strong · Mastered.

**Untouched = not asked (`null`), never 0.** The centre is the resting
position on screen, but nothing is stored until the trainer taps. Storing 0
by default would let the deep dive find that a client slept normally on two
hundred nights nobody asked about. Tapping the centre explicitly confirms
"as usual", one tap, so exception-only logging still holds. Nothing a
trainer rates is ever shown as a number.

Code: `src/features/rating/` — `dial.ts` (scales, words, every legacy
conversion), `Dial.tsx`, `Loudness.tsx`, `rating.css`, tests and a render
test.

### Loudness — for anything you write

One three-step chip row on every screen a note is written: **Note · Heads
up · Critical.** Note is filed; Heads up rises to the top of the record and
shows on the briefing while it still matters (its "until" date, or three
weeks); Critical is pinned, on the briefing, and marks the Hub card. The
stored values are the journal's existing `standard / elevated / critical`;
only the words and the component changed. Low/Medium/High and
red/black/green are gone. **The closing note now defaults to Note** (it
defaulted to Medium).

### Pulse — the living assessment's new name

The check-in / assessment / 90-day report is **Pulse**: the record of how the
client's life is going, filled a little at a time, never "done", never a
test. It sets the baseline the floor's dials drift from. The whole system in
one sentence: **Pulse sets the baseline, the floor records drift from it,
the Kaizen Deep Dive reads the drift against the sets.**

- Same five segments with the document's frequency words; the 0–10 tap
  grids go (24 statements × 11 buttons was 264 targets on one screen).
- Per-statement notes are dropped; one coach note per area stays.
  Hydration and protein detail stay; the client-copy switches stay.
- **Update Pulse** from the briefing, the note sheet and the post-session
  screen: pick an area → its statements on the Dial → Done. One answer is
  enough (the living rule carries the rest forward). "Open full Pulse" is
  the escape hatch for the lists (protein, hydration, pain map, stress).
- **Client mode**: hand the iPad over; the client answers the frequency
  words themselves; no coach notes or flags visible; answers marked
  `enteredBy: "client"`.
- Pulse is **out of the Client Progress Report** (audit action item A). The
  report shows a read-only Pulse snapshot instead.

### What the floor asks

- **On the way in** (briefing), four relative dials, all optional, all
  resting untouched: **Sleep · Energy · Recovery (new: "how's the body since
  last time") · Stress.** Mood is dropped as a dial — the trainer sees it.
  The arrival note stays for the words.
- **Body regions**: tapping a region opens the same Dial — Pain · Stiff · As
  usual · Better · Recovered — so an injury can be tracked coming back. A
  region can carry a **"matters until"** day; until then the briefing keeps
  showing it from the last session it was flagged in.
- **After the session**: one trainer-judged Dial — Wiped out · Drained ·
  Just right · Had more · Barely worked — replacing Wiped Out / Good /
  Energized. Old sessions read Wiped Out → −2, Good → 0, Energized → +1.
- **"Matters until"** on any Heads up or Critical note (the journal's
  existing `effectiveUntil`, offered for every category now, not injuries
  only): "leg press out until Thursday", "on a trip until the 20th" — the
  note leaves the briefing on its own.
- **Capture now, tag at teardown, for every note** (FORD's rule): no
  category or loudness required in the moment; anything left untagged shows
  on the post-session screen as a card to file with one tap. The chips and
  Loudness stay for trainers who tag inline.

### The Kaizen Deep Dive

"Trends Clinical Review" becomes the **Kaizen Deep Dive**, with the "this is
AI and can be wrong" line at the top and the **rule of three** (nothing
under three sessions is a finding). Panels that earn a place: progression
stalls · readiness vs output (Dial level vs the sets, rule of three) ·
attendance rhythm · pain / incident timeline + Pulse trend · time under
tension (kept). Weekly tonnage is retired (it rises with attendance, not
strength).

### Consistency — the property, not a style guide

Every capture surface keeps the same vertical order: *what kind* (chips) →
*the words* (text) → *how much* (Dial or Loudness) → *until when* (optional)
→ save. Nothing you rate is a number; nothing has a pre-selected answer;
left is always worse; nothing can block a save.

### Data (AJ's OK, Sep 16)

Optional fields only, on documents the app already owns. No new
collections, no Mindbody, Cloud Function or rules changes.

| Where | Field | Written by | Read by |
| --- | --- | --- | --- |
| `sessions/{id}.preSessionCheckIn` | `readiness: { sleep?, energy?, recovery?, stress? }` (−2…2) | the briefing | deep dive facts, the briefing's "last time" |
| `sessions/{id}.preSessionCheckIn.bodyStates[]` | `dial` (−2…2), `until` (yyyy-mm-dd); `state` still written, derived from `dial` | the briefing | the briefing (carry-over), deep dive |
| `sessions/{id}` | `dose` (−2…2) | the post-session screen | deep dive |
| `journalEntries/{id}` | `effectiveUntil` (exists) — now offered for any Heads up / Critical | the composer | `useClientJournal` (already honours it) |

`sleepQuality`, `stressLevel`, `energyLevel`, `mood` and `clientFeel` are no
longer written; they are read as legacy through `features/rating/dial.ts`.

## Phases

1. `feat(rating)` — the Dial and Loudness, the data types, the Loudness words.
2. `feat(pulse)` — Update Pulse, the quick-log (content + dialog).
3. Pre-session briefing overhaul.
4. Mid-session notes: capture-now-tag-later, Loudness, matters-until, Pulse in the sheet, the To-file tray.
5. Post-session: the dose Dial, Loudness, the note sweep, Update Pulse.
6. Pulse: five segments, no per-statement notes, client mode, the name.
7. Client Progress Report: Pulse out, 4 P's on the Dial, spruce-up.
8. Kaizen Deep Dive.
9. Docs.

(Filled in per phase below as each lands.)
