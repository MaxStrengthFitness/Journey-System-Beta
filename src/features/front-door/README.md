# The front door

Every screen before the app's shell: sign in, checking you in, can't check,
the greeting, the studio picker, the access request and its waiting page.
Built Oct 3 2026 from AJ's pick of three directions ("three squares (a) is
just so good"); the round is `docs/rounds/2026-10-03-front-door.md`.

## The look: the three squares

The logo's M, A and X squares are the front door's only decoration and its
motion (`kit.tsx`, `Tiles`):

| Mode | Where | What it does |
| --- | --- | --- |
| `assemble` | sign in, opening Journey | the squares drop together, one after another |
| `steps` | checking you in, can't check | unlit until their step is done: signed in, your record, your studios |
| `open` | going into a studio | the M and X part, the A opens like a door (650 ms) |
| `still` | the small mark at the top of each screen | |

Always dark, in both themes: it is the brand's moment and the same navy every
time. The brand colours are named once, in `front-door.css`; nothing else in
the folder writes a colour. Every motion stops under Reduce Motion, and the
door then opens at once (`prefersReducedMotion`).

## The rules it keeps

- **Signed in is not "not on a team".** `useAuthInitialization` says where the
  lookup is (`trainerLookup`: checking, done, failed). AppContent shows
  `CheckingIn` while it runs, `CantCheck` when the record couldn't be read, and
  the access request only after a finished lookup that found nobody. Before
  this, every returning trainer saw "not registered as an authorized trainer"
  flash, and a trainer on bad Wi-Fi was treated as a stranger.
- **The app opens on the trainer record, never on a chain of reads** (the
  speed round, Oct 5 2026, R4). The record is read from the iPad's own copy
  first (`getDocFromCache`) and the app opens on it; a live watch on the
  person's own record takes the server's copy when their access changed
  (role, studios, switched off) and fetches a fresh role claim then. The
  studios, trainers and networks are read together, from the copy first,
  while AppContent's listeners bring the server's answers. Each list says
  how much is known (`boot-lookup.ts`: unknown, the copy, the server): the
  picker shows Checking you in rather than "No studios yet" or "Not on a
  studio's team yet" off a list that hasn't answered, team sizes and today's
  lines wait for the trainers, and nothing is dropped as missing (the open
  studio, the iPad's pinned studio) until the server has said so. A copy
  that says switched off is not trusted to refuse anyone: the server
  decides. The role claim is read for at most two seconds; a claim known to
  disagree with the record waits up to ten for the fresh token, because a
  leader-only listener started on the old one stays refused until a reload.
  The copy of a LIST counts only once this iPad has had the server's whole
  answer for it before (`journey_list_seen_<list>` in local storage), and a
  copy of the trainers holding one record (the person's own, read at
  sign-in) never does: that would say "1 on the team". The flags belong to
  the iPad, like its Firestore copy, so a sign-out keeps them; and the list
  listeners listen with metadata changes, or the server confirming the copy
  would raise no event (`listDeliveryGate`). A record the server
  says is gone is looked up again quietly, never Checking you in over the
  Hub or a session. Anything that rewrites a whole array on the record (the
  Kaizen Roster) reads the server's copy first.
- **Whose iPad it is is always on screen.** iPads change hands at the start of
  the day (AJ: "sometimes trainers pick up the wrong ipad"). The sign-in screen
  says which studio the iPad opens (`DEVICE_STUDIO_KEY` in
  `lib/default-studio.ts`, kept across sign-out), and every screen after it has
  `WhoChip`: "Austin · Not you? Sign out".
- **The iPad's studio greets; it no longer opens by itself.** After a sign-in,
  someone with a studio to go to (the iPad's, else home, else their only one)
  sees the greeting: their name, today there, one orange button. Leaders get
  the same (AJ: "they will probably want to look at the daily schedule"), with
  Operations as a link at the foot. A reload with a studio already open goes
  straight back to it, as before.
- **Today, never a zero it didn't read.** `useTodayGlance` makes two reads for
  the one studio it greets with: the day's bookings (the Hub's query shape, so
  its index exists) and a count of open team jobs. "Yours" is the Hub's own
  `columnIdOf`. A read that fails leaves its line out (`glanceLines`).
- **A request is remembered.** `my-request.ts` keeps it at
  `access_requests/{uid}` and reads it back by that id (no index). The waiting
  page says who has it and what happens next, with Check again. Clients are not
  offered (they don't use Journey). New hires wait for a leader: no Demo Mode
  before they're let in (AJ, Oct 3 2026).
- **Errors are sentences.** `sign-in-errors.ts`: what happened, that it's
  usually not you, the one thing to do, and the technical detail after it for
  head office.

## Files

| File | What |
| --- | --- |
| `kit.tsx` | the pane, `Tiles`, `WhoChip`, the provider marks |
| `front-door.css` | the whole look |
| `CheckingIn.tsx` | checking you in, and `OpeningJourney` (before Firebase answers) |
| `CantCheck.tsx` | the record couldn't be read |
| `boot-lookup.ts` | what is known about each list at boot, and when the picker waits (pure, tested) |
| `today-glance.ts` | the greeting's sentences (pure, tested) |
| `useTodayGlance.ts` | its two reads |
| `my-request.ts` | the person's own access request |
| `sign-in-errors.ts` | what a failed sign-in says (pure, tested) |

The screens themselves keep their old homes: `components/LoginScreen.tsx`,
`components/AccessRequestView.tsx`, `components/StudioSelectionView.tsx` (the
greeting and the picker). All three are mounted in `*.render.test.tsx`.

The three directions AJ chose between are a git-ignored page,
`harness/front-door.html`, in the worktree it was built in.
