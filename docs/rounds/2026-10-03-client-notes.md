# Client notes — how a note is written, who it reaches, and how her notes answer a question

*Oct 3 2026. Branch `oct3/notes-writing`, on master's `969ce169`. Built after AJ's
interview with claude.ai (brief: `docs/ops/NOTES-INTERVIEW-BRIEF.md`), his hand-off
below, Claude Code's brief-back, and his three answers. Then the trainer's journal,
the leader's journal and studios' notes on machines, in the same branch — see the
second half of this document when it is written.*

AJ, the round's ask: *"I really want to nail down client notes first... So that way
studios can like take advantage of like, hey, if one person takes a note, the whole
team can use that note... we have a system for taking notes that is so over the top
that it allows us to be extra organized for our clients and allow studio leaders to
not have to actually take the clients, but still to have their full story and full
picture and almost feel like they are the ones taking the clients."*

And, while it was being built: *"the one that has to be the most flawless is
currently the client notes. Because when we make a note about a client, it could be a
note about their session. It could be... a note about them. It could be a note about
them on a machine. It could be a note about their life. It could be something outside
the studio. It could be about their renewal. It could be about an upcoming vacation
or event for them."*

And: *"when I go into a client's profile and I go to their notes I should be able to
kind of ask the question of like oh hey I want to learn about their life or oh I want
to learn about um their time here at Max Strength or I want to learn about what's
going on with them right now... you're going in there to look about something with
that client."*

---

## The hand-off, as AJ pasted it

```
JOURNEY HAND-OFF: Client notes — the writing side
Date: Oct 3 2026
Type: deep conversation

OUTCOME (AJ's words): "Category is... one of the more important parts because we need
to know how to correctly file this into their note section on their profile, so that
way we know how to act on it later. We don't want to just have a very disorganized big
file base of just random notes. We want to be able to actually act on them and use
them to our advantage."

WHO AND WHEN: A trainer, mid-session on the floor, client standing right there, iPad
in the non-dominant hand. Also the trainer before the session (the glance) and a
studio leader later (checking what needs follow-up).

NEVER: nothing slows the start or the set; capture can't depend on a Wrap-up/teardown
pass because the time won't reliably be there and trainers may not do it; don't
rebuild FileMaker's buried per-set notes; no scoreboard that ranks trainers.

DONE WHEN (on the iPad): a trainer can dash off a note mid-set by picking one category
fast, and that note reliably reaches the next trainer's glance and the leader's
follow-up view without anyone hunting for it.

PRIORITY: beta blocker (core to how notes work)

WHAT I LEARNED ABOUT HOW TRAINERS USE NOTES:
- A trainer's pre-session prep is two reads at once: "what to watch for" and "how she
  normally performs." AJ liked that framing explicitly.
- The watch-for read should lead with what's changed recently, with stable medical
  backdrop (knee, osteoporosis, high blood pressure) sitting underneath as standing
  context — known, not news — openable when something looks concerning.
- Most clients are over 40; medical backdrop is real but stable, not session-to-session
  news. Trainers perform an existing routine, they don't build one, so they want a
  quick context glance, not a deep study.
- FileMaker today has three "heights" for a note — set, session, profile — which was
  the trainer's shorthand for loudness-and-lifespan. That collapses into Journey's
  loudness + window, except for the "where" (machine), which must survive.
- The perpetual profile note's two failures: no "as of when" anchor ("surgery next
  Thursday" written 3 weeks ago is meaningless), and it falls off the back once the
  session scrolls into history.
- A single note can do three jobs: context for the next trainer, a countable data
  point for an Operations pattern ("neck flagged 3 sessions, follow up?"), and a
  coaching signal a leader reads ("only flagged with this one trainer — what's the
  deal?").

DECISIONS AJ MADE IN THIS CONVERSATION (exact words / close paraphrase):
- "Here's what to watch for, and here's how does she normally perform." The briefing
  leads with what's changed recently, then standing/open context underneath.
- Category is the one thing capture must get; "that stuff can wait" for body part,
  machine, detail, window — because category routes the note to someone who'll
  complete and act on it.
- Body part comes from a fixed, consistent top-to-bottom map (neck, shoulder, chest,
  upper/lower back, abdominals, hips, knees, ankles, elbows, wrists, hands, feet;
  left/right), same order every time for muscle memory; may nudge the current
  machine's parts up.
- Don't rely on tag-later: "I just don't think there's going to be enough time at wrap
  up all the time, or trainers might just not do it at wrap up."
- Machine on a note defaults to the machine the trainer is currently on, with override.
- Categories reshape from seven toward: a coaching-and-equipment lane (how to run her
  on the floor); a HEALTH lane with flavors underneath (surgery, injury,
  medication/GLP-1, serious diagnosis); INCIDENT as its own "something happened in the
  room" lane (from "left her phone" to "fell off the leg press"); FORD; PREFERENCE as
  catch-all.
- Health and incident are separate categories but both must notify leadership — the
  "at-risk things a leader can't afford to miss."
- FORD is held deliberately as a relationship asset: "knowing about their family, what
  they do for work, what they like to do for fun, and what they want to do with their
  life is... meaningful to act on."
- Lifespan tied to resolution: Critical stays until acted upon (no timer); Heads up
  defaults to four SESSIONS (not days), extendable; plain Note has no lifespan factor.
- Timing (happened-before / happening-here / going-to-happen / just-is) mostly lives
  inside the category; only asked explicitly where the category can't answer —
  basically Incident.

RULES THIS TOUCHES: never block a save; nothing slows the start; nothing hidden without
a way back; nothing contacts anyone; recognition never ranking (the per-trainer
pattern read must stay a prompt to look, never a scoreboard); prior history is real
history.

REPLACES OR OVERLAPS: reshapes the existing seven categories; changes Heads up from a
21-day clock to a four-session count; may absorb several of the "fourteen doors" into
the one composer.

OPEN QUESTIONS (AJ to answer):
1. The "outside-the-studio care" idea — massage, chiropractor, adjustments, PT: its
   own category, a Health flavor, or something else?
2. Does a backward-pointing Health note with no date (e.g. "tweaked her knee recently")
   need an explicit "when," since the flavor alone won't say?
3. Graduation rule: a note stays live/loud until acted-upon-and-resolved, with category
   as the thing that delivers it to the actor — confirm this is the intended rule for
   the briefing's "recently changed" band.
```

## AJ's answers to the brief-back (Oct 3 2026): "1A 2A 3 flavor"

1. **Retention conversations — who reads them? A: the whole team, on her record.** So a
   retention conversation is a note like any other, readable by anyone signed in.
2. **Medication and serious-diagnosis notes — company-wide? A: yes, like injuries
   today** (a trainer at another studio for one session sees she's on blood thinners).
3. **Massage, chiropractor, PT — a Health flavour** ("Care outside the studio").

Claude Code's answers to the hand-off's own open questions, stated in the brief-back
and not overruled: (2) no extra "when" at capture — every note carries the day it was
written and the session it came from, and the composer's date can be moved ("a day
ahead is fine — a surgery on the 14th"); (3) two separate acts — a leader's **Seen**
takes a note off the leaders' list, and **closing** it is still the trainer's word
that the knee has healed.

---

## What was built — eight commits

| # | Commit | What it does |
| --- | --- | --- |
| 1 | `861d104b` | **A Heads up is read out at four of her sessions**, not three weeks (`client-notes/heads-up.ts`): counted from the note's newest word — written, dated ahead, or its latest update (an update is how a trainer keeps it on) — against the sessions the profile already reads; the old three-week clock only while her sessions are unknown. The Notes card says "Read out at 2 more sessions" or the day it went quiet. |
| 2 | `e59da7d5` | **The categories reshaped**: Coaching & equipment (the 4 P's or Set-up as its second tap) · Health (Injury or pain · Surgery · Medication · Diagnosis · Care outside the studio) · Incident · Retention (new) · FORD / Life · Preference; Admin stays read-only. Health and Incident ask **where on the body**, AJ's fixed map, each part lined up with the Pulse pain map. `storedNoteOf` is the one answer every door writes through. Nothing stored was rewritten: old notes file themselves under the new names. Fixed on the way: Pulse's link suggestions missed every `kind: "injury"` note. |
| 3 | `d7a96cf6` | **Every door files the note as it is written**: the briefing's arrival note and the End Session box get an optional "File it as" row (shown only once something is typed); a set **skipped for pain** becomes an Incident at Heads up at Finish ("Skipped Leg Press for pain: left knee."), from the final log only. |
| 4 | `dff4546c` | **Health, Incident and Retention reach the studio's leaders**: Operations → Today → Needs you → the team's notes from the last two weeks, whatever their loudness; **Seen** is the existing acknowledgement (beside the studio, never on her record). One new read, with its index. |
| 5 | `733b1d68` | **The Notes page answers the question you came with**: What's going on with her right now? · Her health · How to train her · Is she staying with us? · Her life · Her time here · Every note (`ask.ts`, `AskBar.tsx`). Each is a view over the notes' facets, with a line saying how much is behind it; a question with a deeper page opens it. Opens on "right now". |
| 6 | `ccc932fc` | **The briefing folds her standing health context under the news**: "Show standing health context · 2 — Known, not news." |
| 7 | `12f95e30` | **Retention conversations go on her record**: a client's case in Operations gains "Conversations about staying" (the open Retention thread, and a box that adds to it). **The Story** gains incidents and every retention conversation. |
| 8 | `45f4a32a` | Polish from looking at the screens at iPad width. |

### The categories, and what each is for

| Category | Second tap (optional) | Stored as | Starts at | Reaches |
| --- | --- | --- | --- | --- |
| Coaching & equipment | Posture · Path · Pace · Purpose · Set-up & equipment | `coaching` (+ the P) or `equipment` | Note | the next trainers; Goals & Focus; the machine |
| Health | Injury or pain · Surgery · Medication · Diagnosis · Care outside the studio | `injury` (+ the flavour in `category`) | Heads up | the next trainers; **the studio's leaders**; Body & Pulse |
| Incident | — (where on the body, when) | `incident` | Heads up (was Critical) | the next trainers; **the studio's leaders**; Body & Pulse; the Story |
| Retention | — | `retention` (new) | Heads up | the next trainers; **the studio's leaders**; the case; the Story |
| FORD / Life | the four letters | FORD (`clients/{id}/ford`) | — | her home studio's team |
| Preference | — | `preference` | Note | the next trainers; Goals & Focus |

**Incident now starts at Heads up, not Critical** — Claude Code's call, stated here so AJ
can reverse it in one line (`DEFAULT_IMPORTANCE`, `note-catalog.ts`): Incident runs from
"left her phone" to "fell off the leg press", Critical stays until someone acts on it
and marks her Hub card for every trainer, and every incident reaches the leaders now
whatever its loudness. A fall is one tap up.

### Where each kind of note AJ named goes

| AJ: "it could be a note about..." | It is filed as | It answers |
| --- | --- | --- |
| their session | the session's own note (End Session box), or Coaching & equipment, linked to the session ("From session #12 · Sep 30") | How to train her; the briefing |
| them | Preference (how she likes things; the catch-all) | How to train her |
| them on a machine | Coaching & equipment, about that machine (the machine on screen by default) | How to train her; the machine's notes |
| their life | FORD / Life | Her life (FORD) |
| something outside the studio | Health · Care outside the studio (massage, chiropractor, PT) | Her health |
| their renewal | Retention | Is she staying with us? |
| an upcoming vacation or event | FORD / Life with its dates; or any note with a From – until window | Right now, a month ahead; the briefing's FORD line |

---

## The research the reading side rests on

AJ: *"take as much creative liberties to maybe even look up some theories on like an
organized note-taking format"*. What was used, and where:

- **Lawrence Weed's problem-oriented medical record** (NEJM 1968): a short, maintained
  list of what is going on at the front of the chart, every note filed under its
  problem, instead of a feed every reader rebuilds the story from. → **"What's going on
  with her right now?"** is that list, and a note is already a thread (a problem with
  its updates). Weed's systems also lost to free text where structure made writing
  slower → capture stays one tap plus words; everything else optional.
  (https://pmc.ncbi.nlm.nih.gov/articles/PMC4970280/)
- **SBAR and I-PASS hand-offs**: a fixed order, severity first; I-PASS cut medical
  errors 23% and preventable adverse events 30% across nine hospitals
  (https://www.nejm.org/doi/full/10.1056/NEJMsa1405556). → the briefing keeps its
  order: Critical, then Heads up, then what carried over, then the standing context
  folded underneath.
- **Alert fatigue**: clinicians override most decision-support alerts, and acceptance
  falls with every extra and every repeated reminder (Ancker et al. 2017,
  https://link.springer.com/article/10.1186/s12911-017-0430-8). → a Heads up stops
  after four sessions rather than repeating forever; standing context never shouts;
  "no need to remind me" stays.
- **Faceted classification and information scent** (Ranganathan; Pirolli & Card): a
  question is a view over a note's facets, never a folder, so one note answers two
  questions without being copied; each question says how much is behind it before it
  is tapped (https://www.nngroup.com/articles/information-scent/). → the seven
  questions and their lines.
- **PARA and progressive summarization** (Tiago Forte): organise by actionability —
  projects (with an end), areas (a standard to keep), resources, archive
  (https://fortelabs.com/blog/para/). → right now (a surgery, a trip, a renewal
  decision) · her health and how to train her (standing) · her life · resolved.
- **Hospitality guest profiles** (Ritz-Carlton's preference pads and guest recognition)
  and CRM timelines: capture as cheap as a pad note; it comes to the reader before the
  visit, not "go read the profile". → the briefing, and the team's notes reaching the
  leaders.
- **Social-work chronologies**: significant events only, factual, so patterns become
  visible. → **"Her time here"** is the Story, which now holds incidents and every
  retention conversation.

---

## What it touches

- **Data.** `journalEntries` gains the kind `retention`, Health flavours in `category`,
  and an optional `bodyParts` field (written only when a part was picked). No new
  collection. Leaders' Seen is the existing `studios/{s}/acknowledgements` (key
  `note:{id}`).
- **Rules.** None changed: the journal's create rule doesn't restrict `kind`, and
  acknowledgements are already the leaders'.
- **Indexes.** One new: `journalEntries` (studioId ASC, kind ASC, createdAt DESC), for
  Operations → Today. **Deploy it before the app** (`firebase deploy --only
  firestore:indexes`); until it builds, Today says part of Needs you couldn't be read.
- **Reads.** One per Today open (the team's notes, ≤100 docs); one per client case open
  in Operations (her newest 100 notes, the profile's existing index). The Heads up
  count uses the sessions the profile already reads. No Mindbody call.
- **Session record.** The note sheet is the same composer; Save never waits for a
  category. A pain skip's note is written at Finish outside the batch, like every
  journal write, and a failure is said, never a reason to hold Finish.

## Not built, and why

- **The per-trainer pattern read** ("only flagged with this one trainer") — it is a
  sentence about a trainer, and the rule is recognition, never ranking; it needs AJ to
  say where a leader sees it (Team? the client's case?) before it is drawn anywhere.
  The per-client half is built: "Her health" says "left knee in 3".
- **"Nudge the current machine's parts up"** in the body map — it would break "same
  order every time", which is the decision it came with.
- **A vacation that makes her Away for Operations.** Away is read from `client.events`
  (frozen) and the Retention Status switch; a FORD trip with dates reaches the briefing
  and "right now", but Operations doesn't read FORD. A question for AJ.

## For AJ

1. Walk it on the iPad: write a Health note mid-session with a knee, open Notes → each
   question, open Operations → Today and tap Seen, write a conversation on a client's
   case, open her Story.
2. Deploy order: indexes → (rules unchanged) → push.
3. Say if Incident should start at Critical again.
