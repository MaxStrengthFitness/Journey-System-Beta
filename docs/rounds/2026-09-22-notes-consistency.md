# Taking a note: why it feels different every time

*Sep 22 2026. A survey and a proposal. AJ: "the consistency of how it feels to
take a note is not very intuitive — each category of notes changes completely
how you take the note."*

He's right, and it's worse than it feels. **There are fourteen places a trainer
can write something about a client.** Ten of them decide the category for you.
Most offer none of the controls the real composer has. Three write somewhere
the notes system will never look again.

---

## The table

`def X` = the surface decides X for you and gives you no say.

| Where you are | text | category | loudness | matters-until | FORD letter | machine |
| --- | --- | --- | --- | --- | --- | --- |
| **Notes area** (the real composer) | ✓ | ✓ | ✓ | **full** | hands off | ✓ |
| **Note button** on the header | ✓ | ✓ | ✓ | **full** | hands off | ✓ |
| **Notes sheet** mid-session | ✓ | ✓ | ✓ | **full** | hands off | ✓ pre-set |
| Adding an **update** to a note | ✓ | inherited | **def Note** | — | — | inherited |
| **Arrival note**, on the briefing | ✓ | **def none** | **def Note** | — | — | — |
| **Wrap-up note**, End Session | ✓ | **def none** | **def Heads up** | — | — | — |
| **Closing note**, post-session | ✓ | **def none** | ✓ | **until only** | — | — |
| **Focus check-in** | ✓ | **def Coaching** | **def Note** | — | — | def the focus |
| **Machine note** | ✓ | **def Equipment** | **a checkbox** | — | — | def this one |
| **Setting-change reason** | ✓ | **def Equipment** | **def Note** | — | — | def this one |
| **Consultation** | assembled | **def none** | **def Note** | — | — | — |
| **Remember this** (FORD) | ✓ | n/a | **none** | **impossible** | ✓ | — |
| **FORD detail** | ✓ | n/a | **none** | **impossible** | ✓ | — |
| **Planner note** (private) | ✓ | its own 6 kinds | **none** | — | — | — |
| **Pulse note** | ✓ | def the area | **none** | — | — | — |
| **Pain note** on the Now Bar | ✓ | **never a note** | — | — | — | this one |

---

## The four things that would actually bother a trainer

**1. The same sentence gets different power depending on which box you were
standing in.** Three boxes in one session, three different behaviours:

- *Arrival note* — silent. "Her shoulder's been aching" goes in as a plain
  note nobody is shown again.
- *Wrap-up note* — hard-coded to **Heads up**, with no control and no end
  date, so it shouts at the next trainer **for 21 days**, every time.
- *Closing note* — you get loudness, and a single "matters until" date.

Nobody chose that. It's three files that grew separately.

**2. A FORD detail can never say "matters from X until Y."** The fields do not
exist on it. FORD gets a single event date and an annual repeat — good for a
birthday, useless for *"her mother is in hospice through October"*, which is
the single most important thing to know before walking in. AJ named this
himself and he's exactly right.

**3. Nothing can say an injury changes the session.** A note has three ways to
express itself: its kind, its loudness, and a machine. There is no way to say
*"no pressing until cleared."* The app already knows this is a gap — there's a
comment in the code explaining that the Medical rail has to scoop up *any*
critical note regardless of kind, because *"a critical Pace note that says she
cannot hold the end range is a physical limitation even though its kind is
'coaching'."* That's the code working around a missing field.

**4. A note caught mid-sentence can be filed later to five categories — but
never to FORD.** Which is the one most likely to be caught mid-sentence.
"The grandkids are in town" has to be archived and retyped in the other box.

Then a long tail: three unrelated "matters until" mechanisms, three different
shapes of loudness control, two unconnected lists that both contain "injury",
and three boxes (the Now Bar pain note, the Pulse note, a private Planner note)
that write somewhere the briefing will never read. A trainer who types *"left
knee"* mid-session has reasonably taken a note. Nobody will ever see it.

---

## What NOT to do

**Don't merge the two stores.** It's tempting — one kind of note, one place —
and it's the wrong move.

Notes live in `journalEntries`, which is readable by **every signed-in user in
the company**. FORD lives under the client, scoped to that client's studio.
That split is deliberate and four separate documents say why, in the same
words: *"a client's home life is not company-wide reading."*

Merging in the obvious direction publishes every client's family to the whole
company. Merging the other way means rewriting four queries that don't carry a
studio, adding four indexes, backfilling a field that's been written blank for
months, and branching every piece of note logic. Closer to a month than a week,
and it risks the one thing the design is protecting.

**The split is not what AJ complained about.** He complained about *taking* a
note. That's the front door, not the filing cabinet.

---

## The proposal

### 1. One composer, every door

There is already one good composer — category, loudness, the full matters-until
picker, a machine. It's mounted in three places. **Mount it everywhere**, and
let each door pre-fill what it knows instead of locking it.

The arrival box already knows it's pre-session. The machine note already knows
the machine. The focus check-in already knows the focus. Keep all of that as a
*default*, and let the trainer change it. That alone fixes ten of the fourteen.

The one real tension: nothing may slow down starting a session, and the floor
rules are explicit about clutter. So the composer opens as it does now — one
box, type and go — with the controls behind a single line that doesn't move the
Save button. Fast stays fast; the option is there when it matters.

This touches no security rule, no index, no stored shape. It is a week.

### 2. Give FORD the matters-until window

Three fields, and the machinery already works. The function that answers *"does
this matter today"* takes a **structural** type — any object with those fields
is accepted — so a FORD detail becomes answerable the moment it has them.

Then *"her mother is in hospice through October"* is a FORD detail with a
window, it reaches the briefing while it matters, it stops on its own, and a
studio leader can act on it. Which is what AJ asked for.

### 3. Add the one field that's missing: does this change the session?

Not a new vocabulary — one question on a note, answered only when it applies:

> **Does this change the workout?** · *Keep in mind* / *Changes the session* —
> and if it changes it, which machines.

The app already has exactly this shape for its built-in conditions: the clinical
matrix carries an instruction plus the machines it affects plus the setup
change. What it can't do is let a trainer write one. This gives a note the same
expressive power, per client, in the trainer's own words.

That's the difference between a paragraph someone has to read and remember, and
a fact the Now Bar can put in front of them at the machine it applies to.

### 4. Let the to-file tray file to FORD

One category, currently missing from the list. Closes the retype.

### 5. The three boxes that write nowhere

The Now Bar pain note is the one that matters: *"left knee"* typed mid-session
should reach the next trainer. Smallest honest fix is to let that box also file
a note against that machine — no extra taps, same typing.

---

## The order I'd do it in

| | | |
| --- | --- | --- |
| 1 | **One composer, every door** | the bulk of the complaint, no schema change |
| 2 | **FORD gets the window** | additive; AJ named it |
| 3 | **"Changes the session"** | needs the design settled first — see the questions |
| 4 | **To-file → FORD**, and the pain note | small, independent |

Nothing here requires merging the stores, and nothing here touches the privacy
boundary. If the stores are ever unified it should be a later, separate
decision — and it should go *toward* the tighter scope, never away from it.

---

## What I need from AJ

1. **"Changes the session" — how far should it go?** A mark the trainer reads,
   or a mark tied to specific machines that shows up at those machines, or
   something that actually alters the routine?
2. **The arrival and wrap-up boxes** — full controls behind a "more" line, or
   keep them deliberately bare because nothing may slow the start?
3. **The 21-day shout.** Every wrap-up note is currently Heads up for three
   weeks whether or not it should be. Is three weeks right as a default, or
   should the trainer pick?
