# The floor — what a session actually is

AJ's own account, Sep 18 2026 (`For Clarity 2`), distilled. **Read this before
touching the Active Session, the Now Bar, the briefing or the Wrap-up (the
post-session screen).** Every one of those screens is furniture for the room described here.

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

## The format's one disadvantage, and what answers it

AJ, Sep 21 2026. Twenty minutes, twice a week, one-on-one only. There is no
class, no lounge and nobody hanging around afterwards, so **a studio in this
format has almost no natural opportunity to build community.** The
relationship therefore gets built on purpose, in the minutes on either side of
the set — which is what the pre-session briefing and the post-session Wrap-up
are really for, as much as the coaching.

**FORD** (Family, Occupation, Recreation, Dreams) is the frame for what to
collect, and the **Delight queue** is where knowing turns into doing. Read
`src/features/ford/README.md` before touching any of it. The rule that falls
out of this, and that explains an otherwise odd product constraint: **the app
never contacts anyone.** FORD surfaces a moment to a person and a person acts
on it — an automated "happy anniversary" would be the precise opposite of
going above and beyond, because it proves nobody remembered.

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

**The app never decides a progression.** Failure inside **6–10 reps** is the
range the protocol advises (AJ, Sep 22 2026); over it the weight goes up, under
it it may be too heavy. It is a heuristic a trainer applies with judgement, and
the judgement is the point: **some clients reach failure at three reps and some
not until fifteen**, by client type, preference or history, and the protocol
bends to them rather than the other way round. The app's job is to make the *consequence* visible: "that was a
12% increase", "up 40% over 90 days", and to let a leader find a plateau and
ask why. Never a suggestion to move the weight.

## The protocol, and what is recorded

Weight and reps are recorded because they are what can be recorded. The muscle
only cares about **time under tension**, but true TUT is near-impossible to
capture by hand, so:

- **Weight** is the most important recorded value — it is what progresses.
- **Reps** vary day to day (sleep, stress, meals, time of day). Every set aims
  at failure, advised inside 6–10 — but a client who fails at 3 and a client who
  fails at 15 are both training correctly. **The rep count is never the
  target**, and no screen may treat the advised range as a rule.
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
Wrap-up says so and lets the trainer finish it or drop it.

## The Wrap-up

The screen after Finish walks the client out: a plain congratulation picked
for the session, today against last time, the next session's weights, the
effort Dial, the Profile note, Pulse and, when it's time, the renewal line.

**The order, Oct 9 2026** (the floor round, AJ's "3a"; `docs/rounds/2026-10-09-floor.md`).
The cards run in the order the trainer acts: **Today**; **How it went**, the
journey's one sentence (read out while the client is still there) and where
the work went; the **next session's weights** and **Next time**; **Effort ·
profile note · Pulse**; and **Next**, the booking, last. The journey says
"Couldn't read the earlier sessions here. The trend is on the profile." when
the iPad never heard the server's answer for them, never "not enough
history", and Today never calls a machine a first time off that partial copy:
a failed read is "can't tell". The Finish question before it asks "Finish
{first name}'s session?" in one line, opens on that line rather than the note
box (whose focus raises the keyboard), and its link says Scrap session.

**The Atlas answers, Oct 2 2026.** The title is one of a few generic
congratulations (AJ: "a few generic 'congratulations' messages that it
randomly picks"), never a judgement of the session. **The next session's
weights**: one row per machine she performed, starting at today's weight, with
− / + in two pounds and the number to type; whatever the trainer sets is what
the next session loads, by any trainer at any studio, and the Now Bar says
who set it ("Set for today at the last Wrap-up by Sam."). It is spent once a
session logs the machine (`src/features/next-weight/`). The app still never
suggests a weight, and the old advice line under the dose ("room to add a
little next time") is gone. **The effort Dial** replaced the dose Dial: one
rating for the whole workout, Left some in the tank · Held back a bit · As
expected · Pushed hard · Gave everything, neutral (no green, no red). AJ's
call: left untouched it saves "As expected", marked `effortDefaulted` so the
Deep Dive's "Effort, lately" never counts a default toward a decline.

The
End Session box is the Note for the next trainer, for the next briefing; it
comes back in the Wrap-up's To-file tray so it can also be filed to the
profile, and it is never discarded there (AJ, Sep 27 2026: "Ideally the end
session note is made for the next sessions pre session briefing but also can
be filed to the profile").

**Her next session, and Times with room** (the Openings round, Sep 27
2026). The trainer is the one with the client right after a session, and AJ:
"if a client's next session is not booked, the wrap up could offer a door to
openings." The Next card asks the server for her own bookings from now on, so
a booking ten days out, or at Strongsville, counts ("Next session: Tue, Oct 6
· 8:00 AM at Strongsville."), and it never says a plain "Nothing booked yet":
it says how far it looked ("Nothing booked in the next 30 days. Book the next
one before they leave.", or 7 days when the month wasn't read in full today),
"Checking the next booking…" in the space the answer will take, or "Can't
check the next booking right now." Inside that line sits the door to **Times
with room**: quiet on every Wrap-up with something to offer, prominent only
when nothing is booked, and never there before the studio has times to offer.
It opens a sheet on top of the Wrap-up (the Profile note is never lost) with
times only, never a name and never why a time is free, so the iPad can be
turned to her; it ends "Check it in Mindbody before you promise it. Journey
doesn't book." The card is a rank 2 screen, so none of this is waited for:
the reads run in the background, and the door arrives inside the space
already kept for the line, so nothing moves under the trainer's finger.

**The confetti stays** (AJ, Sep 27 2026: "I like it keep it", answering
question 8 of the Sep 21 audit). It is the one deliberate exception to "no
hype, no celebration" above: a short burst as the screen opens, a little
over a second, that never blocks a tap and never repeats, in the app's own
colours.

Since Sep 27 2026 the whole Wrap-up **follows the app's theme**. It is no
longer drawn dark in both themes, its Dial, Loudness and trays included, and
it speaks the app's look: the codex's page title, small upright capitals on
its card heads, bold sentence-case buttons, the brand-blue focus ring, and
"Where the work went" in sky, amber, the strong neutral and grey, never the
hero orange or the brand blue.

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
