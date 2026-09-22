# The floor — what a session actually is

AJ's own account, Sep 18 2026 (`For Clarity 2`), distilled. **Read this before
touching the Active Session, the Now Bar, the briefing or the post-session
screen.** Every one of those screens is furniture for the room described here.

## The definition everything rests on

AJ, Sep 21 2026. **This is the source. If it is not within this definition, it
is not true exercise** — and almost every rule in the app is one clause of it
made concrete, so a change is often best rejected by naming the clause it
breaks rather than describing the symptom.

> "Exercise is a process whereby the body performs work of a demanding nature,
> in accordance with muscle and joint function, in a clinically-controlled
> environment, within the constraints of safety, meaningfully loading the
> muscular structures to inroad their strength to stimulate a growth mechanism
> within minimum time."
>
> — Ken Hutchins

| Clause | What it built |
| --- | --- |
| *work of a demanding nature* | One set to failure; and why **performed** is the only outcome that counts toward an average (`src/lib/set-outcome.ts`) |
| *in accordance with muscle and joint function* | The musculature, movement pattern and kinematics on every machine — the method tier head office owns (`src/lib/machine-template.ts`) |
| *in a clinically-controlled environment* | Sentences, not scores. No hype, no celebration, and never a confident wrong number |
| *within the constraints of safety* | Safety is add-only: a studio may add a warning, never remove one. A never-to-failure machine must carry the reason why — an unexplained prohibition gets ignored |
| *meaningfully loading the muscular structures* | The weight and the settings on the Now Bar. The machine is almost never already right when the trainer walks up, so the load is stated, never assumed |
| *to inroad their strength* | Rep **quality** as the measure, not rep count — how many *good* reps it took. The red kaizen mark is reserved for exactly this |
| *to stimulate a growth mechanism* | Why a **practice** set is recorded in full and never averaged: it is movement, and by this definition not exercise, so it must not move a number that claims to measure exercise |
| *within minimum time* | Twenty minutes, five to eight machines — and the Rank 1 rule that nothing may be added during a set without removing something. The clause *is* the constraint |

## The twenty minutes

A client comes twice a week for **~20 minutes** (15–30 in practice) and does
**one set to failure on five to eight machines**. Slow, controlled, continuous
tension; open breath; no resting inside the set; the weight builds gradually
rather than being jumped into. The trainer runs *all* interaction with the app
so the client keeps absolute focus.

The trainer carries three things: a **mechanical clicker** (counts reps *and*
is the client's audio cue — done by hand, never by the app), a **stopwatch on
a lanyard** (optional — not every trainer uses one, and the in-app stopwatch
exists precisely so nobody needs a third-party timer), and the **iPad in the
non-dominant hand**. The iPad is set down constantly: on the floor, on a
neighbouring machine, on top of the machine in use. Picked up, walked, set
down, five to eight times a session.

Between machines is **one to two minutes**: get the client out, walk, pull the
selector pin, set the seat / gap / back pad / handle, belt them in, brief them,
start. The trainer looks at the iPad **twice per machine**: once walking up
(*which machine, which settings, what weight, how did she do last time*) and
once walking away (*reps, quality, anything to note*). **Twelve touches in a
six-machine session** is the target. Everything else is the client.

## What the app is, in a session

> "The iPad is to act as a guide for the trainer to know what is happening for
> today's session and what has happened in previous sessions."

A **guide for set-up and a log for outcomes**. Not a script, not a coach. It
says which machine is next, what settings, what weight, what she did last time,
and anything a previous trainer flagged on that machine ("holds her breath
here"). Then it takes what happened. The catalog and the analytics are for off
hours.

**The app never decides a progression.** The 8–12 rule — over ten reps and
approaching fifteen, the weight goes up; under eight, it may be too heavy —
is a heuristic the trainer applies with judgement that depends on the trainer
and the client. The app's job is to make the *consequence* visible: "that was a
12% increase", "up 40% over 90 days", and to let a leader find a plateau and
ask why. Never a suggestion to move the weight.

## The protocol, and what is recorded

Weight and reps are recorded because they are what can be recorded. The muscle
only cares about **time under tension**, but true TUT is near-impossible to
capture by hand, so:

- **Weight** is the most important recorded value — it is what progresses.
- **Reps** vary day to day (sleep, stress, meals, time of day). The goal is
  failure somewhere around 8–10; some clients fail at 13, some at 8. **The rep
  count is never the target.**
- **Quality** — did every rep keep the **4 P's**: Pace, Posture, Path, Purpose.
- **TSC / static hold**: the "reps" are seconds. The in-app stopwatch writes
  straight into that field when stopped.

### The three timers, which are never the same thing

| Timer | What it is | Who moves it |
| --- | --- | --- |
| **Session elapsed** | Wall clock for the whole workout, target ~20 min | the session bar |
| **Time on machine** | How long the client was *on* that machine — includes getting in, briefing, getting out. Runs only while the machine is current, pauses with the session, follows the machine when the order changes (tracker round, Sep 13; `src/lib/machine-clock.ts`). It is an estimate on purpose — a trainer reads it as "no time on this one, most of the session on leg press", never as TUT | the app, silently |
| **Set duration** | The actual muscular set or hold, from the stopwatch | the trainer, by stopping the stopwatch |

Stopping the stopwatch fills the set's seconds. It never touches time on
machine.

## The red kaizen ring

**A judgement about that set, not about the client that day.** Tapped when
any of the 4 P's broke, or anything outside Hutchins' definition of exercise
happened: shoulders shrugging into it, breath held, momentum, cut short, not
full range, not maximal effort, tension shifted off the target muscle. Not
tapping is fine — a completed set that did not reach failure is still
"completed"; neither ring nor star is required.

- **One tap.** No picker for *which* P. AJ: a menu "clutters the system";
  the trainer should be watching for all four, not filing one. The nuance goes
  in a note, and most of the time a red ring comes with one.
- **It is a warning to the next trainer**: be on high alert here.
- **It never moves the weight.** Three reds in a row is something a trainer
  notices and acts on; the app does not.

## Machine pivots

The routine has a preset order, ideally repeated each session, but **the floor
is shared**: another trainer is on the compound row, so seated dip goes 4th and
compound row 5th. Or the client's neck hurts so cervical extension is added. Or
she fell walking the dog and arms are out today. Trainers adjust routines,
settings and order **constantly**. None of it writes the routine — it is
today's order only (routines stay profile-only; AJ declined "save as Routine
A/B" on Sep 13).

What AJ wants (Sep 18): **a toggle mode in the grid itself**. In it, machines
are dragged by their *name*; tapping does not open notes; adding a machine is
the existing all-machines list and a plus. Out of it, nothing can be dragged —
"I don't want to pick up the iPad and accidentally swap the order of all my
machines." Moving a machine must not move its time.

## Notes, mid-session

Five different things a trainer wants to write during a set, none of which can
wait for the session to end and none of which may take them off the tracker:

1. this client, on this machine — "form breaks at the turnaround"
2. this client, before next session — "ask about the knee"
3. a private reminder — "I need to remember this; the studio doesn't"
4. to the team — "we should push this client harder"
5. a request — "this routine isn't working; let's look at it together"

The quick note at the top of the session already exists. What it needs: **a
draft that survives**. Start writing, close it to spot a set or read the chart,
reopen and continue. At the end, if something is written and not saved, the
post-session screen says so and lets the trainer finish it or drop it.

## Cold starts

A trainer is often on their *second* session with a fifty-session client —
days off, holidays, a full book. The questions before a session with someone
new to them: will she follow the 4 P's, does she hold her breath, does she use
momentum, does she let the weight crash, does she have anything medical that
puts her at risk. A trainer today reads 7–20 past sessions and the notes,
the goal, recreation and occupation, to answer those.

Red flags: **a small marker at the top, tappable for more, never a blocking
dialog.** "I really don't want clutter." Nothing may slow starting a session.

## Where the eye goes

Walking to the next machine the trainer needs, in this order, at a glance from
a held or set-down iPad: **which machine → its settings → the weight → last
time**. The chart at the top shows every machine and every session ("the
layout is perfect"); the **Now Bar is about now** — the machine in hand, its
settings, its weight, a grey ghost of last time's reps. Nothing historical is
pinned to the bottom beyond that ghost; history is the chart.

Weight is **pre-filled** with what she lifted last time — that is what she will
lift again unless a trainer decided otherwise. Reps are **never pre-filled**:
a faint grey "9" says what she did last time so the eye can stay at the
bottom, and tapping Next without typing logs nothing — no set is ever written
that nobody entered.

On the last machine: no dead-end "last machine" banner. **"Add another
machine"** — because trainers do — and **End Session stays at the top**, where
a thumb reaching for Next cannot hit it.

## What FileMaker taught them to hate

Slow to load. Slower with every machine and every session on screen. Zooming
reloaded the page. Creating a note or changing a setting was hard enough that
trainers stopped recording when the app got between them and the client.
Twelve years of pen and paper, then a digital copy of the paper.

> "We need the app to be able to act as pen and paper in terms of reliability."

And the reason for all of it: FileMaker collected hundreds of sessions a week
and did nothing with them. This app is meant to use that data — to make the
studio "perform in a way that no other studio can".
