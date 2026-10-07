# The first session, and a routine's plan (research and structure, Oct 7 2026)

**Status: compiled, not built.** AJ asked for the research and the structure
gathered and organised, with the screen design saved for a later round:
"compile all the information so that way we organize and ready to go. So you
can build like the structure of it, but we don't really need to go into the
deep design UI of it." Nothing in `src/` changed in this round.

Branch `oct7/first-session` (this document only), on master's `cf4a2ff8`.

---

## 1. What AJ asked

> "We need to optimize how easy it is to simply get onto a new client, pick a
> starting routine and do the session. This is what I would say where
> FileMaker excelled at, because realistically, you could just open the app,
> despite the long loading time, click onto a client's profile, and it
> immediately start doing the session. The things that it lacked, though, was
> the ability to give you settings to do that session with. Currently, when I
> load up a session in our app, because there are no previous sessions in that
> history, there's no cells so it just shows the machine in one long line. ...
> When starting the session, for the client that has no routine built, and no
> previous sessions, the app should suggest the starting routines."

Then, widening it to the routine's whole life:

> "How are we going to modify these sessions in the future? How are we going to
> add the B routine in? And then how are we going to modify both an A and B
> routine? And what happens when a client gets an injury? ... We need a simple
> way to do this."

> "Since we have 20 machines and these 20 machines are realistically
> strategically made to target the body, we don't want to make routines that
> are just willy-nilly. ... We want to have an actual idea to our routine."

> "Say if a client injured their wrist and they no longer can do anything that
> requires gripping, we need to be able to adjust the routines around that ...
> we discovered that the client has very weak delts. What can we do about to
> adjust the routines currently? ... we have all that information within the
> academy. That allows us to be able to build a smart routine builder. So
> understanding why you have a B routine is also important."

## 2. AJ's answers (the interview, Oct 7 2026)

Six questions, one at a time. His words, then what they decide.

**Q1. Two kinds of "no routine".**

> "There's definitely two types of no routine. It's people new to the studio
> and new to Journey. Realistically, since we're following a specific
> protocol, a lot of people have very similar first routine. But since
> everyone is a little bit different in either their size, their starting
> point, or even their experience level, sometimes that first routine can be
> slightly altered. ... new to journey, that's really easy. That's just a plug
> and play type of deal. We already have the setup for that. ... let's really
> focus on new to studio. ... they're going to go through the leg press.
> Possibly the compound row. Also maybe the lumbar. Their first couple
> sessions, they may do all six machines, but ... depending how they are
> learning the protocol, they may only still do a couple machines on their
> first sessions. ... it also could be dependent on the trainer themselves too.
> ... if it is a long-standing, it's no suggestion they're going to go ahead
> and go on their profile, go to programming, fill it in. ... the trainer
> should be able to definitely customize this and change it. Routines need to
> be very modular."

- **New to Journey** (a long-standing client): no suggestion. Programming, as today.
- **New to the studio**: Journey suggests a start (Leg Press plus one more,
  maybe Compound Row, maybe Lumbar), and the trainer changes anything.
- A first session may be two machines or six. Routines are modular.

**Q2. When are a new client's machines decided?**

> "It definitely should be a little bit of both because a lot of times
> trainers are definitely going to be prepping for their session ... so there
> should be something on the profile to ... set up their profile before the
> consult. ... a client walked in and there's free time and it's a potential
> client and the studio leader just so happens to have free time as well. They
> could run a session right then and there on a consult. So it might be smart
> to ... allow trainers and studio leaders just to start that consult and build
> it on the go. Because sometimes we don't really know everything about the
> client ... I want to see how you respond to this a little bit more."

- **Two doors**: prepared ahead on the profile, and a walk-in consult started at
  once and built as it goes.

**Q3. A machine added in the first sessions: does it stay?**

> "A lot of the times when it's the first couple sessions, we're just going to
> be repeating and building off the last session. So realistically, those
> first couple sessions is when the A routine is being built. Some studios may
> start building an A and B routine immediately for a client. So we need to be
> able to have that customization. And also, trainers might just track their
> own progress and their own workouts. So we need to be able to essentially do
> routine-less workouts that still might follow a routine, but might just kind
> of go free form. Because it's like, hey, I'm working out a friend or family
> member ... I just want to practice training ... not like a demo mode
> training. But it's more like just working in honing the craft."

And, on the Wrap-up (given with his answer to Q4):

> "Kind of like having the idea in the wrap-up that it just by default adds on,
> but you can say, like, tick it off for, like, oh, let's take it out the last
> time."

- **The Wrap-up adds on by default**: today's machines join the routine for
  next time, each with a tick the trainer can clear. This is a deliberate
  exception to the Sep 13 rule that only the profile edits a routine
  (`docs/rounds/2026-09-13-tracker-round.md:93`).
- **A studio chooses how a client starts**: A alone, or A and B from the start.
- **Free-form sessions**: a trainer's own training, a friend or family member,
  practice. Real records, not Demo Mode; may loosely follow a routine.

**Q4. An injury (a wrist that can't grip).**

> "It's more a layer over it. It's not going to automatically change routine
> just because something's injured doesn't mean we're completely avoiding it.
> Sometimes we might just digress it. So just having a little flag over the
> ones that might be important for the injury is also nice. So kind of both."

- **A layer, never an automatic change**: the machines that matter for the
  injury carry a flag; the trainer may still do one, regress it, swap it, or
  edit the routine.

**Q5. Does a routine say what its idea is?**

> "You should be able to put the intention of what you're building for the
> routine in. So it's like, you can build the whole A routine, but not have it
> automatically say like, hey, we're going to be doing all the machines. ...
> this is what I think I'm going to make for their A routine. We're going to
> start out with these three machines. If that goes well, we'll add in the
> fourth, then the fifth, and the sixth, and maybe the seventh. Depending how
> quick they move. And sometimes we might build out that idea and then we get
> down to the seated dip and we realize, ah, their delts are really weak.
> Let's go ahead and actually get them on the overhead press instead. ...
> having a plan would allow teams to communicate a little bit better on
> allowing three different trainers to train a new client. But still
> effectively follow one plan. Made by the original trainer. So routines
> should definitely have a purpose. It's not that A is always just the core
> routine. Essentially, there's a purpose for starting the B routine. ...
> Sometimes we just have clients that really want a more diverse amount of
> machines. So they might just get more machines just to please them."

- **A routine has a plan**: the routine you intend (say seven machines), the
  order they come in, and a purpose in words. "More variety because the client
  wants it" is a real purpose.

**Q6. Who may change the plan?**

> "Any trainer who trains the client can definitely change the plan. But the
> thing is, it's nice to be able to communicate like, hey, I'm changing this
> plan because of this reason. So anyone can go ahead and change a plan.
> Again, you shouldn't really be blocked. Like if I start a session with a
> client and I already think that, oh, hey, I think they would be a lot better
> on this machine instead. You should be able to change that and make the call
> as a trainer because you're training them that day."

- **Any trainer changes the plan, mid-session included.** The reason is asked,
  never required (the same rule as a setting's reason on the machine menu),
  and every change is kept with who, when and why.

---

## 3. What happens today

The path for a client booked in Mindbody with no routine and no sessions
(paths under `src/`, as of `cf4a2ff8`).

1. **Hub**: the card says "1st session" or "New to Journey"
   (`features/hub-schedule/card-marks.ts:79, 220-225`). The peek's Start session
   opens the tracker (`components/ClientsView.tsx:1072-1077`).
2. **Briefing** (`features/briefing/BriefingScreen.tsx`): "Last session · Never",
   "Nothing flagged — clear to go.", a "First session" chip, Routine A and B
   both "Not set up - tap to build" (tapping only selects), and "Routine A · 0
   machines · suggested" with Edit (1086-1120). Edit opens the Routine Builder in
   briefing mode; with no counterpart routine the RotationPanel and its "Start
   from the model A routine" seed never render (`routine-builder/RoutineBuilder.tsx:271-295`),
   so only "Suggested next" (one machine at a time) and "Add a machine" remain.
   **Start is never blocked.**
3. **Start** (`components/WorkoutTrackerView.tsx:1561-1812`): `resolveStartRoutine`
   (`features/session-record/start-plan.ts:48-61`) returns "create", and the
   batch saves a **permanent Routine A** with whatever was built on the briefing,
   though the builder labels its list "Today only". Built nothing: an empty
   Routine A and an empty session.
4. **The Active Session**: rows come from the session's machine list; an empty
   list leaves everything folded under "Not in today's routine". Machines are
   added from the "+" in each Today cell or the corner's Reorder sheet. The Now
   Bar with no machine says only "Tap a machine in the Today column to start
   logging." and has no Add button (`journey-grid/SessionNowBar.tsx:454-459`).

### What is broken on the way

| # | What | Cause | Where |
| --- | --- | --- | --- |
| 1 | **The "one long line"** AJ described | `--jg-cols` is the number of past sessions; with none, `repeat(0, …)` is invalid CSS, and because it arrives through `var()` the whole `grid-template-columns` falls back to `none`. Rows are `display: contents`, so every name cell and Today cell stacks in one full-width column. Portrait and landscape alike. **The profile's Journey grid has the same bug** for a client with no sessions, and the phone override at `journey-grid.css:2862-2873` repeats it | `journey-grid/JourneyGrid.tsx:844, 960`; `journey-grid/journey-grid.css:175-180`; `RecentJourneyView.tsx:292-331`. The README's own rule, "never leave an empty track in the template" (`journey-grid/README.md:344`), is the one broken |
| 2 | Start saves a permanent Routine A from a list labelled "Today only" | `start-plan.ts:60`, `WorkoutTrackerView.tsx:1669-1677` | the briefing's builder copy says one thing, the write does another |
| 3 | The starting-weight seed has never produced a weight | `calculateStartingWeight` looks up Title Case names; standard floor names are UPPERCASE. Left off on purpose as "a product decision" (`docs/rounds/2026-09-17-beta-prep-trim.md:114-119`), and AJ has since ruled "no house starting weight" (`docs/rounds/2026-09-28-codex-source-check.md`) | `lib/consultation-utils.ts:100-144`; `start-plan.ts:220-233` |
| 4 | The existing "First-time setup" screen is unreachable for Mindbody clients | `ConsultationSetupWizard` shows only when `requiresConsultation && !consultationCompleted`, set only for a prospect made in Journey; its routine is a hard-coded trio (Leg Press, Chest Press or Seated Dip by gender, Lumbar), and its machine mapping matches Title Case names against UPPERCASE floor names, so it likely starts an empty session (inferred, not run) | `components/ConsultationSetupWizard.tsx:62-72`; `WorkoutTrackerView.tsx:3586-3632`; `lib/consultation-answers.ts:182` |
| 5 | Dead paths | `isIntroSession` (a banner, a "Demo Routine" preload) has no caller passing true; `ConsultationWizard.tsx` is imported nowhere | `AppContent.tsx:711, 749-757`; `BriefingScreen.tsx:263-276` |
| 6 | The Academy's first and second workouts are in the code and nobody reads them | `SELECTION_TEMPLATES[].consult / firstWorkout / secondWorkout` have no readers; only `eventualA/B` feed the builder's scores | `routine-builder/academy.ts:562-731`; `routine-builder/engine.ts:632-640` |
| 7 | Lateral Raise is filed as front delt; the Academy says middle delt. There is no side-delt muscle id | data | `data/machine-definitions.ts` (m-lateral-raise, about line 2331); `data/machine-anatomy-map.ts`. Seated Dip lists only pecs as primary |
| 8 | Two versions of the Academy's selection template disagree on three rows (clear female consult LP·CR·SD vs the encoded LP·CR·Lumbar; clear male LP·CR·CP; elbow/hand/wrist A and B at five machines) | `academy.ts` follows Academy 6's `Programming and Progression 7`; `Academy 2\Exercise Selection Template.txt` (copied in `Initial Setups\` and `Academy 9\`) is the other | head office's call, §7 |

### What already exists and fits

| Piece | Where | Use |
| --- | --- | --- |
| The Academy's starting ladders per client type (11 cases: clear female or male, low back, knee, shoulder, core, upper, lower, arms, posture, elbow/hand/wrist) | `SELECTION_TEMPLATES` (`academy.ts:577`), `matchTemplates(text)` (:853), `preferenceFromGender` (:864), `CONSULT_TRIO` (:117) | **The suggestion itself**: consult → first workout → second workout → eventual A and B, filtered to the studio's floor |
| Order and balance checks | `analyzeRoutine` (`engine.ts:423`), `autoSequence` (:218), `SEQUENCING_RULES` (`academy.ts:249`), `ACADEMY_CATEGORIES`, `FOUNDATIONAL_CATEGORIES` | Hold a plan to the Academy's order and coverage |
| One machine at a time, ranked with reasons | `suggestMachines` (`engine.ts:640-787`) | "What fits next" inside a plan |
| Substitutes, hands-free | `EXERCISE_SUBSTITUTES` (`academy.ts:384`), `HANDS_FREE_MACHINES` (:737), `substitutesFor` (`engine.ts:815`) | The injury layer's offers |
| B's build-out | `MODEL_AB_ROUTINE` (:485), `TWICE_WEEKLY_RULE` (:534), `B_ROUTINE_BUILD_OUT` (:546, 8 weeks / 16 sessions), `COMPLEMENTARY_PAIRS` (:430) | B's plan |
| Pain protocol, rep bands, counts | `PAIN_PROTOCOL` (:753), `REP_RANGE_BY_LEVEL` (:771), `EXERCISE_COUNT` (:793), `ADD_EXERCISE_CHECKLIST` (:816) | Sentences on the plan, never rules |
| Notes with a body part | `client-notes/body-parts.ts` (wrist, paired, Pulse region `wrist_hand`); Health and Incident notes carry `bodyParts` on the root | The injury layer's trigger, opened and closed with the note |
| A temporary profile any trainer can start | Add Client (`docs/rounds/2026-10-02-atlas-answers.md:35`) | The walk-in consult's client |
| Set-up ghosts, never values | studio standard and catalog `defaultSettings` ("Std X", "Studio standard 6"), machine fit's dial suggestions (Programming → Setup, from 5 similar clients), `universalBaseline` and `bodyTypeAdjustments` text | The first session's set-up help, as today |
| The next session's weights | `features/next-weight/` (the Wrap-up) | Unchanged: the trainer sets them |
| A routine's storage | `routines/{id}`: `clientId, name ("Routine A" / "Routine B"), machineIds[], machineNotes?, templateId?, templateMachineIds?, studioId` (`src/types.ts:1091-1115`); presets in `routinePresets` (company · studio · trainer) | The plan's home (§5) |

---

## 4. What the Academy says

Short form; the full notes with line references are in this round's research
(paths under `docs/msf-academy/`; **AB** = Academy 6 `Programming and
Progression 6 - AB Routines`, **EST** = `Programming and Progression 7 -
Exercise Selection Template`, **LTP** = `Exercise Selection and Long-Term
Programming`, **PAIN** = `Considerations for Training with Pain`, **PUSH** =
`Academy 2\How Intensely to Push a Client`, **PP1-PP5** = Academy 6's
`Programming and Progression 1-5`, **CEO** = `Initial Setups\Comprehensive
Equipment Overview\`).

**The first sessions.** The consult is two or three machines: Leg Press plus
one more, "preferably compound row" (PP1:6), Lumbar instead for a low back
(PP1:7); AB:63-70 names the trio LP, CR, Lumbar, which "become a core part of
the client's routine moving forward". The second visit adds a third; a quick
learner adds a fourth and fifth; that workout "may be repeated for several
subsequent sessions" (PP2:6-7); then A is built, then B (PP2:10). The learning
curve is "about 5 to 7 sessions" (consultation script:54); most do six
machines after four to six workouts (LTP:23-25). **This is AJ's "start with
three, then the fourth, fifth, sixth" in the Academy's own words.**

**Starting weights.** "intentionally underestimating the strength of the new
client", landing "at a 10 - 12 or more rep set" (EST:204-208). No per-machine
table: only Cervical "start with 20 pounds" and the low-back Lumbar test at 20
lb for about 3 reps. AJ's ruling stands: no house starting weight.

**Intensity.** Novices "do not require maximal effort" (PUSH:87-90); most
clients approach failure in 6-10 reps "eventually ... This can easily take
months", and "some never will — and that's acceptable" (PUSH:214-215). Order of
priority: safety, quality, near-failure effort, then the rep framework
(PUSH:124-128). A new machine "may not be performed as intensely" at first
(PP3:5). Never to failure: Cervical and Lumbar (no partial reps either); Torso
Rotation's first side short of failure; Leg Extension and Leg Press together,
"do not push to failure on both". Intensity-adverse or deconditioned clients:
lighter loads, a ceiling around 15 reps, finish with a 5-10 s hold instead of
partial reps. Only `REP_RANGE_BY_LEVEL` is encoded; the never-to-failure list
and the intensity-adverse profile are prose only.

**Why a B routine.** The stimulus must reach the same muscles "at least twice
per week" (AB:8-17); B gives "Variety to satisfy/motivate the client" while
keeping "Consistency of the stimulus" (AB:43-45). The ideal would be one
routine repeated "with zero variation, indefinitely", but clients get bored
(AB:35-39). So B works **the same regions with different machines**: CR+PO in
A matches SR+Pd in B; LP in A matches LE+ABD+Lumbar in B (AB:105-114), and "key
exercises should be repeated in the A and B" (EST:32-33). **The Academy does
not describe B as accessory, recovery or weak-point work**: AJ's purposes go
beyond it (§2, Q5).

**How B is molded in.** A takes "two to three weeks alone to begin to master"
(AB:150-151) and runs "no less than 5 to 7 times before beginning to add new
exercises" (PP3:3); then B grows by "replacing one complementary exercise of
the A routine every week or so" (AB:152-154), "one at a time ... several or
more weeks" (PP3:4), a new machine kept "for several consecutive sessions"
(PP3:5). Full build-out: "at least 8 weeks (or 16 sessions)" (AB:141-142). Lumbar
and Leg Press are "eventually split" into different workouts (AB:115-130). The
Academy doesn't say whether, during the build-out, the client alternates A with
a partial B or keeps running A with one machine swapped (§7). A C routine is
for advanced clients only and "isn't better, or required" (PP4:3).

**Adding a machine.** The six-question check (LTP:10-21) is
`ADD_EXERCISE_CHECKLIST`. Five to eight machines for most (an eighth or ninth
allowed, EST:31-34); "20 minutes is the MINIMUM time, not the standard"
(AB:90-91); one movement from each of the five categories, pull, push and legs
every workout, trunk and hips as needed (EST:12-14, PP1:9). A requested machine
is "added on ... if time permits or used to replace a lower priority muscle
group", in both workouts (AB:134-140), but the program shouldn't "be dictated
entirely by the client's desire to use more machines" (LTP:134-136). About one
change a week. **Removing one**: the client can't tolerate it (omit "until they
have medical clearance"); surgery without clearance ("WE WILL NOT TRAIN OR
INVOLVE THE AFFECTED AREA", TSC:4); no pain-free position for a static version;
an exercise-induced headache (drop it for weeks, bring it back last at lower
intensity; a second one, drop it "for the foreseeable future").

**Injuries.** Ask for the diagnosis and the physician's limits, then assess
tolerance: very light load, limited range, 2 lb steps, a static hold or TSC as
"a temporary bridge" (PAIN:2-34; `PAIN_PROTOCOL`). **Hand, wrist, elbow:** hand
pads first; if that fails, a hands-free workout using Lateral Raise, Simple
Row, Pullover and Chest Flye, and "All lower body and trunk machines remain
fully available" (PAIN:35-44; `HANDS_FREE_MACHINES`); Biceps and Triceps as
static holds for tennis or golfer's elbow. **Knee:** Leg Curl gap 3 or more;
Leg Curl before Leg Press as a warm-up for a knee replacement (A4-10:5).
**Low back:** Lumbar test at 20 lb × 3; pair Lumbar with Leg Extension and
leave Leg Press out of that workout. **Shoulder:** Overhead Press range
shortened with a pin; Chest Flye bigger gap; Simple Row as a TSC; after
surgery, possibly lower body only. **Neck:** never to failure, slow, static
option; no neck template. **Hip:** Abduction and Adduction as static holds.
**Osteoporosis:** dynamic Torso Rotation "usually contraindicated" (not in
`academy.ts`). This is what AJ called "digress it": the Academy's answer is
usually a regression on the same machine before a swap.

**Weak points ("very weak delts").** **The Academy has no weak-point
doctrine.** It never says put the weak muscle first, add volume or pre-exhaust
(pre-exhaust as a default rests on "the faulty premise that fatigue is a
stimulus", EST:179-195). The nearest: put a machine for the area in both A and
B (AB:134-140); a lean client runs the Big 5 "as long as possible", then adds
"the lateral raise and some direct, single joint arm exercises" (PP1:13). Delt
machines: Overhead Press (front and middle), Lateral Raise (middle), Simple Row
and Compound Row (rear), Chest Press, Seated Dip and Flye (front as a helper).
So a weak-delt plan swaps Seated Dip for Overhead Press, or adds Lateral Raise,
in both routines — exactly AJ's example. Some weakness is answered with
settings, not machines: weak grip "will adapt"; weak triceps get a gap.

**Order.** "logical order where there are no conflicting movement patterns and
complementary pairings are considered" (PP5:7); "train non-overlapping muscles
in consecutive sets" (EST:189-190); `SEQUENCING_RULES` holds the avoid list.
Not yet encoded: Leg Press and Lumbar "should NOT be run contiguously in any
arrangement" (PP5:9; only one direction is caught today); Abs right before
Triceps; Lumbar often first or second; push before pull for valgus elbows;
Cervical first for headache-prone clients. **The Academy doesn't say**
big-to-small, lower-before-upper or strict push/pull alternation. A routine's
"idea", in the Academy's words, is coverage, variety and consistency, built
from the intake form's goals and concerns (EST:7-12).

**Changing a routine.** Repeat, don't vary: A and B alternate "for a long
period of time ... like 8 to 12 sessions"; "remain on the basic A routine for
as long as possible" (PP4:5). A plateau is worked Form → Sequence → Rep count →
Resistance (PP5:5-12), and "just one setting deeper can make the exercise feel
new again". Triggers for a change: a new goal or concern, a client's request,
an injury. How often to rotate A or B: the Academy doesn't say.

### The twenty machines and the hands

From the Quick Reference Guides' target muscles and PAIN:40-43. **Grip** is what
a wrist that can't grip flags.

| Machine | Target muscles | Hands |
| --- | --- | --- |
| Leg Press | quads, glute max | not needed |
| Leg Extension | quads | not needed (handles for leverage) |
| Leg Curl | hamstrings, calf | not needed (handles anchor) |
| Compound Row | rhomboids, traps, lats, rear delt | **grip** |
| Pulldown | lats, teres, rear delt, biceps | **grip** |
| Pullover | lats | hands-free |
| Simple Row | rear delt, rhomboids, traps | hands-free |
| Chest Press | pecs, triceps, front delt | **palm on handle** |
| Overhead Press | front and middle delt, triceps | **palm on handle** |
| Seated Dip | pecs, triceps, front delt | **palm on handle** |
| Chest Flye | pecs | hands-free |
| Lateral Raise | middle delt | hands-free |
| Biceps Curl | biceps | **grip** (static option) |
| Triceps Extension | triceps | edge of the hand on a pad; not on the hands-free list |
| Lumbar | erectors, multifidus, QL | not needed |
| Abdominals | rectus abdominis | not needed |
| Torso Rotation | obliques | not needed |
| Cervical Extension | neck extensors, traps | not needed |
| Hip Abduction | glute med | not needed |
| Hip Adduction | adductors | not needed |

---

## 5. The structure

Five pieces. Each is a sentence of the product first, then where it would live.
**None of it is designed on screen yet**; the design round decides the look.

### 5.0 First, the bug (no decision needed)

Fix §3 row 1 before anything else: when there are no past sessions, the grid
template leaves the session track out (or passes the count only when it is at
least 1), on the session grid, the profile's Journey grid and the phone
override, with a `*.render.test.tsx` that mounts the grid with zero sessions and
checks the name and Today cells share a row. That alone ends the "one long
line": the first session looks like every other session with no past columns,
machine names down the side and Today beside them. One commit, a push alone.

### 5.1 Which client is which

| Kind | How Journey knows | What happens |
| --- | --- | --- |
| **New to the studio** | No Journey sessions, no routine, and nothing before Journey: Mindbody's visit count (`visitsBeforeJourney`) is zero or a confirmed `priorHistory` says none; or a temporary profile made with Add Client (the walk-in) | The first-time setup (5.2) |
| **New to Journey** | No routine in Journey but sessions before it (Mindbody's count, or a confirmed prior history) | No suggestion. The briefing says the routine isn't in Journey yet and opens Programming, as today (AJ: "plug and play") |
| **Free-form** | Chosen by the trainer at Start (5.5) | No routine, no plan; a real session |

Wording keeps `lib/history-claims.ts`'s rule: never "new client" or "first
session" off a low Journey count. The setup screen says what it knows ("Nothing
before Journey, from Mindbody").

### 5.2 The first-time setup: a starting plan, from two doors

- **The suggestion.** Journey matches the client against the Academy's
  `SELECTION_TEMPLATES` (`matchTemplates` over the intake, the Health notes and
  the clinical profile; `preferenceFromGender` only to pick the clear-female or
  clear-male row, never shown as a reason), keeps only machines on the studio's
  floor, and offers **a starting plan**: the consult's two or three machines
  first, then the first and second workouts' additions in order, ending at the
  eventual A. Each line says where it came from ("From the Academy's template
  for a low back"). The trainer changes anything, and nothing is written until
  they keep it.
- **Door one: on the profile, ahead of time** (AJ: "set up their profile before
  the consult"). Programming gets "Start a plan" for a client with no routine.
- **Door two: at the session, a walk-in** (AJ: "start that consult and build it
  on the go"). The briefing for a new-to-studio client shows the suggested plan
  with its first rung as today's machines; Start is never blocked; machines are
  added during the session as today. A studio leader can do this for a
  temporary profile.
- **A or A and B** is a studio setting (`features/studio-settings/registry.ts`):
  `startingRoutines: "A" | "AB"`, Max Strength's default A (the Academy's), a
  studio's leaders may choose AB.
- **Start no longer saves a list labelled "Today only" as Routine A** (§3 row
  2): a plan is kept, and the routine follows it (5.3).
- **Set-up help** stays as ghosts, never values: the studio standard, the
  catalog's baseline text and body-type adjustments, machine fit's suggestions
  once five similar clients exist. **No starting weight is suggested**; the
  Academy's "start light, aim for 10 to 12 or more reps" may be said as a
  sentence. `calculateStartingWeight` and the hard-coded consult trio retire with
  `ConsultationSetupWizard` and the dead intro-session path (§3 rows 3-5), once
  the new setup reaches Journey-made prospects too.

### 5.3 A routine's plan

The heart of it. Every routine may carry a plan:

- **The purpose**, in words, offered from the Academy's reasons and the trainer's
  own ("The core: whole body, Big 5", "Variety, the client wants more machines",
  "Shoulders: delts weak", "Grip-free while the wrist heals").
- **The machines intended**, in order, and **how far along** the client is (3 of
  7). The routine's `machineIds` stays what the client does now, so every reader
  that exists today keeps working; the plan is the rest of the road.
- **Who made it, and every change**: who, when, the reason if one was given
  (asked, never required). AJ: "three different trainers ... still effectively
  follow one plan."
- **Any trainer changes it, any time, mid-session included** (Q6). Nothing in
  a plan blocks a session; the plan is a guide, not a rule.
- **Held to the Academy as sentences**: `analyzeRoutine` and `autoSequence` say
  where an order breaks a rule or a category is missing; nothing refuses a save.
- **The Wrap-up's "Next time"** (Q3): today's machines, plus the plan's next
  machine when the trainer added one, join the routine by default, each with a
  tick to leave it out. Nothing else writes the routine from a session.
- **B's plan** is the same shape: which of A's machines it replaces, one at a
  time, about a week apart (AB:152-154), with the Academy's complementary pairs
  offered (`COMPLEMENTARY_PAIRS`, `MODEL_AB_ROUTINE`, the template's eventual B).
  It starts when the trainer starts it (the Academy's 5-7 sessions of A is said,
  not enforced), or at once where the studio starts A and B together.

**Where it lives** (a Firestore structure change, so AJ's OK first): the plan on
the routine's own document, `routines/{id}.plan` = `{ purpose, intended:
machineId[], madeBy, madeAt }`, and its changes in `routines/{id}/planChanges/{changeId}`
= `{ at, byUid, kind: "add" | "remove" | "swap" | "reorder" | "purpose", machineIds,
reason? }`, appended, never edited. Any trainer who works at the client's
studio writes both (`firestore.rules`, with tests). One read per routine on the
screens that already read routines; no Mindbody call; the change list is read
only when opened, with its index.

### 5.4 The injury layer, and a focus

- **An injury is an open Health or Incident note with a body part** (the notes
  round's body map). While it is open, every routine row, the briefing's routine
  line and the session's name cell flag the machines that matter for it ("Wrist:
  grip"), with the Academy's way through: regress (hand pads, a static hold,
  shorter range, lighter) or a substitute (`HANDS_FREE_MACHINES`,
  `EXERCISE_SUBSTITUTES`). **Nothing changes by itself**; closing the note takes
  the flags away. A permanent change is a plan change with its reason.
- **The map** (body part → machines) is a small pure table beside
  `body-parts.ts`, from §4's table and the injury notes: wrist and hand → the
  grip and palm machines; elbow → Compound Row, Pulldown, Biceps, Triceps; knee →
  Leg Press, Leg Extension, Leg Curl; low back → Lumbar, Leg Press, Abs, Torso
  Rotation; shoulder → Overhead Press, Chest Press, Seated Dip, Flye, Lateral
  Raise, Pulldown; neck → Cervical; hip → Abduction, Adduction, Leg Press. Head
  office confirms it before it ships (§7).
- **A focus** (weak delts) is a plan's purpose with a body area: the builder
  lists the machines that work it, where each fits in the order, and what it
  would push out to stay within 5-8 machines, and says the Academy's one rule
  (in both A and B). It needs §3 row 7 fixed first (Lateral Raise is middle
  delt).

### 5.5 Free-form sessions

A session the trainer starts as **Free-form**: no routine, no plan, no Wrap-up
"Next time", machines added as it goes. For a trainer's own training, a friend
or family member, practice. A real record, unlike Demo Mode. Where it counts is
§7's first question.

### Build order, one commit a phase

1. The grid's zero-session bug (5.0). A push alone.
2. The pure core, no screens: `starting-plan.ts` (template match → a plan for
   this floor), `plan.ts` (the plan model: next rung, apply a change, the
   Wrap-up's default list), `injury-layer.ts` (open notes → flagged machines and
   their offers), each with tests; the Lateral Raise and side-delt data fix;
   Leg Press–Lumbar caught both ways in `SEQUENCING_RULES`.
3. The rules and the plan's storage (after AJ's OK), with rules tests.
4. The screens, after the design round: Programming's Start a plan, the
   briefing for a new-to-studio client, the Wrap-up's Next time, the flags.
5. Free-form, once §7's question is answered.

## 6. Rules this keeps

- **Nothing slows Start**, and nothing blocks it (`the-floor.md:236-237`).
- **The app never suggests a weight**; the plan suggests machines, with their
  source, and the trainer decides (`the-floor.md:84-91`).
- **A tap on the floor never waits** on a write; every plan change is issued and
  moves on.
- **Every query ships with its index**; no per-client queries in a loop.
- **Never a whole client write**; the plan lives on the routine.
- **No guessed gender** on screen: the template row may be picked from Mindbody's
  gender, never said.
- Recognition, never ranking: a plan names its maker, never compares trainers.

## 7. Open questions (for AJ and head office, before the build)

1. **Free-form sessions: where do they count?** Lean: on the person's record and
   the trainer's own history only, never in the studio's numbers, machine fit or
   machine trends, and the person is a temporary profile unless they're a
   client.
2. **Which Academy template is the standard?** Academy 6's (encoded) and Academy
   2's disagree on three rows (§3 row 8). Head office's call.
3. **The injury map** (5.4): head office confirms which machines each body part
   flags, Triceps for the wrist especially.
4. **Does "adds on by default" apply to every client, or only while a plan is
   still being built?** Lean: only while the routine is short of its plan; an
   established routine changes on purpose.
5. **During B's build-out, does the client alternate A and a partial B, or run A
   with one machine swapped?** The Academy doesn't say.
6. **The Firestore OK** for `routines/{id}.plan` and `planChanges` (5.3), and the
   studio setting `startingRoutines`.
