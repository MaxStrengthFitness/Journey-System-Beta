# Start here — how Journey is put together

*Written for AJ, Sep 21 2026. If you read one document about this project,
read this one. It should take about fifteen minutes and it assumes you do not
write code.*

The point of this page is not to teach you to program. It is to give you the
**map and the vocabulary**, so that when you want something changed you can
say where it lives and what it must not break — and so that when Claude says
"that's a rules change, so it needs a deploy", you know what that means and
why it matters.

---

## 1. What Journey actually is

Max Strength Fitness runs a specific method: **twenty minutes, one set to
failure on five to eight machines, very slow reps, a trainer beside you the
whole time.** Three corporate studios grew into a franchise, so the method —
not the buildings — is the product.

Journey is the app the trainer holds while that happens. It replaces the old
FileMaker system. It does three things and nothing else:

1. **Before the set** — tells the trainer how this client is set up on this
   machine, and what they need to know about them today.
2. **During the set** — records what happened: the weight, the reps, whether
   it was a real set or a practice one.
3. **Around all of that** — lets a studio leader run the studio, and lets head
   office keep the method the same everywhere.

### The definition it all rests on

Everything above is downstream of one sentence. AJ: *if it isn't within this
definition, it isn't true exercise.*

> "Exercise is a process whereby the body performs work of a demanding nature,
> in accordance with muscle and joint function, in a clinically-controlled
> environment, within the constraints of safety, meaningfully loading the
> muscular structures to inroad their strength to stimulate a growth mechanism
> within minimum time."
>
> — Ken Hutchins

Almost every rule in the app is one clause of that, made concrete — *within
minimum time* is why nothing may be added to the set without removing
something; *to inroad their strength* is why rep **quality** is the measure
rather than rep count; *to stimulate a growth mechanism* is why a practice set
is recorded in full and never averaged. The clause-by-clause map is in
`docs/business/the-floor.md`.

**It is also a good way to reject a change.** "That breaks *within minimum
time*" is faster and more precise than describing the symptom, and it points
at the fix.

Two more sentences that explain most of the rest:

> **The app is a guide and a log. It is never a coach.**
> It never suggests a progression, never tells the trainer what to do next,
> and never contacts a client.

> **A confident wrong number is worse than a missing one.**
> If the app isn't sure, it says "not enough data yet" instead of guessing.

---

## 2. The three systems, and which owns what

This is the single most useful thing to have straight, because almost every
confusing bug is really a question about which system owns a fact.

```
   MINDBODY                    JOURNEY                    THE iPAD
   (bought software)           (what we built)            (the floor)

   who the clients are   -->   coaching data        -->   the trainer's
   their bookings              sessions, sets,            screen, offline
   their contracts             notes, machines           -capable
   their packages              the studio's floor
```

- **Mindbody owns people, bookings and contracts.** Journey never invents a
  client. A client lives at `clients/{mindbodyClientId}` — we use *their* id,
  never match on names. If a client's name or package is wrong, it is wrong in
  Mindbody.
- **Journey owns the coaching.** Every set, note, routine, machine setting and
  assessment. Mindbody never sees any of it.
- **The iPad is a cache.** It works when the Wi-Fi drops and catches up later.
  This is why "never block a save" is a rule.

**"Firestore"** is the database — Google's. **"Cloud Functions"** are little
programs that run when Mindbody pokes us (a booking changed, a contract was
signed). **"Render"** is the web host that serves the app itself.

---

## 3. Who uses it, and the three tiers

The app has three modes, and they are not the same as job titles.

| Tier | Who | What they get |
| --- | --- | --- |
| **Floor** | Life Transformer (a trainer) | The Hub, a client's profile, the Active Session, Learning, the Calendar |
| **Studio** | Studio Leader, Head Trainer, Studio Owner — or a trainer given *the grant* | The above, plus **My Studio** and **Operations** for their studio |
| **Company** | Administrator, Founder | The above, plus the **Admins dashboard** — the master catalog, every location, system tools |

The distinction that matters most, and that AJ set:

> **My Studio is where you run the studio. Operations is where you look at it.**

So a studio's own settings are edited in **My Studio** and only there.
Operations shows you the state of things and links across. There is one
deliberate exception (the floor editor is mounted in both, but it is literally
the same code — one implementation, two doors).

And above those, the **Admins dashboard** holds anything that belongs to the
company rather than a location: the machine catalog every studio inherits, the
standard template a new studio starts from, every location, system tools.

---

## 4. The map — where everything lives

You do not need to remember this. You need to know it exists, so you can point.

### The top level

| Folder | What is in it |
| --- | --- |
| `src/` | **The app itself.** Everything the trainer sees |
| `server/`, `server.ts` | The bit that runs on the web host: talks to Mindbody, runs the nightly jobs |
| `functions/` | The bits that run when Mindbody pokes us |
| `firestore.rules` | **Who is allowed to read and write what.** The security wall |
| `scripts/` | One-off tools you run from the PC (imports, backfills, diagnostics) |
| `docs/` | Everything written down. Start with this file, then `ARCHITECTURE.md` |
| `CLAUDE.md` | The briefing Claude reads at the start of every session |

### Inside `src/`

| Folder | What is in it |
| --- | --- |
| `src/features/<name>/` | **Where new work goes.** One folder per feature, each with its own README explaining its decisions |
| `src/components/` | The older world, from before we organised into features. The three biggest screens still live here |
| `src/lib/` | Small shared helpers that do one thing each and have no screen |
| `src/data/` | Built-in data — the twenty machines, the anatomy map, the clinical matrix |
| `src/types.ts` | The shared vocabulary: the shape of a Client, a Session, a Machine |
| `src/AppContent.tsx` | The traffic controller. Decides which screen shows |

### "I want to change…" → look here

### The screens, as a trainer meets them

AJ's own tour, Sep 21 2026.

| Screen | What it's for |
| --- | --- |
| **Hub** | Where a trainer lands. Today's sessions by trainer; cycle forward through the coming days |
| **Calendar** | The schedule properly broken down — month, week, day; past days; sessions or events; the whole team or one person. All pulled from Mindbody. Where you go to actually look ahead |
| **Client directory** | Search the clients at the studio you're in, and reach your Kaizen roster |
| **Kaizen roster** | A trainer's own bookmarked clients — the regulars they're watching, so they aren't searching "Jeff… Jeff what?" every time. Per trainer, on `trainers/{uid}.kaizenRoster` |
| **Client profile** | Opened from the directory or the roster: the whole record of a person |
| **Start Session** | The door to the Active Session — briefing, live grid, post-session. Rank 1 and 2 |
| **Learning** | The protocol, every machine, and guides and coaching cues on becoming a better trainer |
| **My Studio** | "How can I help the team right now?" Relay · Machines · Team · Studio |
| **My Profile** | A trainer's own rundown — who's coming up, how their coaching is going |
| **Operations** | "Where are we going wrong, and where are we going right?" Take what the app has gathered, put it together, see what it says |
| **Admins dashboard** | Corporate setting the standard, the machines, and getting everyone set up for success |
| **Switch studio** | In the header. Decides which floor loads, whose roster you search, which schedule you see — more than a preference |

### "I want to change…" → look here

| If you want to change… | It lives in |
| --- | --- |
| The screen a trainer uses during a set | `src/components/WorkoutTrackerView.tsx` |
| The Calendar | `src/components/CalendarView.tsx` + `src/features/calendar/` |
| The client directory and the Kaizen roster | `src/components/ClientDirectoryView.tsx`, `src/features/trainer-profile/` |
| What the trainer reads before a session | `src/features/briefing/` |
| The client's profile and its tabs | `src/components/ClientProfileView.tsx` + `src/features/client-profile/` |
| Notes — writing them, when they matter, threads | `src/features/client-notes/` |
| How a machine is set up and described | `src/features/admin/machines/` (the editor) and `src/data/machine-definitions.ts` (the twenty) |
| A studio's own floor and its machines | `src/features/my-studio/` |
| The studio-leader dashboards | `src/features/admin/` |
| The company-only screens | `src/features/admins/` |
| The board, tasks, kudos, private notes | `src/features/relay/` |
| Renewals and packages | `src/features/renewals/` |
| Colours, spacing, the look | `src/index.css`, `equipment.tokens.css`, `admin.tokens.css` |
| Who can see or do something | `firestore.rules` **and** `src/lib/permissions.ts` |

---

## 5. The vocabulary

This project has invented a lot of words. They are all deliberate. Knowing
them is most of what makes a request land correctly.

**About the work**

- **A round** — one chunk of work with a theme, done on its own branch, with a
  written document in `docs/rounds/`. "The catalog gate round." Rounds are how
  this project has history.
- **A branch** — a private copy of the code where a round is built, so
  half-finished work never reaches the live app.
- **`master`** — the real one. **Every push to `master` goes live to
  trainers.** That is why work waits on a branch.
- **A trap** — something that broke once, written down in `docs/KNOWN-TRAPS.md`
  with the rule that came out of it. This is the project's scar tissue and it
  is genuinely valuable.

**About the floor**

- **Rank 1–4** — how close something is to the set itself. Rank 1 is *during
  the set*, Rank 4 is back-office. The lower the rank, the more carefully it
  gets changed.
- **The Now Bar** — the always-visible strip during a session.
- **The four outcomes** — every planned machine ends as **performed**,
  **practice**, **skipped** or **not reached**. Only *performed* counts toward
  any average. This is decided in exactly one file so twenty screens cannot
  disagree.
- **The Dial** — the one rating control in the whole app. Anything a trainer
  *rates* about a client uses it.
- **Loudness** — Note · Heads up · Critical. Anything a trainer *writes*
  carries one.
- **Pulse** — the living assessment of how a client is doing. (The code still
  says "check-in" in places; same thing.)
- **A thread** — a note is not a fact, it is a story. Updates hang off the
  original rather than becoming new notes. Contradicting a note *adds* to it.
- **Mattering** — when a note applies: Always · From–until · Only on a day.

**About machines** — this is the part that matters most for franchising

- **The catalog** — the twenty-odd machines Max Strength knows. Company-owned.
- **The standard set** — which of those a new studio starts with.
- **A studio's floor / roster** — what *this* location actually has.
- **Inherit** — a studio automatically gets corrections from the catalog for
  anything it has not deliberately changed.
- **Adopt** — a studio chooses to take a new machine. Nothing is ever pushed
  onto a floor.
- **The template boundary** — *Max Strength owns the method; a studio owns its
  hardware.* A location can change the name, seat positions, dials and
  starting weight of the unit in their room. It cannot change the musculature,
  the cadence, the turnarounds or the cues — those are the product, and every
  location reads the same words. A studio may **add** a safety warning; it can
  never remove one.
- **An offer** — a studio can submit one of its own machines to the catalog.
  Corporate reads it, may rewrite it, then publishes.

---

## 6. How a change actually happens

Roughly, every time:

1. **You describe what you want.** (Section 7 is about doing this well.)
2. **Claude reads the relevant code** — the feature's README, the traps for
   that area, the architecture doc.
3. **Claude makes a branch** and builds it in phases, one commit per phase, so
   any single phase can be undone without losing the rest.
4. **Three checks run:**
   - **Typecheck** — does the code contradict itself? We compare the error
     *count* to a baseline (currently 10). It is not zero and that is fine.
   - **Tests** — about 3,750 small checks that pure logic still does what it
     should. These run in seconds.
   - **Build** — does it actually assemble into a website?
5. **You look at it on the iPad**, for anything a trainer touches. This step
   cannot be skipped or automated. A green typecheck and green tests have all
   passed before while a screen crashed on every tap.
6. **It merges to `master`** — and *that* is the deploy. Trainers have it.

**Three things deploy separately and are easy to forget:**

- `firestore.rules` — the security wall. Needs `npm run test:rules` on your PC
  first (it needs Java installed), then a Firebase deploy.
- **Indexes** — Firestore needs to be told in advance about certain searches.
  A missing one shows up as an empty list, not an error, which is nasty.
- **Cloud Functions** — the Mindbody webhook handlers.

The order is always: **indexes → rules tests → rules → push the app.** Rules go
first when they only *add* access, so the running app is unaffected and the new
version finds its permissions already waiting.

### What only you can do

Claude's shell on your PC can run `git` and the typecheck, but not the test
suite or the build. So these are yours:

- `npm run test:rules` — the only real check on the security wall
- Deploying rules, indexes and Cloud Functions
- Looking at the iPad
- Anything that writes to the live database from a script

---

## 7. How to ask for a change so it goes well

This is the section that will save you the most time.

**Say what should be true, not what code to write.** "A trainer shouldn't be
able to finish a session without a reason for a skipped machine" is a better
brief than "add a validation to the finish handler". You know the gym; Claude
knows the file.

**Name the screen and the moment.** "On the client's profile, on the History
tab, when I tap a past session" beats "in the history thing". Screenshots are
even better — and marking them up helps a lot.

**Say who it is for.** A change for a trainer mid-set, a studio leader on
Monday morning, and head office are three different designs. "Rank 1" or "this
is a leader thing" is enough.

**Say whether it is a rule or a preference.** "Never let this happen" and "it
would be nicer if" get built very differently. The first becomes a test.

**Flag it when you're unsure whether something already exists.** Journey is big
enough now that it often does. Asking costs nothing.

**Tell Claude when something is a one-off versus the new normal.** "Just for
this demo" and "this is how it should work from now on" produce different code
and different documentation.

**Push back on anything you don't understand.** If an explanation doesn't land,
the explanation is wrong — not you. Ask for it in plainer terms. You are the
one who has to live with this app.

### Things worth asking for that you might not know to ask for

- *"Why is it built that way?"* — most decisions are written down and the
  reasoning is usually more interesting than the code.
- *"What will this break?"* — before a change, not after.
- *"Show me the before and after"* — for anything visual.
- *"Is this already in the roadmap?"*
- *"What did you decide that I didn't ask about?"* — a good check on
  autonomous work.

---

## 8. The rules that must never break

These exist because each one was learned the hard way. In plain language:

1. **Never block a save.** A trainer mid-session must always be able to record
   what happened. The app can *confirm*; it must never *refuse*. (The one
   exception is head office publishing a machine to the whole company — there,
   an incomplete machine is twenty wrong setup cards, and there is someone with
   time to fix it.)
2. **A confident wrong number is worse than a missing one.** Every claim a
   screen makes has a minimum sample size, and below it the screen says so.
3. **Prior history is real history.** The studios are mid-migration off
   FileMaker. An empty history in Journey means "no detail here", never "this
   never happened". Never call a client new because Journey hasn't seen them.
4. **Nothing contacts clients or trainers.** No email, no SMS, no push. In-app
   only. This is a product decision, not a technical limit.
5. **Nothing tappable is under 40px**, hover is never the only way to find
   something, and names are never truncated. It is an iPad held in one hand.
6. **Mindbody owns people; Journey owns coaching.** Never match a client by
   name. Never change the Mindbody integration without saying so explicitly.
7. **Recognition, never ranking, inside a studio.** Kudos, yes. Leaderboards
   between trainers, no. Studios may be compared to each other; people in one
   studio may not.
8. **Max Strength owns the method; a studio owns its hardware.**
9. **Every number has a reader.** If the app writes a field that no screen ever
   shows, that is a bug to fix, not a field to quietly delete.

---

## 9. Where to look things up

| Question | Document |
| --- | --- |
| How is the project laid out? | this file |
| What's next? | `ROADMAP.md` |
| Why is it built this way? | `docs/ARCHITECTURE.md` |
| What broke before, and what rule came out of it? | `docs/KNOWN-TRAPS.md` |
| How does the business work — packages, renewals, roles? | `docs/business/` |
| What happens on the gym floor, exactly? | `docs/business/the-floor.md` |
| What does this word mean? | `docs/business/glossary.md`, and §5 above |
| What did we do in that round? | `docs/rounds/` (index in its README) |
| The full history | `docs/rounds/CHANGELOG.md` |
| How do I set up / deploy / test? | `docs/ops/` |
| What does Claude read automatically? | `CLAUDE.md`, plus the feature READMEs |
| Why does this feature work like that? | `src/features/<name>/README.md` |

---

## 10. A last word about "vibe coding"

You built this app end to end without writing code, and it is a real system:
about 220,000 lines, 3,750 automated checks, a security model, a franchise
model and a method encoded in it. That is not a small thing.

The part of this that is genuinely yours — and that no amount of code
knowledge substitutes for — is knowing what happens in the room. Whether a
trainer can reach that button while bracing an iPad. Whether a studio leader
would actually open that screen on a Monday. Whether "practice set" means what
the Academy means by it. Every good decision in this codebase started as
something you said about the floor.

So the goal is not for you to learn to write the code. It is for you to know
the map well enough to say *where* and *what must be true* — and to catch it
when something built is subtly not what the gym needs. That is the highest
leverage thing you can do, and this document is here to make it easier.
