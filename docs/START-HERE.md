# Start here — how Journey is put together

*Written for AJ, Sep 21 2026; the deploy steps, the checks and the counts were
brought up to date on Oct 7 2026. If you read one document about this project,
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
  client. A client lives at `clients/{mindbodyClientId}` (or, for the rare second person whose number the other Mindbody site already uses, `clients/{site}-{id}`) — we use *their* id,
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
| **Studio** | Head Trainer, Studio Leader, Studio Owner (each its own label since Sep 27 2026) — or a trainer given *the grant* | The above, plus **My Studio** and **Operations** for their studio |
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

### The screens, as a trainer meets them

AJ's own tour, Sep 21 2026.

| Screen | What it's for |
| --- | --- |
| **Hub** | Where a trainer lands. Today's sessions by trainer; cycle forward through the coming days |
| **Calendar** | The schedule properly broken down — month, week, day; past days; sessions or events; the whole team or one person. All pulled from Mindbody. Where you go to actually look ahead |
| **Client directory** | Search the clients at the studio you're in, and reach your Kaizen roster |
| **Kaizen roster** | A trainer's own bookmarked clients — the ones they're watching, so they aren't searching "Jeff… Jeff what?" every time. Per trainer, on `trainers/{uid}.kaizenRoster` |
| **Client profile** | Opened from the directory or the roster: the whole record of a person. "The four tabs run by depth: Journey (what she has done, the glance on the floor), Programming (what she's meant to do), Notes & Profile (who she is), Activity Archive (the whole record). Don't reorder, merge or add a tab without asking." |
| **Start Session** | The door to the Active Session — briefing, live grid, wrap-up. Ranks 1 to 3 |
| **Learning** | The protocol, every machine, and guides and coaching cues on becoming a better trainer |
| **My Studio** | "How can I help the team right now?" Relay · Openings · Machines · Team · Studio. **Openings** (since Sep 27 2026) is when the studio is usually busy, what opened up in the next 7 days, what to offer a client for good, and who's usually in |
| **My Profile** | A trainer's own rundown — who's coming up, how their coaching is going — and, since Sep 27 2026, **My standing week**: when they usually take clients (up to three blocks a day) and their regulars, proposed to a studio leader, and the days they're away; and, since the Openings round, **Your week** (clients trained, session time, first session to last) and **My clients** (the clients they have trained most). Another trainer's profile can't be opened in the app, so colleagues' agreed weeks are seen on My Studio → Openings → Who's usually in |
| **Operations** | "Where are we going wrong, and where are we going right?" Take what the app has gathered, put it together, see what it says |
| **Admins dashboard** | Corporate setting the standard, the machines, and getting everyone set up for success |
| **Switch studio** | In the header. Decides which floor loads, whose roster you search, which schedule you see — more than a preference |

### "I want to change…" → look here

| If you want to change… | It lives in |
| --- | --- |
| The screen a trainer uses during a set | `src/components/WorkoutTrackerView.tsx` |
| The Hub — the day's grid, its cards, the top, the peek, and the Opportunities list | `src/components/ClientsView.tsx` (the screen) + `src/features/hub-schedule/` (the grid) + `src/features/hub-opportunities/` (the list and the one engine both read) — read their `README.md`s |
| The Calendar | `src/components/CalendarView.tsx` + `src/features/calendar/` |
| The client directory and the Kaizen roster | `src/features/client-directory/` (read its `README.md`), `src/features/trainer-profile/` |
| What the trainer reads before a session | `src/features/briefing/` |
| What the trainer sees after a session (the Wrap-up) | `src/components/WrapUpScreen.tsx` |
| The client's profile and its tabs | `src/components/ClientProfileView.tsx` + `src/features/client-profile/` |
| A client's Notes & Profile — the Overview and six pages (the client codex) | `src/features/client-codex/` — its README says which folder each page lives in |
| Notes — writing them, when they matter, threads | `src/features/client-notes/` |
| How a machine is set up and described | `src/features/admin/machines/` (the editor) and `src/data/machine-definitions.ts` (the twenty) |
| A studio's own floor and its machines | `src/features/my-studio/` |
| The studio-leader dashboards | `src/features/admin/` |
| The company-only screens | `src/features/admins/` |
| The board, tasks, kudos, private notes | `src/features/relay/` |
| A trainer's standing week, the days away, and the week's free slots | `src/features/standing-week/` |
| Openings (the usual week, what opened up, what to offer, who's usually in) and the Wrap-up's Times with room | `src/features/openings/` (the rules and every sentence), `src/features/openings/ui/` (the screens) |
| Your week and My clients on My Profile | `src/features/trainer-profile/` |
| Who counts as working at a studio (every list of "the team") | `src/lib/who-works-here.ts` |
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
- **`master`** — the real one. **What is on `master` goes live to
  trainers at the next deploy.** That is why work waits on a branch. (As
  checked on Oct 6 2026, a push alone does not deploy: Render can't see the repo, so AJ
  presses Deploy on the web service and on both cron jobs.)
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
  says "check-in" in places; same thing.) Only that: the line on Relay's Now
  Bar about what teammates just did is **Just now** since Sep 27 2026.
- **Briefing and Wrap-up** — the briefing is before a session and only
  before; the Wrap-up is the screen after Finish. The End Session box is the
  **Note for the next trainer** (it reaches their briefing, and can be filed
  to the profile too); the Wrap-up's own box is the **Profile note**, which at
  Note loudness stays on the profile.
- **A thread** — a note is not a fact, it is a story. Updates hang off the
  original rather than becoming new notes. Contradicting a note *adds* to it.
- **Mattering** — when a note applies: Always · From–until · Only on a day.
- **A standing week** — a trainer's usual week at a studio: when they take
  clients (up to three **blocks** a day, with the breaks left out) and their
  **regulars** ("Judy, Monday 8:00"). The trainer proposes it, a studio
  leader agrees it, and Journey checks the coming week's bookings against it
  to find the **free slots**. It never books or holds anything in Mindbody.
  A trainer's days **away** block out their slots, and a regular booked on
  the **studio rotation** ("{studio} Rotation") at her time counts as usual.
- **Openings** — the My Studio section that shows when the studio is usually
  busy and quiet (**the usual week**, built each Sunday from eight weeks of
  bookings), what opened up in the next 7 days, and good times to offer a
  client for good. It never books and pings nobody. A time's word is Always
  full, Usually full, Usually has room, Mixed, or Usually N booked.
- **Counted** — a past day Openings counts: Journey read its bookings in full
  from Mindbody (the day before, the day, or after) and the studio was open.
  **Judged** — a counted day where everyone with a booking is known (every
  trainer booked had an agreed week). Only a judged day says full or room;
  otherwise Openings says how many were booked.
- **A mark** — someone's word on a time, **Always full** or **Usually has
  room**, beside the numbers and never in place of them. Anyone at the studio
  can set one, as themselves.
- **Who's usually in** — the part of Openings listing everyone's agreed week,
  read only: where you see a colleague's usual week.
- **Times with room** — the door on the Wrap-up, and the sheet it opens: the
  times with room, with no names, safe to turn to the client.

**About machines** — this is the part that matters most for franchising

- **The catalog** — the twenty-odd machines Max Strength knows. Company-owned.
- **The standard set** — which of those a new studio starts with.
- **A studio's floor / roster** — what *this* location actually has.
- **Inherit** — a studio automatically gets corrections from the catalog for
  anything it has not deliberately changed.
- **Adopt** — a studio chooses to take a new machine. Nothing is ever pushed
  onto a floor.
- **The template boundary** — *Max Strength owns the method; a studio owns its
  hardware.* The method (the musculature, the cadence, the turnarounds, the
  cues) is the product, and every location starts from the same words. A
  location sets up the unit in its room: the name, seat positions, dials and
  starting weight. Since Sep 28 2026 a studio may change anything on its own
  copy, the method included (AJ answered "Yes, as built" on Oct 2 2026); the
  change reaches that floor only, and head office sees every difference on
  Compare. A studio may **add** a safety warning, and may take one of the
  catalog's off its own copy only with a reason, which is recorded and shown
  to head office (AJ, Sep 21 2026; built Sep 28 2026).
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
     *count* to a baseline (2 as of Oct 7 2026). It is not zero and that is
     fine.
   - **Tests** — more than 12,000 small checks that pure logic still does what
     it should.
   - **Build** — does it actually assemble into a website?
5. **You look at it on the iPad**, for anything a trainer touches. This step
   cannot be skipped or automated. A green typecheck and green tests have all
   passed before while a screen crashed on every tap.
6. **It merges to `master`** — which is not yet the deploy. Nothing reaches
   trainers until you press **Manual Deploy** on the Render web service (and
   **Manual Build** on both cron jobs). A push deploys nothing; Render can't
   see the repo (checked Oct 6 2026).

**Three things deploy separately and are easy to forget:**

- `firestore.rules` — the security wall. Needs `npm run test:rules` on your PC
  first (it needs Java installed), then a Firebase deploy.
- **Indexes** — Firestore needs to be told in advance about certain searches.
  Ours is the Enterprise edition, which builds none by itself: a search with
  no index still answers, by reading the whole collection and billing for it,
  so nothing fails and nothing looks wrong — it only costs and slows. A test
  (`firestore-indexes.test.ts`) fails for any search without one.
- **Cloud Functions** — the Mindbody webhook handlers and the trainer rollups.

The order is always: **indexes → rules tests → rules → push → Manual Deploy on
Render.** Rules go first when they only *add* access, so the running app is
unaffected and the new version finds its permissions already waiting.

### What only you can do

Claude's shell on your PC can run `git`, the typecheck, the test suite and the
build when it works in a worktree that shares the main checkout's libraries;
what it cannot do is the live side. So these are yours:

- `npm run test:rules` — the only real check on the security wall
- Deploying rules, indexes and Cloud Functions, and pressing Deploy on Render
- Looking at the iPad
- Anything that writes to the live database from a script

---

## 7. How to ask for a change so it goes well

This is the section that will save you the most time.

**Say what should be true, not what code to write.** "A trainer shouldn't be
able to finish a session without a reason for a skipped machine" is a better
brief than "add a validation to the finish handler". You know the gym; Claude
knows the file.

**Name the screen and the moment.** "On the client's profile, in Activity
Archive → Sessions, when I tap a past session" beats "in the history thing". Screenshots are
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
about 500,000 lines (tests included), more than 12,000 automated checks, a
security model, a franchise model and a method encoded in it (counted Oct 7
2026). That is not a small thing.

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
