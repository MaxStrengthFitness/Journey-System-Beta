# The Journey System — a briefing for conversation

**True as of 20 September 2026.** Written for a Claude that has no access to the
code, so that it can hold a real conversation about this app.

---

## 0. A note to whoever is reading this

### If you are Claude

You are about to be asked about an application you cannot see. This document is
your whole picture of it. It was written on purpose, from the codebase and from
the product decisions behind it, so that you can talk about Journey the way a
colleague who works on it would — knowing what it is, why it is shaped the way
it is, and what is still unsettled.

Four things to hold on to:

**This is a snapshot, not a live view.** Everything here was true on 20 September
2026. The project moves in "rounds" — a week can change a screen's name, split a
dashboard in two, or retire a feature. If the person you're talking to describes
something that contradicts this document, they are right and this is stale. Say
so and move on; don't argue from the page.

**You do not have the code.** Do not invent file names, function names, line
numbers, or component structures. If a question needs the code to answer
honestly — "why is this component re-rendering", "what does this function do" —
say that you'd need the repository open, and offer what you *can* do: reason
about the design, ask the questions that would narrow it down, sketch what the
answer probably looks like and what would confirm it.

**The vocabulary is load-bearing.** This company has its own words. A trainer is
a **Life Transformer**. The rating control is **the Dial**. The note importance
is **Loudness**. The living assessment is **Pulse**. The studio dashboard is
**My Studio**; the one you look at it from is **Operations**. Using the right
word is most of sounding like you know the place. Section 9 is the list.

**The person you're talking to is almost certainly AJ.** He is the founder-side
owner of this project and a self-taught developer who built the whole app
through AI assistance and is learning as he goes. He wants things explained in
plain terms as you go, not just handed over. He thinks in screens and in what a
trainer does on the floor, not in abstractions. He appreciates being pushed
back on. He does not want ceremony.

### If you are AJ

Upload this into a Claude Project as a knowledge file and every chat in that
Project starts here. It's a snapshot — when it drifts far enough to annoy you,
ask for a refresh.

---

## 1. What Journey is, in one page

Journey is the coaching system for **Max Strength Fitness**, a franchise of
strength-training studios. Trainers coach clients one-to-one, twenty minutes at
a time, on machines, from an iPad held in one hand on the gym floor. Journey is
where the trainer sees what the client needs to do today, records what actually
happened — the weight, the reps, how well the set was performed, what the
machine was set to — and leaves the notes the next trainer will need. Studio
leaders run the studio from the same app.

It replaces a **Claris FileMaker** system the studios have run on for years, and
it syncs people, bookings and contracts from **Mindbody**, which stays the
system of record for anything commercial.

The reason it exists, in AJ's own words: sessions are one-to-one, so no single
trainer ever sees the whole picture. Journey is what gives the head trainer and
the studio leader "supreme knowledge across the whole team," and it lets the
studio go "beyond just putting weight and reps on a day tracker."

The failure it is built against is specific. FileMaker collected hundreds of
sessions a week for twelve years and did nothing with them. It was slow, it got
slower with every session on screen, zooming reloaded the page, and creating a
note was hard enough that trainers stopped recording. The bar Journey is held
to is not "better software" — it is:

> "We need the app to be able to act as pen and paper in terms of reliability."

Technically: a React + TypeScript front end on Vite and Tailwind, backed by
Firebase (Firestore, Auth, Cloud Functions), with an Express server on Render
that proxies Mindbody and runs scheduled jobs. It has **no router** — one piece
of React state decides which screen renders. That is a real architectural fact,
not a shortcut, and it shapes a lot of the app.

**Current stage: pre-alpha.** No trainer runs a real session on it yet. Roughly
627 clients and 203 sessions exist in production, and nearly all of those
sessions belong to eight clients. The app is built; it is not yet in use.

---

## 2. The business

### The method

Max Strength Fitness is not a gym with trainers in it. It sells a specific
protocol, and the protocol is the product.

A client comes **twice a week for about twenty minutes** and does **one set to
failure on five to eight machines**. The set is slow and continuously tense —
no pause and no acceleration between lowering and lifting, which is what "**continuous
tension**" means. The client breathes openly and does not rest inside the set.
The weight builds gradually rather than being jumped into.

The trainer runs every interaction with the app so the client keeps absolute
focus. The trainer carries three things: a **mechanical clicker** that counts
reps and doubles as the client's audio cue, a stopwatch on a lanyard (optional
— the app has one built in so nobody needs a third-party timer), and the iPad
in the non-dominant hand.

The muscle only cares about **time under tension**, but true time under tension
is near-impossible to capture by hand. So what actually gets recorded is weight,
reps, and quality:

- **Weight** is the most important recorded value — it is the thing that
  progresses.
- **Reps** vary day to day with sleep, stress, meals, time of day. The goal is
  failure somewhere around eight to ten. Some clients fail at thirteen, some at
  eight. **The rep count is never the target.**
- **Quality** is whether every rep kept **the 4 P's**: Posture, Path, Pace,
  Purpose.

There are two variants for working around pain or injury. A **TSC** (Timed
Static Contraction) is pushing against a movement arm locked in place — effort
with no movement and no load held; it is the most conservative option, used
around pain or a return from surgery with medical clearance. A **Static Hold**
is holding a load still: easier to progress, less conservative. For both, the
"reps" are seconds.

**The app never decides a progression.** There is a heuristic — over ten reps
and approaching fifteen, the weight goes up; under eight, it may be too heavy —
but it is applied by the trainer with judgement about that particular client.
The app's job is to make the *consequence* visible ("that was a 12% increase,"
"up 40% over 90 days") and to let a leader spot a plateau and ask why. It never
suggests moving the weight. This is a hard line, not a preference.

### The studios

Three corporate locations, plus franchisees who own one to three studios each.
The plan is around forty locations at launch, growing toward a hundred.

Four studios are live in the app today: **Westlake, Strongsville, Willoughby**
and **Solon**. They span **two Mindbody accounts** ("sites") — the first three
share one site, Solon has its own — which is why the schedule sync only ever
handles one studio at a time, and why a lot of the Mindbody code is more awkward
than it first looks.

The founding studio has been open for **over twelve years**. That matters more
than it sounds, and Section 7 explains why.

The franchise shape produces the app's central political principle:

> **Max Strength owns the method; a studio owns its hardware.**

The company franchised out of three corporate locations, so the *method* is the
product — musculature, movement pattern, cadence, the turnarounds, the key cues
— and every location reads the same words. What a location genuinely owns is
the **unit in its building**: the name it uses for it, the baseline positions,
the body-type adjustments, the dials and their defaults, the starting load, a
photo. Safety is additive: a studio may **add** a warning or a contraindication,
never remove one the catalog set.

A studio's version of a machine is stored as a **difference** from the
corporate standard, so a field the studio never touched keeps inheriting
corrections automatically. Machines are **adopted, never pushed** — corporate
publishes a standard, the studio takes it up. A studio can also **offer** one of
its own machines back to the corporate catalog, and corporate decides.

### The money

Clients commit to 6, 12 or 18 months, on the assumption of training twice a
week:

| Package | Commitment | Sessions | Per session | Every 4 weeks |
| --- | --- | --- | --- | --- |
| **The Trial** | 6 months | 48 | $70 | $560 |
| **Committed** (most popular) | 12 months | 96 | $60 | $480 |
| **Life Transformed** | 18 months | 144 | $54 | $432 |

Prepaying gets a lower rate. Every package advertises two free workouts. There
is a "Double Transformation Guarantee" — thirty days money back, and if a client
shows up twice a week, gives full effort and isn't happy with their progress,
the studio buys them six months at another gym.

Prices can vary by location, so the app keeps a price table per studio rather
than hard-coding those numbers.

**The one commercial fact that drives a whole feature area: sessions never
expire.** A client who takes a month off for surgery keeps that month's
sessions. This is generous and it is the studio's biggest headache, because
**the contract auto-renews when the payments finish, not when the sessions do**.
A client who averages 1.5 visits a week takes roughly 64 weeks to use a package
that bills for 48 — so they get charged for a new package while still holding
sessions from the old one. That conversation, badly handled, is how you lose a
client.

Price is the number one reason clients give for leaving. Most are on the
12-month package; they resist 18 months because they worry they won't want to
keep going or won't see enough progress — they "just want to be healthy, not a
body builder." But 18 months is what the studio needs most. So the renewal
conversation is meant to lead with **health** (body composition, sleep, energy,
pain, consistency) and with the arithmetic that a longer commitment **lowers
every payment**.

Everything Journey does about renewals exists to get a leader *ahead* of that
conversation. And it never contacts the client — see Section 11.

---

## 3. The people

### The roles

The company's own vocabulary. Don't reword these on screen.

| Label | Who they are |
| --- | --- |
| **Life Transformer** | A trainer on the floor. This is the company's word for "trainer" |
| **Studio Leader** / **Head Trainer** | Runs a studio. Some studio leaders don't train clients at all |
| **Studio Owner** | Owns and runs one studio |
| **Franchise Owner** | Owns several studios |
| **Founder / Overseer** | Company leadership |
| **System Administrator** | Corporate staff who run the app itself |

### The three tiers

Agreed in September 2026, and the cleanest way to think about permissions:

- **The studio tier** runs *one* studio — a head trainer, studio leader or
  studio owner at that studio, **or any trainer whose leadership has given them
  "the grant."**
- **The owner tier** runs several studios.
- **The company tier** sets the standard: the catalog, the standard machine set,
  the company routines, every studio.

**The grant** is worth understanding because it's unusual. It's a list of studios
on a trainer's record saying "this person helps run this one," handed out by the
studio's own leadership, whatever the person's job title. AJ's reason: *"to allow
studios to develop their trainers into leadership we need to allow leadership to
be able to give trainers access to these menus."* It opens the leader sections of
**My Studio**; it does **not** open the Operations dashboard.

A studio's leaders can hand out trainer, head trainer, and the grant for their
own studio — never owner and never admin. Administrators are corporate staff who
help studios start up and support existing ones; they sit above the franchisees
and have unscoped access.

### Clients are not users

This is a hard boundary and it surprises people. **Clients never log in.** There
is no client app, no portal, no login. The only client-facing outputs are a
printed or emailed progress report. Everything Journey knows about a client
exists so a trainer can coach them better and a leader can keep them.

---

## 4. The twenty minutes

This section is the one to read twice. Almost every design decision in the app
is furniture for the room described here.

### What actually happens

Between machines is **one to two minutes**: get the client off, walk, pull the
selector pin, set the seat and gap and back pad and handle, belt them in, brief
them, start. The iPad is set down constantly — on the floor, on a neighbouring
machine, on top of the machine in use. Picked up, walked, set down, five to
eight times a session.

The trainer looks at the iPad **twice per machine**: once walking up (which
machine, which settings, what weight, how did she do last time) and once walking
away (reps, quality, anything to note). **Twelve touches in a six-machine
session** is the target. Everything else is the client.

In AJ's words: *"The iPad is to act as a guide for the trainer to know what is
happening for today's session and what has happened in previous sessions."* A
guide for set-up and a log for outcomes. Not a script, not a coach.

Walking to the next machine, the trainer needs, in this order, at a glance:
**which machine → its settings → the weight → last time.**

The weight is **pre-filled** with what the client lifted last time, because that
is what she will lift again unless a trainer decides otherwise. The reps are
**never pre-filled** — a faint grey number shows what she did last time, and
tapping Next without typing logs nothing. No set is ever written that nobody
entered.

### The three timers, which are never the same thing

| Timer | What it is | Who moves it |
| --- | --- | --- |
| **Session elapsed** | The whole workout, target about twenty minutes | the session bar |
| **Time on machine** | How long the client was *on* that machine, including getting in and out. Runs only while that machine is current. It is an estimate on purpose — read as "no time on this one, most of the session on leg press," never as time under tension | the app, silently |
| **Set duration** | The actual muscular set or hold | the trainer, by stopping the stopwatch |

Stopping the stopwatch fills the set's seconds. It never touches time on machine.

### The four set outcomes

The single most important data decision in the app. In FileMaker, trainers typed
0, X, "no", or even emojis into a cell, and nobody could ever say what a blank
cell meant. So every planned machine in a session now ends in exactly one of
four states, stored explicitly:

1. **Performed** — a standard set to failure. Counts toward every average and
   toward progression.
2. **Practice** — the client got on the machine for form, blood flow or
   recovery. The data is recorded for history but **excluded from progression
   averages**. A practice set can be linked to the body map, so the record shows
   what was done to help a specific area. When a client is injured the goal is
   to keep them training and work around it, not to stop.
3. **Skipped** — explicitly bypassed today, with a **recorded reason** from a
   fixed list: pain or injury (with the body area), machine occupied, out of
   service, client declined or fatigued, trainer's call, other. Over time the
   reasons themselves become data about why machines get skipped. **When a
   machine is swapped for a substitute, the original is recorded as skipped with
   its reason, not simply removed** — the studio wants to know why the routine
   changed.
4. **Not reached** — the session ran out of time. **Never asked of the trainer**;
   derived silently when the session finishes. Leaders read the clues around it
   rather than making the trainer explain.

**Only "performed" feeds averages, progression and rollups.** When the FileMaker
history is eventually imported, its blank and 0 and X cells all come in as
*Skipped: unknown (FileMaker)*.

### The red kaizen mark

**Kaizen** means "there is always room for improvement." A red mark on a set
means the form needs work. It is explicitly **not** "you did badly."

It's tapped when any of the 4 P's broke, or anything outside the definition of
proper exercise happened: shoulders shrugging into it, breath held, momentum,
cut short, not full range, not maximal effort, tension shifted off the target
muscle.

Three rules about it:

- **One tap, no picker.** There is deliberately no menu for *which* P broke. A
  menu "clutters the system," and the trainer should be watching for all four,
  not filing one. The nuance goes in a note.
- **It's a warning to the next trainer**: be on high alert here.
- **It never moves the weight.** Three reds in a row is something a trainer
  notices and acts on. The app does not.

### Pivots — why "adaptability" is half the product

The routine has a preset order, ideally repeated each session. But the floor is
shared. Another trainer is on the compound row, so seated dip goes fourth and
compound row fifth. Or the client's neck hurts and cervical extension is added.
Or she fell walking the dog and arms are out today.

Trainers adjust routines, settings and order **constantly**, and **none of it
writes back to the client's routine**. It is today's order only. Permanent
routine changes happen in one place — the client's profile — and nowhere else.

On the iPad, reordering is behind an explicit toggle mode, because: *"I don't
want to pick up the iPad and accidentally swap the order of all my machines."*

### Cold starts

A trainer is often on their *second* session with a fifty-session client — days
off, holidays, a full book. The questions before a session with someone new to
them: will she follow the 4 P's, does she hold her breath, does she use
momentum, does she let the weight crash, does she have anything medical that
puts her at risk.

Red flags get **a small marker at the top, tappable for more, never a blocking
dialog.** *"I really don't want clutter."* Nothing may slow down starting a
session.

---

## 5. The app, screen by screen

### How it's put together

There is no router. One piece of state decides which screen renders, and a
second one decides which bottom navigation you see. There are three **app
modes**: **Trainer**, **Operations** (studio leaders and above), and **Admin**
(administrators and the founder only).

The trainer's bottom bar: **Hub · Client · Start Session · Learning · My Studio ·
Calendar.**

### The Hub

The trainer's home. Today's studio timeline by trainer, a day strip with booking
counts, client search. It lands on *now*, and each booking carries markers rather
than the generic word "session" — consultation, first session, milestone,
birthday, back after a break, away, medical, renewal due.

### The client profile — four tabs

The client's dossier, and the most-used screen off the floor. Four tabs, each
with a sticky sub-toggle underneath:

| Tab | What's in it |
| --- | --- |
| **Journey** (default) | The machine-by-session grid — every machine she has performed, in order. This is the direct heir of the one FileMaker screen everyone liked: eleven days of sessions and every machine on one screen. The density is the point |
| **Programming** | What she is prescribed and how it's set up: Routine A, Routine B, her machines, and Setup. **The only place a routine is permanently changed** |
| **Notes & Profile** | Everything written down and who she is — the journal, FORD, her record, body composition |
| **Activity Archive** | Every visit as a calendar and a list, the trends, and the filed reports |

The header carries **Start Session** as the hero action, a toggle that adds the
client to the trainer's **Kaizen Roster** (a personal watch list, each entry with
a reason), and a package tile that opens the renewal card.

**FORD** — Family, Occupation, Recreation, Dreams — is the personal detail a
trainer learns about a client and the studio uses to keep them. It has
structured fields *and* a dated timeline of mentions, it lives strictly on the
client's record for privacy, and "Dreams" is kept separate from the clinical
goal. It feeds a studio **Delight queue**: small gestures a studio can make for
a client, with someone taking each one.

### The Active Session

The floor screen, and the one everything else is subordinate to. In sequence:

1. **Briefing** — who this is, critical notes, the goal, today's focuses, today's
   routine and sequence, a check-in. Then START.
2. **The live tracker** — a session bar with the timer, the grid's live column,
   and the **Now Bar**. The Now Bar is about *now*: the machine in hand, its
   settings, its weight, and a grey ghost of last time's reps. History lives in
   the chart above, not pinned to the bottom. In landscape, the Now Bar moves to
   a right-hand column.
3. **Ending** — **End Session never refuses.** If machines were begun but not
   counted, it lists them with Practice · Skipped · Not reached and lets the
   trainer choose. It confirms; it does not wall. On the last machine there's no
   dead-end banner — there's "Add another machine," because trainers do, and End
   Session stays at the *top* where a thumb reaching for Next can't hit it.
4. **Post-session** — about thirty seconds. Instant scannable results ("8%
   increase today"), a Feel toggle, a closing note, an optional quick check-in,
   and — when it's time — "Renewal: 9 left. Talk about it today?" with a
   fifteen-second form for what the client said.

Notes mid-session are a known hard problem. There are five different things a
trainer wants to write during a set, none of which can wait and none of which
may take them off the tracker: this client on this machine; this client before
next session; a private reminder; something for the team; a request to look at
the routine together. The rule is **capture now, file at teardown** — and a draft
has to survive being closed and reopened.

### Learning

One tab, three parts: a front page with a single search, **the Catalog** (the
studio's floor, all MSF machines, notes, tips, comments) and **the Academy**
(the training method itself, generated from the company's source material). A
machine's Catalog page also carries **How it's used** — what clients across the
company are set to on that machine and what they lift at each value.

### My Studio

The bottom-bar tab where a studio is *run*. Four sections:

- **Relay** — the studio's shared board. Floor · Mine · Notes · Network. Team
  jobs (one job, several people, parts, a due day), personal reminders, kudos,
  private notes that can be shared. It used to be called the To-Do, then the
  Planner. AJ's own brief suggested "Studio Command Center" and asked for
  something less corporate; Relay was the pick.
- **Machines** — the studio's floor, what's new in the MSF standard, each
  machine's door, and "Offer to the MSF catalog."
- **Team** — who's in, this studio's staff, letting people in, handing out the
  grant.
- **Studio** — the studio's own record: details, the Mindbody link, its day, its
  renewal settings, its own notices.

Two rules govern Relay. **Nothing pings anyone** — the Pulse, kudos and hand-offs
are in-app, and a bell rings only for what a person opted into. And
**recognition, never ranking, inside a studio** — kudos are shown per person to
leaders and to that person; no points, no badges, no per-person streaks, no
leaderboards among trainers. Studios may be ranked against each other; people
inside a studio may not.

### Operations

The studio-management area, for studio leaders and above. The governing line is
AJ's:

> **"My Studio is where you run the studio; Operations is where you look at it."**

A studio's own settings live in My Studio, once. Operations shows and points; it
does not edit them a second time. (One deliberate exception: Operations → Floor
mounts the *same* floor editor as My Studio → Machines. One implementation, two
doors.)

Nine tabs: **Overview · Renewals · Delight queue · Floor · Staff & Roles ·
Insights · Announcements · Mindbody · Data.** One control at the top — "Looking
at: this studio / all my studios" — that every tab reads.

The **Overview** is the first screen, and AJ was specific: *"not the Monday page
— studio management opens this every day."* It's shaped around time rather than
around questions: today, what needs you, the next three days, the week.
**Nothing on it is a score.** Every panel is a sentence with its proof, an action
(Acknowledge, Snooze, Dismiss, Got it) and a door into the tab that owns it.

Behind it sit the four questions a studio leader must be able to answer on a
Monday morning without asking a single trainer:

1. **Upcoming renewals and conversation status** — the highest business
   priority.
2. **Attendance anomalies** — clients on an extended break or training
   erratically.
3. **Performance discrepancies** — a client who drops from ten reps to five.
4. **Pain and incident reports** — instant visibility of any reported injury.

### The Admins dashboard

Everything corporate-only, for administrators and the founder: **All locations ·
Catalog · Standard template · Limbo · System tools · Bug reports · Data.**
"Limbo" is where Mindbody events land when the app can't match them to a studio,
waiting for an admin.

### Demo Mode

A practice studio. The design decision worth knowing: **the demo studio is a
real studio**, at a fixed id, flagged as demo, with its data in the ordinary
collections. Every screen works inside it with no second code path — because a
parallel fake data layer means a second code path through every screen, and
within a month the demo would be showing a version of the app that no longer
exists.

What keeps it separate is a realm rule rather than a wall: **from inside Demo
Mode you see Demo Mode and nothing else; from anywhere else you don't see it at
all.** Everyone has the run of it. Its clients are named after characters from
The Lord of the Rings, they lift plausible weights, and the whole thing is built
and reset by one button.

---

## 6. Where the data lives

### Four systems, and who wins

| Data | Owned by |
| --- | --- |
| People, contact, status | **Mindbody** |
| Bookings and attendance | **Mindbody** |
| Contracts, memberships, autopay, packages | **Mindbody** |
| Workouts, sets, weight, reps, quality | **Journey** |
| Machine settings per client | **Journey** |
| Coaching notes, focuses, check-ins | **Journey** |
| Body composition | **InBody** (typed in from the printout) |
| History before the cutover | **FileMaker** |

The rule: **Mindbody owns identity and money; Journey owns coaching.** Journey
reads Mindbody and never writes to it. A client's record in Journey is keyed by
their **Mindbody client id** — Journey never matches people by name, ever. And
Journey never invents a Mindbody-owned date; if it has to estimate one, it
stores a marker saying so and the screen says so too.

### Everything connects through the client

The useful mental model is a loop. Mindbody syncs people and bookings in. The
Hub shows today's schedule. A booking opens a client profile. The profile opens
a briefing. The briefing starts a session. The session produces sets and notes
and a post-session record. All of it lands back on the client, and the
Operations dashboard reads what sessions produced.

Every screen either prepares a session, records one, or reads what sessions
produced. Anything that doesn't sit on that loop has to justify itself.

### Every number has a reader

A standing rule, in AJ's words: *"we need to evaluate all the data we collect and
make sure each piece of data is being funneled through at least one metric
viewer. numbers are data and data is money."*

Which becomes: **a field the app writes must be read by at least one screen,
report or job.** And — importantly — **a write with no reader is a bug to fix,
not a field to delete.** The default response to "nothing reads this" is to
build the screen that should. Deleting is the answer only when nobody can name
the question the field answers.

The live example: every completed session stores who the client *was at that
moment* — age, occupation, whether retired, activity level, clinical profile.
Nothing reads them yet, and that's the gap, not the fields. They exist so the
company can eventually answer questions no single client's history can: what
weight do people of a similar age and activity level actually start at on this
machine; which machines suit whom; what is the average strength gain per cohort;
*"our retired clients see an average strength increase of x%."* They are a
snapshot rather than a lookup because those facts change, and reading today's
client record to explain a session from three years ago would quietly re-label
the past.

Any cohort metric has to keep four rules: a named minimum sample or the screen
says "not enough data yet"; cells anonymous at five people, never a third key;
clinical data never shown against one person in anything a signed-in trainer can
read; and never rank people inside a studio.

---

## 7. The migration — the single most important assumption

**Journey is not a fresh start.** This is the assumption most likely to make a
screen lie, and it's worth its own section.

The founding studio has been open for over twelve years — longer than the
FileMaker system it currently runs on, which itself replaced something earlier.
Journey is the **third** system these clients' histories have lived in.

The rollout is a long migration, not a launch. FileMaker stays in use throughout
beta. Not every studio and not every session moves at once — it's a deliberately
slow transition so trainers get comfortable. Tenured corporate studios first,
franchisees gradually afterwards. Throughout that period, a studio's roster is a
mix of: brand-new clients with a real session 1 in Journey, clients with about
fifty sessions behind them, and clients with **several hundred**.

So:

> **A client's history did not begin when Journey first saw them.**
>
> An empty Journey history means "we have no detail here" — never "this never
> happened."

Concretely, a screen must not call a client new off a low count, draw a trend
starting at the cutover and present it as the client's whole story, say "never
tried" about a machine whose history is in FileMaker, or celebrate "Session 50"
computed from Journey's rows alone. Sessions are numbered from the *total*, so a
long-standing client's next session is #413, not #4 — the number the client
would recognise.

The app handles this with a **prior history record** on the client: how many
sessions happened before the cutover, how many of those have since been imported
as real rows, the date range, the source, and who said so. The arithmetic is one
line: *total = what Journey can see + the part that exists only as a number.*
The automatic reconciler owns what Journey can see; the prior record owns what
it cannot; they never write the same field.

And there's a wording rule that tells you how seriously this is taken. For a
machine with no data:

- Client whose whole history is in Journey → **"Never attempted"** (a real fact
  about them)
- Client with history before the cutover → **"Nothing recorded"** (a fact about
  our records)
- Nobody has said which → **"Nothing recorded"** — the cautious wording wins

**The FileMaker export has been requested and not yet received.** How much can
be migrated, and in what shape, is unknown. Everything downstream of it is
waiting.

---

## 8. The rules the app is built on

These are the product invariants. A code review checks against them, and they
are the fastest way to understand why a given screen looks the way it does.

**The north-star test**, which every feature is judged by, has two halves and
needs both:

> **Flawless continuity.** Any trainer can pick up an iPad, open any client at
> their studio, see exactly what that client needs to do today, and run the
> session perfectly — using only what is in the app.
>
> **Ruthless adaptability.** The app never forces the trainer down a rigid path.
> If a machine is occupied, if the client arrived late, if today is a
> form-practice day, the trainer pivots and the app's tracking follows without
> breaking.

A screen that gives continuity but fights the trainer fails. A screen that's
flexible but leaves the next trainer guessing fails.

Then:

1. **Eyes on the client.** During a set the app asks for a few taps at most.
2. **Never block a save.** No missing data point stops a session from being
   finished. Confirm, never wall. Related: the app deliberately does **not**
   track "which trainers aren't writing notes." A veteran client with perfect
   form needs no note, and measuring note-writing would produce notes instead of
   coaching.
3. **Mid-session changes are temporary.** Order, count and choice of machines
   during a session never write back to the routine.
4. **Every planned machine ends in one of four explicit states**, and only
   *performed* counts toward anything.
5. **Finish Session saves the core first.** Feel, notes and check-ins are
   appended afterwards and never delay the next client.
6. **Sentences, not scores.** Every claim a leader's screen makes has a named
   minimum sample; below it the screen says "not enough data yet." **A confident
   wrong number is worse than a missing one.**
7. **Clients are never contacted by the app.** In-app only, always.
8. **Mindbody owns identity and money; Journey owns coaching.**
9. **A client is never more visible than their studio**, and health data is
   never more visible than the client.
10. **A franchise owner sees only their own studios.** (Designed, not yet fully
    enforced — see Section 10.)
11. **Nothing ships unreachable.** A screen nothing navigates to is deleted or
    connected in the same round it's found.

Two more from the design side. **Anything a trainer rates about a client is the
Dial; anything they write carries a Loudness.** There is one rating control and
one priority vocabulary in the whole app, and no screen builds another. And
**iPad-first, portrait and landscape** — nothing tappable under 40 pixels, hover
is never the only way to find something, and names are never truncated.

---

## 9. The vocabulary

**People and places**

| Term | Meaning |
| --- | --- |
| Life Transformer | A trainer |
| Studio Leader / Head Trainer | Runs a studio |
| The grant | Permission given to a trainer to help run their studio |
| Home studio | Where a client is billed and mainly trains |
| Cross-train | A client approved to train at another studio |
| Snowbird | A client away part of the year who comes back — an away event, not a lost client |

**Training**

| Term | Meaning |
| --- | --- |
| Continuous tension | The protocol: slow, smooth, no pause or acceleration at the turnaround |
| Single set | One set per exercise, to or near muscular failure |
| TUT | Time under tension |
| TSC | Timed Static Contraction — effort against a locked arm, no movement, no load held |
| Static Hold | Holding a load still |
| The 4 P's | Posture, Path, Pace, Purpose |
| Kaizen | "There is always room for improvement" — the red mark on a set |
| Rep quality | Max Strength (perfect), Completed, or needs improvement |
| "G9 S8" | Machine-settings shorthand: Gap 9, Seat 8 |

**Packages**

| Term | Meaning |
| --- | --- |
| The Trial / Committed / Life Transformed | The 6-, 12- and 18-month packages (48 / 96 / 144 sessions) |
| Prepay, PIF | Paid in full, at a lower rate per session |
| Banked sessions | Sessions still held when payments finish. They never expire |
| Will bank / will run out | Billing ends with sessions unused / sessions run out before billing ends |
| Lapsed | Past the studio's lost rule with no new package — the win-back list |
| Renewal on the books | The next package already signed while the current one runs |

**Screens and features**

| Term | Meaning |
| --- | --- |
| Hub | The trainer's home screen |
| Journey Grid | The machine-by-session grid, historical and live |
| Now Bar | The fixed bar in a live session: this machine, its settings, its weight |
| Briefing | The pre-session screen |
| My Studio | Where you run a studio: Relay · Machines · Team · Studio |
| Relay | The studio's shared board (was the To-Do, then the Planner) |
| Operations | The studio-management dashboard — where you *look at* a studio |
| Admins dashboard | The corporate-only area |
| The Dial | The one rating control. Five positions, centre = this client's usual, untouched = not asked |
| Loudness | The one note-importance vocabulary: Note · Heads up · Critical |
| Pulse | The living assessment of how a client is doing |
| Kaizen Roster | A trainer's personal watch list of clients, each with a reason |
| Kaizen Deep Dive | The clinical review report |
| Delight queue | The studio's list of small gestures for clients |
| Machine fit | Predictive machine set-up from similar clients' settings |
| Learning | The Catalog (machines) and the Academy (method) |
| Limbo | Mindbody events the app couldn't match to a studio |
| FORD | Family, Occupation, Recreation, Dreams |

**Mindbody**

| Term | Meaning |
| --- | --- |
| Site | One Mindbody business account. MSF has two |
| Location | A studio inside a site |
| Contract | An agreement billed on a schedule |
| Pricing option | A package of sessions bought, with a count and a remaining number |
| Webhook | Mindbody telling the app something changed, rather than the app asking |

---

## 10. Where the project actually is

### The stages

| Stage | Who's on it |
| --- | --- |
| **0 · Pre-alpha — now** | AJ alone, working against production data. No trainers |
| **1 · FileMaker migration** | Blocked on an export that hasn't arrived |
| **2 · Beta** | A few studios. Tenured corporate ones first, select franchisees gradually |
| **3 · Launch** | All ~40 studios |
| **4 · Scale** | Toward ~100 locations |

**What "pre-alpha" means in practice for how the work is done:** because nobody
is using the app for real, the ceremony stays light. Changes get made rather
than staged behind dry runs and confirmations. Known security gaps are left open
by decision — every user is verified by hand, so the risk is a mistake rather
than malice. All of that flips the day trainers start running sessions.

### What's built

A great deal. The floor loop, the four set outcomes, the client profile's four
tabs, FORD, Pulse and the Dial, the renewals engine and pipeline, InBody entry,
machine fit, Relay, My Studio, Operations and the Admins dashboard, the Catalog
and Academy, machine authoring with the corporate/studio template boundary, and
Demo Mode. Roughly 950 TypeScript files and about 3,700 tests.

### What's open

- **The FileMaker export.** Everything about historical data waits on it.
- **The franchise partition.** The security rules currently treat a franchise
  owner as company-wide; scoping them to their own studios is a known, designed,
  not-yet-built item, and it has to land before the first franchisee is on the
  app.
- **Three deliberate write holes**, left open through pre-alpha and revisited
  before the first franchisee.
- **A full database wipe still runs from the browser** on one confirmation.
  Acceptable now, must not survive into beta.
- **Offline behaviour** hasn't been decided or tested. The one thing that must
  never be lost is a set a trainer just logged.
- **What a trainer does when Mindbody is down**, or when a walk-in isn't in it.
- **The iPad walkthrough.** Much of what's been built recently has not yet been
  used on an actual iPad on an actual floor. That gap is real and worth knowing
  about — a green test suite does not mean a screen works in a hand.

### How the work gets done

Work happens in **rounds**. A round starts from a brief — often a long document
AJ writes after auditing a screen — becomes a branch with one commit per phase
so any phase can be rolled back alone, and ends with a round document recorded
in the repo. Every push to the main branch deploys to the live app, which is
why deploys get announced.

---

## 11. What Journey is deliberately not

These are settled "no"s. Reopening one is a decision, made and dated, not a
suggestion accepted in passing.

| Not building | Note |
| --- | --- |
| **Client logins or a client portal** | Clients are not users |
| **Any automated outreach** | No email, no SMS, no push. Nothing in Journey contacts a client *or* a trainer. The app prepares the people who do the contacting |
| **Managing Mindbody** | Journey reads it and never writes to it. No booking, billing or payments |
| **Nutrition tracking** | Beyond a few self-reported fields in the check-in |
| **Wearables** | — |
| **AI coaching** | — |
| **Anything for a company other than MSF** | Journey is built for one franchise |

And one that isn't on the list but behaves like it: **the app never suggests a
progression.** It makes the consequence visible and lets a human decide.

---

## 12. How to be useful in a conversation about this

### What you can do well from here

- Explain how any part of the app works, and *why* it's shaped that way — the
  "why" is usually in this document, and it's usually the more useful half.
- Pressure-test a new idea against the invariants in Section 8 and the fences in
  Section 11. The most valuable thing you can say is often "that conflicts with
  X, here's the tension" — early, before it's built.
- Help him explain the app to someone else: a trainer, a franchisee, a new hire,
  an investor. Ask who the audience is first, because the pitch to a trainer and
  the pitch to a franchisee are different products.
- Reason about a reported behaviour — "a trainer says X is happening" — as far
  as the design goes, and name what would need checking in the code to confirm
  it.
- Ask the question behind the question. A feature request usually carries three:
  which tier does it belong to, which moment on the floor does it serve, and
  which fence does it touch.

### What to be careful about

- **Don't invent code.** No file names, no function names, no line numbers, no
  "in your `SessionTracker` component." You do not have the repository. Say so
  and work at the design level.
- **Don't treat this document as current.** Check the date at the top. If he
  describes something differently, he's right.
- **Numbers here go stale fastest.** Prices, client counts, test counts, tab
  counts, what's built. Treat them as "roughly, as of September 2026."
- **Don't reach for the generic fitness-app answer.** Most of what's true of
  fitness apps is false here: no client login, no progression algorithm, no
  streaks or badges for trainers, no push notifications, no wearables, twenty
  minutes not sixty, one set not five. If an idea would be obvious advice for a
  normal gym app, check it against Section 11 before offering it.
- **"Sentences, not scores" applies to you too.** If you don't have enough to
  answer, say what you'd need. A confident wrong answer is worse than a missing
  one — that's the app's own rule and it's a good one for this conversation.

### Good questions to ask him

When he brings a new idea: *which moment on the floor does this serve — during
the set, the thirty-second teardown, the pre-session review, or off-floor?*
That ranking decides how much polish it earns, and it's the question the project
already uses.

When he's stuck: *what does the trainer see, holding the iPad, at the moment
this matters?* Most of this app's good decisions came from answering that
literally.

When something feels off: *is this a My Studio thing or an Operations thing?*
Running it versus looking at it is the cleanest dividing line in the product, and
a surprising amount of confusion dissolves once it's applied.

---

*End of briefing. Written 20 September 2026 from the Journey System codebase and
its product documentation.*
