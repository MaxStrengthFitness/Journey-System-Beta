# FORD and the profile merge — Sep 15 2026

Branch `ford-and-profile-merge`, six commits, one per phase.

Two things in one round, because they are the same thing: AJ asked for the
Lifestyle category to become a FORD hub, and for the client details to be
merged with the journal — "currently the client's profile seems very cluttered
and it has a lot of overlap of redundant information".

---

## 0 · Leaving Google AI Studio

The AI Studio sandbox round is abandoned. Nothing it produced ever touched
application source: the sandbox vite config, the launcher page and the slimmed
`package.json` existed only inside the zip, built in a throwaway clone. Master
was already clean.

What was actually rolled back was two leftovers from when the app was
*originally* scaffolded in AI Studio, wrong for months:

- `README.md` opened "Run and deploy your AI Studio app", pointed at a
  placeholder `ai.studio` URL, told you to run `npm install` (which fails on
  this dependency tree) and to set a `GEMINI_API_KEY` that deploy-hardening
  removed. Rewritten.
- `vite.config.ts` described `DISABLE_HMR` as an AI Studio mechanism and
  carried a mojibake em-dash. The escape hatch is kept, described for what it
  is.

`journey-system-for-ai-studio.zip` at the repo root is deleted by hand — it is
gitignored, so it was never in the tree.

---

## 1 · What the profile audit found

Not opinions. Line numbers.

| | |
| --- | --- |
| Four of six dossier sections | embedded a `JournalRail` rendering the same notes the Journal tab was showing |
| `client.events` | was an editable Events section **and** a stream of journal `life` entries |
| Six profile textareas | (`medicalHistory`, `clinicalNotes`, `globalNotes`, `discoveryNotes`, `priorityNote`, `mindbodyNotes`) were edited in Details and adapted into journal cards at the same time |
| "Original why" / SMART goal | lived on the client record **and** inside every progress report |
| `statistics_disabled` + `details_disabled` | 1,992 lines with no trigger — unreachable for months, roughly half the file |
| The Lifestyle journal rail | **could never render anything.** `sectionForEntry()` had no case returning `"lifestyle"` and `profileSection` is written nowhere in the codebase |

That last one was lucky: the section we were asked to rebuild as the FORD hub
was the emptiest on the screen, so rebuilding it cost nothing.

---

## 2 · The FORD data model

One document per detail at `clients/{clientId}/ford/{fordId}`.

**Why a subcollection.** `journalEntries` is readable by every signed-in user
in the live rules, and a client's home life is not company-wide reading. Under
the client it inherits the studio scoping — the tightest boundary the app has.
An array on the client document would have been private too, but could never
answer "what is coming up across every client at this studio", which is the
entire point of capturing any of it. A subcollection is private **and**
sweepable, via a collection group query scoped by a denormalised `studioId`.

**Why `pillar` is nullable.** Null means caught-but-not-filed. Mid-set a
trainer types the sentence and saves; the category is chosen at teardown.
Requiring a pillar at write time would put a decision between hearing the
thing and recording it. The rules deliberately do not validate it.

**Two layers.** `isPinned` splits standing facts ("wife is Karen") from dated
moments ("Ethan graduates in May") — one document type, so a moment that turns
out to be permanent needs no retyping.

**The gesture.** `opportunity`: `idea → planned → done → declined`, with an
owner and an outcome. The outcome is the field worth reading a year later.

**Dates roll forward.** An anniversary recorded in 2019 reads "in 12 days".

**`client.events` is adapted, not migrated.** Read as FORD entries at read
time and flagged `isLegacy`, the same trick `useClientJournal` plays on the old
note collections. The array stays on the record untouched; the personal types
(birthday/anniversary, vacation, snowbird) come across and studio admin ones
are dropped as noise.

Rules: one `match /{path=**}/ford/{fordId}` block. The recursive wildcard makes
the collection group read legal and also covers single-client reads, so there
is one rule rather than two that can drift. Three indexes added.

---

## 3 · Catch it on the floor, file it at teardown

**Remember this** is the second mode of the Session Notes sheet — reached from
the Notes button a trainer already knows, not a new control on the session bar,
which is already the busiest strip on the screen. One box, one button, no
category required, and the keyboard comes straight back because a client who
is talking usually says two things.

The two modes are deliberately not merged. A coaching note is structured on
purpose (kind, category, importance, machine); a FORD capture has exactly one
field because it is typed mid-sentence.

**The sweep** sits on the post-session screen between Next and Lifetime.
Unfiled captures come back as cards with four big buttons; one tap each. It
renders nothing when there is nothing outstanding — an empty tray asking to be
dismissed would be worse than no tray. Filing is optimistic: the card leaves on
tap rather than after the round trip, because on studio wifi that wait is long
enough to tap twice.

Nothing here blocks Finish.

---

## 4 · Seven tabs become six

Details and Journal are one **Profile** tab: one scroll, eight sections, in
the order a person is actually read.

`Who they are · Life · Body · Goals · Focus · Notes · Reports · Admin`

- **Life** replaces Lifestyle and is the FORD hub. Occupation stays a
  structured field beside it, because the occupational matrix reasons about it
  in a way free text cannot — the sentence and the dropdown are different jobs.
- Its dropdowns (activity level, recovery, experience, training pedigree)
  moved to **Body**: how much load someone already carries is a programming
  input, and belongs beside the constraints, not beside their grandchildren.
- Lead source and referred by moved to **Admin**, where acquisition data lives.
- **Events** is deleted as a section — see the adapter above.
- The per-section journal rails are gone **except on Body**, where a
  limitation noticed mid-session is safety information and belongs beside the
  clinical fields.
- **"Personal" is gone from the journal composer.** Personal detail has a real
  home now. Existing `life` entries still render everywhere they always did;
  only the way to create a new one moved.

`ClientJournalTab` takes an `areas` list and an optional preloaded `journal`.
Given `areas` it suppresses its own jump nav and critical rail, because the
spine owns navigation and the snapshot bar already carries the critical count.
The dossier loads `useClientJournal` **once** and hands the same result to all
three mounts.

`ClientProfileView.tsx`: **4,158 → 2,159 lines.**

---

## 5 · The delight loop closes

**Operations → Delight queue**, beside Renewals. Every gesture the team has
promised itself, across every client at the studio, grouped This week / This
month / Later / No date. An unowned gesture says so in the urgency colour,
because a gesture with a date and no owner is the one that does not happen.
Undated ideas are kept deliberately — "wishes they had help with the garden"
has no date and is one of the best gestures on the list.

**The briefing line**: one quiet row below the critical strip — the soonest
dated detail, or a standing fact, or, when nothing is on file, a question to
ask drawn from the thinnest pillar so the record fills out evenly. Prompts
rotate by day so four trainers are not all asking about the dog on the same
Tuesday. One row, not a section, and gone entirely when there is nothing worth
saying: a personal detail must never compete with a contraindication for the
eye.

---

## Verification

- `npx tsc --noEmit` — **18**, down from the 20 baseline (the two dead panes
  owned two of them).
- `npx vitest run src` — **2,046 passing**, 1 skipped, 109 files. Baseline was
  2,027; the 19 new ones are `src/features/ford/ford.test.ts`.
- `npx vite build` — clean.
- Every FORD surface was rendered in a throwaway harness with stubbed
  Firestore and screenshotted at five viewports in both themes. Zero uncaught
  page errors. Two real layout bugs were found and fixed that way: details
  were centre-aligned when they wrapped (a `<button>`'s UA default beating a
  utility class) and the tray's file-it buttons stacked one per line. Both are
  now handled in `ford.css` rather than by utility classes, so they cannot be
  lost to layer ordering again.

## Before it goes live

1. `firebase deploy --only firestore:indexes` — the Delight queue needs its
   collection group index and will say so until it has run.
2. `npm run test:rules`, then `firebase deploy --only firestore:rules`.
3. Push `master`. Render deploys on push.

## Open / deliberately not done

- No migration of `client.events` into real FORD documents. The adapter means
  none is needed; if one is ever wanted it is a script, not a blocker.
- `subject` is on the document and written by the dialog but nothing groups by
  it yet. It is there for the event planner.
- The Delight queue reads the whole studio in one query with `limit(200)`.
  Fine for a studio; revisit if a franchise-wide view is ever wanted.
- FORD is not in the progress report or the check-in. Deliberate — AJ's
  decision (Sep 12) keeps Dreams separate from the clinical goal.
