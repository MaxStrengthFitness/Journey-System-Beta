# The voice review follow-up — AJ's answers to the audit, built

*Sep 27 2026. Branch `voice-review-followup`: `origin/master` (`148357b`, the
Home Screen status-bar fix), plus a test-only CI fix from another session
(`df4933e`), plus seven units built side by side and then lined up in this
order: A, E, B, C, D, F, G. Last comes one commit for the loose ends between
the units (`10da42c`). The round before this one is
`2026-09-27-voice-review.md`, and the standing week has its own document,
`2026-09-27-standing-week.md`.*

## What AJ asked for

AJ sent his voice review of the Screen Atlas again, the recorded notes
the voice-review round was built from, and asked for every item in it to be
checked against the app as it now stands and for anything still missing to
be finished. Nothing was to change until the checking was done.

## The audit

The audit changed nothing; it only read the code. Sixteen agents took eight
slices of the voice review. In each slice one agent read the code and wrote
down what it found, and a second agent (a sceptic) checked every claim
against the code. The slices were: the Wrap-up in the code, the Wrap-up in
the docs, the network move, the profile's tabs, My Studio → Team, the
standing week, the look of Learning and Settings, and the look of My Studio.

**Already built, and working as the round said.** The Wrap-up is named
everywhere and "briefing" appears only before a session. The Note for the
next trainer reaches the next briefing as a Heads up, and the Profile note at
Note loudness stays off it. Relay is Floor · Mine · Notes, the network's focus
and launch are on Operations, and nothing ranks studios. The profile's four
tabs run in AJ's order and a test holds the order. Team is people and
standards. The standing week proposes, agrees and checks, and writes nothing
to Mindbody. Settings and Learning's colours were done.

**What it found still wrong:**

- The Note for the next trainer showed twice on the client's Notes page
  (since Sep 18). It also came back in the Wrap-up's To-file tray with a
  Discard button, and Discard would have taken it off the next briefing.
- On the light theme, parts of the Wrap-up were unreadable: the dose Dial,
  Loudness and the To-file tray were still drawn dark, so some words were
  white on white.
- Inside Demo Mode, a franchise owner could see and save their real
  network's focus. An owner of a network nobody was named on ("Choose later")
  had lost the focus door Relay used to give them. A focus with only its
  floor line set showed "This quarter · " with a dot and nothing after it.
- One Firestore index was left behind by the dropped studio ranking, and
  nothing uses it.
- Team built three different lists of "who works here". The initiative
  roll-up listed the person who had done least first, on the Floor every
  trainer sees. Operations → Staff & Roles was a second editor of what Team
  already does, and offered a studio leader roles the rules refuse. A head
  trainer's role was labelled "Studio Leader", so the role picker showed
  Studio Leader twice.
- The standing week's check read a cached answer as a real one, so an iPad
  with no connection could call agreed slots open. That is the one thing AJ
  said it must never do. One rebook could be named for two slots, and a
  shared time could read as "taken".
- Some messages named places that no longer exist (the Journal, the
  Equipment tab, the History tab, Hub → Machine Settings). The InBody task
  opened the wrong page, and leaving a progress report landed on Journey
  rather than the Reports shelf.
- Learning and My Studio had never had the visual pass the rest of the app
  had. There were taps under 40px, names cut off with "…", faint text meant
  to be read, and colours meaning different things on one page (a flagged
  machine was crimson on its badge and amber in the card below it).

The audit ended with questions for AJ, and he answered them.

## AJ's answers

1. The End Session note: *"Ideally the end session note is made for the next
   sessions pre session briefing but also can be filed to the profile".*
2. The Wrap-up's confetti: *"I like it keep it."*
3. The network's focus: an owner may set the focus of every network that
   holds a studio in their scope, as Relay allowed.
4. The initiative roll-up stays on the Floor for everyone (*"the hub should
   have everyone"*), in name order.
5. Operations → Staff & Roles is read-only for the studio tier, with a door
   to My Studio → Team; owners and administrators keep the editor
   (*"yes"*).
6. Who is the team: *"everyone who works there".*
7. The standing week:
   - *"Unbooked slots are just open"*.
   - Seven days stays: *"7 days works, 14 can be loaded on the calendar view
     if needed"*.
   - Colleagues: *"Trainers can see the whole studios schedule ... schedules
     are open to all"*.
   - Vacations: *"if someone has a vacation then it should block it out"*
     (in Journey only).
   - The studio rotation: *"Some studios use a 'studio rotation' to book
     Wednesdays and Saturdays and rotate a trainer each week ... any client
     can schedule that day on mind body and then whatever trainer works that
     day can just move those sessions to them."*
   - Reading Mindbody's recurring series: *"As long as our cost remain low
     then yes"* (the research below found there is nothing to read).
   - The Hub outline: he did not understand "agreed slot", so it was not
     built. It is explained below under "Open, for AJ".
8. *"I trust your color choices and font choices, configure names now and
   they will be confirmed during my screen audit."*
9. *"clean all wording you wish".*
10. The role picker: *"Trainer, Head trainer, Studio Leader/Owner"*, so
    `HeadTrainer` is labelled **Head Trainer**.

---

## What was built, unit by unit

### A — The Wrap-up and its two notes

For trainers on the Wrap-up, the screen after Finish:

- **The Note for the next trainer can be filed, never discarded, on the
  Wrap-up.** It still comes back in the To-file tray, so it can be filed to
  the profile with one tap, as AJ asked. Its card now reads "Note for the
  next trainer · on the next briefing" and has no Discard button. Every other
  loose note keeps Discard. Filing only puts the note in a category, so a
  filed note is still a Heads up on the next briefing, and tests prove it.
- **It shows once on the client's Notes.** The second, read-only "Session
  summary" copy is left out when the words match exactly. A note edited later
  in History still shows, and sessions from before Sep 18 keep their card.
  Only how the notes are read changed; no stored data changed.
- **The confetti stays**, as AJ asked. It lasts a little over a second, never
  blocks a tap, never repeats, and its colours now show on the light theme too.
- **The whole Wrap-up follows the app's theme.** The Dial, Loudness and the
  To-file tray are no longer drawn dark on a light page, and every colour is
  one of the app's. The page title, the card heads and the buttons use the
  app's type: bold sentence-case buttons, text on the 11 / 12 / 14 / 17 / 30
  scale, and a brand-blue focus ring. "Where the work went" colours Lower Body
  sky, Upper Body amber, Core & Spine the strong neutral and Other grey, never
  the hero orange or the brand blue. The dark theme looks as it did.
- **Messages that sent trainers to "the Journal"** now say Notes & Profile →
  Notes.
- Behind the scenes: Finish lost a note path nobody used, an unused
  Low/Medium/High helper went, and the code calls the two notes by their names
  (Profile note, Note for the next trainer, and "session summary" for a
  session's own note, `sessions.notes`).

Commits: `b62e73e` (A1, filed never discarded), `426cc65` (A2, shown once),
`f035850` (A3, Finish's unused path), `bae61ff` (A4, the names in the code),
`cd8b1f4` (A5, the confetti and the light theme), `ed8f3ea` (what the review
found).

### E — The profile's wording, and where buttons land

- **Messages name places that exist.** Saving a machine setting from the
  machine sheet during a session says "Logged to the machine's history
  (Programming → All Machines)". The renewals hint cites the Activity
  Archive. The profile's "Profile Setup Needed" alert sends the routine to
  Programming and the details to Notes & Profile. The consultation's lost-note
  message names Notes & Profile → Notes. The Activity Archive tab's tooltip
  names the Deep Dive.
- **New names** (AJ's answer 9, to be confirmed in his screen audit): the Hub
  card's "History" is now **Past sessions** (it opens Activity Archive →
  Sessions, and fits on two lines in the same square). The clinical strip's
  button is **Edit in Body & Pulse**, now a 40px tap. On the 90-day report,
  "Lead Practitioner Wrap-Up" is **"Your closing note, printed at the end of
  the report"**, so "Wrap-up" means only the screen after a session.
- **Two buttons land where they say.** Relay's InBody task opens Notes &
  Profile → Body & Pulse at the InBody card; it used to land on Journey.
  Leaving a progress report returns to Activity Archive → Reports and reads
  **Back to Reports**. These jumps, and the Hub's Past sessions, happen only
  if the trainer really leaves. If the unsaved-changes question comes up and
  they stay, nothing is left behind, and the next ordinary visit still opens
  on Journey.
- **The tab row is held to AJ's order.** A new test checks the tab row drawn
  on screen: one row, tabs only from `PROFILE_TABS`, the four panels in the
  same order. Five style rules that never worked were deleted, and the row
  looks as before.

Commits: `a3f2da6` (E1, messages), `0d8f774` (E2, the InBody task and Back to
Reports), `810e600` (E3, the tab row), `b743f9f` (E4, comments and READMEs),
`343993b` (what the review found).

### B — The network's actions, and Relay's leftovers

- **An owner can set the focus of every network that holds one of their
  studios** (AJ's answer 3), whether or not the network names them, which is
  what Relay allowed. The voice-review round had claimed "nobody loses the
  door", and that was not true for owners of networks made with "Choose
  later". Inside Demo Mode no real network is offered any more (the leak is
  closed). When no network holds the studio the panel says so by name
  ("Solon is not in a network…"). Until the networks have been read it says
  "Can't see the networks yet" instead.
- **The focus line reads properly.** A focus with only its floor line shows
  "This quarter" with no stray dot. On Operations the editor says who set it
  and when, "Set by Ann Owner on Sep 27, 2026.", the first reader of the
  focus's date.
- **The unused index goes.** The task instances index by status and date
  served only the dropped ranking's "Loops closed". It is out of the index
  file, and the live one is deleted by hand (see the deploy order).
- **Dead code went.** The one-tier Relay gate (`RoleGate.tsx`) is deleted, and
  My Studio asks `leadsHere` directly. The feature READMEs say where Relay,
  Team and the network live now.

Commits: `6481beb` (B1, focus for every network in scope), `2efa6a7` (B2, the
focus line and its date), `942f846` (B3, the Relay gate), `9940f83` (B4, the
index), `616d07f` (B5, the feature notes), `ef6cb55` (what the review found).

### C — Team, Staff & Roles, and who works here

- **One answer to "who works at this studio"**, `src/lib/who-works-here.ts`,
  from AJ's "everyone who works there". Someone counts when the studio is
  their home, a studio they also work at, or one they are a guest at, and
  their account is active and not replaced. A placeholder nobody has claimed
  is left out, except Demo Mode's own seeded trainers. Team's People, the
  initiative counts, the people pickers (Floor, Mine, Capture, the job
  composer), Team's standing weeks and Settings' "N people on the team" all
  ask it. So a trainer who floats between studios now has a card and is asked
  to do initiatives, and in Demo Mode the standing weeks list Demo Mode's own
  trainers, and anyone who has written a practice week there (the final
  review, K below).
- **The initiative roll-up is in name order everywhere**, the Floor included
  (AJ's answer 4).
- **Team's sentences count what they name.** Open loops keeps a machine
  reported on the shift list for Team's seven days, once per machine, until
  the same check on the same machine is done clean on a later day. Kudos for
  an answered ask reach the person who answered it. "Finished …" says "in the
  last seven days" and counts only those seven days. The leftover "behind /
  on track" verdict is gone from the code.
- **Staff & Roles has one editor** (AJ's answer 5). Studio leaders, head
  trainers and studio owners see the list read-only, with a button, "Open My
  Studio → Team", where they let people in. The button is offered only to
  someone who runs the studio the app is in (K below). Franchise owners and
  administrators keep the editor. Under "All my studios" the list is the
  reader's own studios, not the whole company. The page says the Mindbody
  match is per studio, and "No Mindbody match" is said only once a studio's
  Mindbody list has actually been read ("Has an account" until then).
- **A head trainer is called Head Trainer** (AJ's answer 10). The studio
  tier's picker offers Life Transformer, Head Trainer and Studio Leader;
  owners and administrators also see Studio Owner and Franchise Owner. The
  grant's hint reads "Opens Team and Studio at {studio}, and lets them change
  its machines".
- **Small fixes.** The Floor's Assign button asks the same "leads this
  studio" question as everything else, so trainers with the grant see it and
  a head trainer visiting another studio does not. The seven-day duty grid
  works without a mouse (each square says its day and count, a one-line
  legend, a tap shows each day). `board/TeamCockpit.tsx` is now
  `board/OpenLoops.tsx`. Team opens one listener per open initiative instead
  of two.

Commits: `4e62a74` (C1, who works here), `4f78841` (C2, name order),
`6dcfd65` (C3, Team's sentences), `2c6c0a6` (C4, one editor), `eae863b` (C5,
Head Trainer), `8547a92` (C6, small fixes), `8b46f33` (C7, one listener),
`3309876` (C8, tidying), `1e219c9` (what the review found).

### D — The standing week: offline, the check, away, colleagues, the rules

- **Offline says "can't tell".** Team's week check waits for the server
  before it calls any slot open ("Reading the week's bookings…"). Offline, or
  with no answer in 15 seconds, it says "Can't tell: this iPad can't reach the
  week's bookings just now…" and lists nothing. The standing weeks themselves
  also wait for the server's first answer, so nobody is said to have "not
  proposed" off an empty cache. The Operations Overview reads its bookings
  exactly as before.
- **The check claims only what it knows.** One rebook is named for one slot
  only. A booking under a different spelling of the trainer's name keeps the
  regular's slot instead of calling the week moved. Another regular in their
  own slot at a shared time no longer "takes" it. A Mindbody staff number only
  ever confirms that a booking IS the trainer's, never that it isn't: staff
  are numbered per Mindbody site, and a different number had turned rotation
  bookings, and every booking of a trainer on both sites, into moves. A slot
  earlier today is simply open (AJ: "Unbooked slots are just open").
- **The studio rotation counts as usual.** A regular booked "{studio}
  Rotation" at her time is never moved, taken or a Free slot, however the
  booking reached Journey.
- **Away.** A trainer sets the days they are away on My Profile (under My
  standing week), even with no proposal; a leader can set them in Team's
  Review. No agreement is needed. Each range saves as it is added or removed,
  past ranges drop off, and up to six upcoming ranges are allowed. Team says
  once "Sam is away Mon, Sep 28 – Wed, Sep 30.", and those days are not
  checked (no open, moved, taken or Free slot). Nothing goes to Mindbody.
  Offline, a range is "Saved on this iPad" and sends when the connection is
  back, and a line under the note says everyone at the studio can read it
  (K below).
- **Colleagues see each other's weeks** (AJ's answer 7). A colleague's
  profile has a read-only Standing week card at the active studio: their
  agreed hours and regulars, and days away that haven't ended, or "No agreed
  week yet". The proposal waiting on a leader and its note are not shown.
- **A leader's changes never vanish.** Opening another person's Review or
  Change asks first: "You have unsaved changes to Ann's standing week. Leave
  without saving?" Since the final review, so do the Review's Cancel, Agree
  or Remove with dates away still being typed below them, and the dates-away
  adder's own Cancel.
- **The rules.** A trainer's own write can no longer change which trainer a
  week's bookings are matched to (`trainerId`) once the week exists; the app
  keeps the stored id on a trainer's own saves (K below), so nothing it does
  is refused. Trainers and leaders may
  write the away list, shape-checked: at most six ranges, each with real dates
  and the last day on or after the first.
- **Small things.** The Review says "Proposed by {name} on {date}". The
  heading is "Each person's standing week". Demo Mode's seeded appointments
  are called "the demo week". The standing-week README records D1 to D7.

Commits: `cdf9241` (D1, offline), `ae75a2a` (D2, the check), `9ab5611` (D3,
away), `fffd59d` (D4, colleagues), `c078c5f` (D5, the leave question),
`ca9c72e` (D6, the rules), `a25f853` (D7, small things), `1c4bd78` (what the
review found).

### F — Learning, Settings and My Profile's buttons

- **Words.** The two "no machines yet" messages say a studio leader adds
  machines on My Studio → Machines (they named "Hub → Machine Settings").
  Settings' Operations card names all nine tabs.
- **Typing is never lost without a question.** A machine's studio notes and
  studio setup card, the studio page and note editor, and the comment box
  join the unsaved-changes guard. The bottom bar, Learning's sections, the
  breadcrumb, a search pick, the Overview's tiles and the links inside a page
  all ask first. "Leave" puts the card back to what was saved, so a draft can
  never be saved onto another machine. On My Studio → Machines and
  Operations → Floor, the machine's door asks too before its X, Escape or
  another machine in the list takes the typing (K below).
- **One colour per meaning.** A flagged machine is plum, the caution colour,
  on its badge, the Flagged count, the contents cards and the Overview; it was
  crimson on the badge and amber below it. Every Save is solid brand blue,
  Learning's and My Profile's primary button included. Retire keeps a visible
  danger style.
- **Readable text and figure.** Text trainers read moved off the faint ink;
  each movement category has a readable text shade; the body figure's worked
  muscles stand out from the rest (3.2 to 1 in light, 4.1 to 1 in dark,
  against 1.04 before).
- **Taps and whole names.** Every control is 40px or more, setting names wrap,
  and a long breadcrumb scrolls to its end so the page you are on stays in
  view. Settings shows each report in full.
- **Type.** Learning's titles use the display face in italic capitals, the
  codex's page-title voice; Settings' title is the same face, upright.
  Buttons are 14px bold sentence case, sizes are on the app's scale, and
  every field is 16px so iOS never zooms.
- **Settings' reports.** A failed read says "Couldn't load your reports. Try
  again in a moment." rather than hiding the section. Reports are now filed
  and read by the person's sign-in id, the id the read rule already checks,
  so on older accounts, where the two ids differ, a trainer can see their new
  reports.
- **Tidying.** Where a reader left a Learning page is forgotten at sign-out;
  unused Catalog colours are gone; playbook confirmations are in words
  ("Confirmed by you and 2 more"). The Learning README has a "How Learning
  looks" section.

Commits: `9dcff2a` (F1, words), `512bab7` (F2, typing), `d47e1de` (F3,
colours), `be23526` (F4, readable text), `0159369` (F5, taps and names),
`6294e2a` (F6, type), `30a9800` (F7, Settings' failed read), `e5c2007` (F7,
reports by sign-in id), `4d7853a` (F8, render tests), `fac4d17` (what the
review found).

### G — My Studio's colours, type, taps and portrait

AJ's answer 8 gave the round the colours and the fonts.

- **Colours.** My Studio draws in the app's own values, light and dark.
  Flags, late jobs and tight gaps are plum, delete buttons crimson, anything
  selected blue, and every solid button's words are readable in dark mode.
  Capture keeps its orange, on the deeper orange so its words read.
- **Type.** Titles use the display face, and every heading of My Studio's own
  (Relay, and Team's people, duties, loops and vault) is the same 12px small
  upright capitals, and those buttons are 14px bold sentence case and the
  chips 12px bold. The Operations-kit panels on Machines, Studio and Team
  (Standing weeks, the staff list, temporary profiles) keep the kit's heads
  and buttons for now (see Left for a later round). Relay's Floor / Mine / Notes is a lighter second row of
  tabs. Every text size is on the app's scale.
- **Taps and whole names.** Machines' floor buttons are the Operations kit's
  40px buttons, and the search box is 40px. A machine's name is never cut
  short, and every Operations list shows whole names, wrapping when needed.
  Machines' floor list is one list of Operations rows: "Maintenance" is a plum
  badge and "Never to failure" a crimson one.
- **Nothing only on hover, and portrait works.** The opened day strip lists
  each session with the client's whole name and time ("Now" on the one under
  way). Under an ask, a line says who replied ("On it: Sam Lee · Can't: Ann
  Park"). Capture explains each kind of ask. On a portrait iPad the teammates
  line keeps its own row, with the app's only kudos button. It used to
  disappear below 900px, and it is now labelled **Just now** rather than
  "Pulse", which means only the living assessment. Capture steps aside while
  the side panel is open.
- **Machines and Studio.** Operations → Floor draws Machines as My Studio does,
  on an iPad that has never opened My Studio, and a machine's door stays on
  screen while the list scrolls. When the Mindbody sync needs attention, a
  studio leader is sent to Operations → Mindbody and a trainer with the grant
  is told to ask their studio leader. The studio's day names Operations →
  Insights → Hours. My Studio has one icon, the building, on the masthead and
  the bottom bar. A playbook answer on a machine's Catalog page is shown whole.
- **One card.** Every card on Team is the header-strip card, and Machines and
  Studio start a gap below the masthead.

Commits: `f08f932` (G1a, colours), `494f9f8` (G1b, type), `da6709b` (G2a,
taps and names), `d6c2097` (G2b, hover and portrait), `97d0b5d` and `9e98048`
(G2c, Machines and Studio, and its render test), `1591cae` (G2d, one card and
one heading), `5e33918` (what the review found).

### The loose ends (`10da42c`), and the CI fix (`df4933e`)

The units were built in separate files and handed each other a few one-line
changes. They land together here:

- The Notes page's own To-file tray also knows the Note for the next trainer
  (it matches the note against its session's copy), labels it and offers no
  Discard. It has limits: while the sessions are still loading, for a session
  older than the journal's recent window, or when the session's words were
  edited in History, the card keeps Discard.
- Operations' doors into My Studio (Staff & Roles' "Open My Studio → Team",
  and Renewals') switch back to trainer mode, so My Studio never opens with
  Operations' bottom bar under it.
- Settings' "N people on the team" counts with Team's own rule.
- Assign and "Save & flag" on the Floor are solid blue like every Save; "Mark
  done" stays green.
- The leave question on Machines names the machine, and an unused helper that
  still called a head trainer "Studio Leader" is gone.

`df4933e` (from another session, test only) made the served-files test right
on GitHub's Linux runner, where a file name's case matters.

### K — What the final review found

A last review read the whole branch. What it confirmed was fixed in one
commit:

- **Demo Mode: your own practice week.** A real trainer practising in Demo
  Mode could propose a week on My Profile, and Team then listed it as someone
  who "no longer works at Demo Studio", with no Agree, and never checked it.
  Team now lists anyone who has written a practice week at the demo studio
  as on the team (still never the whole company). And one person's own week
  is never offered to another person's row by its trainer id.
- **The machine's door asks before it drops typing.** On My Studio →
  Machines and Operations → Floor, the door's X, Escape, or a tap on another
  machine in the list beside it took a half-typed floor note or setting away
  without a word. Each now asks (a leave scope), and the door is keyed by
  machine.
- **Team's Review asks before it closes over typing.** Its Cancel, and Agree
  or Remove with dates away still being typed below them. The dates-away
  adder's own Cancel asks too.
- **No flash of "open".** When the week check started reading (the weeks
  arriving, or the studio's midnight) the first frame held the idle read,
  "nothing booked", and painted every agreed slot as a Free slot for a
  moment. The read is now stamped with the studio and day it belongs to, and
  until it matches it says "loading".
- **Staff & Roles' door** to My Studio → Team is offered only to someone who
  runs the studio the app is in. A head trainer visiting another studio
  would have landed on Relay under a button that promised Team.
- **Dates away offline** say "Saved on this iPad. It sends when the
  connection is back." instead of "Saving…" until the Wi-Fi returns. A line
  under the note says everyone at the studio can read it (a colleague's card
  shows it). The last save still wins between two people editing the same
  dates at once; that is noted in the standing-week README.
- **A trainer's own saves keep the week's stored trainer id**, so a week a
  leader agreed under another id never locks its trainer out (the rules
  freeze it for the trainer).
- **Machines' floor list** stacks each row's buttons under the name by the
  list's width, not the screen's, so the door open beside it on a landscape
  iPad no longer squeezes a machine's name to a letter per line and cuts the
  last button off (measured in headless Chrome by the reviewer: Operations →
  Floor at 1180 and 1194 wide, My Studio at 1024).
- **Small things.** The initiative dialogs' buttons (Post to the board,
  Resolve, Log) use My Studio's button voice. The standing weeks' text is on
  My Studio's scale, their section heads the one heading style, and
  `look.test.ts` now holds that stylesheet. Operations → Data points at
  Operations → Insights → Hours (a test holds it app-wide). Two comments no
  longer promise automatic indexes the production database doesn't build.
  `who-works-here.ts` names the two pickers that keep a wider rule on
  purpose. The rules tests' budget test now holds the costlier leaders too.

Commit: "Voice review follow-up K: what the final review found".

---

## Mindbody's recurring series: the research

AJ said yes to reading Mindbody's recurring series "as long as our cost
remain low". So the question was researched before anything was built:
**Mindbody does not tell an app which series a booking belongs to.** A
recurring booking is stored as one appointment per week, each with its own
id, in the appointments Journey already reads and in the webhook's events.
None of them carries a series id. So there is nothing to switch on, nothing to
pay for, and nothing was built. The server's appointment filter and the
webhook are unchanged. One caveat: Mindbody might send a field it doesn't
document. A read-only probe of one or two API calls, run once on AJ's PC and
printing field names only, would settle it.

**The recommendation, not built, needs AJ's OK as a feature:** a **"Suggest my
regulars"** button on My Profile. From the bookings Journey already syncs 30
days ahead, it would suggest the regulars a trainer seems to have: the same
client, same weekday, same time, in at least three of the next four weeks,
leaving rotation bookings out. The trainer confirms each one before proposing.
It asks Mindbody nothing (about 1,000 to 2,000 Firestore reads a tap at a busy
studio, a fraction of a cent). It would be worded as a suggestion, never as
"your recurring series". A second piece could come with it: a line on Team
such as "Judy has no bookings on file after Oct 13", said only when the
month's read was complete and never worded as "the series ended". The
standing week's design stays as it is: the trainer and the leader say what
the week is, and Mindbody's bookings are checked against it.

## What changes in Firestore

- **Rules** (`firestore.rules`, the standing week's block only): the days away
  (`away`) may be written by the trainer and the studio's leaders, at most six
  ranges; and a trainer's own write may no longer change `trainerId` once the
  week exists. The app never changed it, so the running app loses nothing,
  and the rules can go first.
- **Stored fields:** `studios/{s}/standingWeeks/{uid}.away` (new), read by the
  week check, Team's away lines, both Away editors and a colleague's Standing
  week card. `bug_reports.userId` now holds the reporter's sign-in (Auth) id
  for new reports. Older reports on older accounts may hold the trainer
  document id, which the read rule never let their authors read.
- **Indexes:** one fewer in `firestore.indexes.json` (43 to 42): the task
  instances index on status and date. The live one is deleted by hand, below.
- No Cloud Function, no Mindbody, no server change.

## Deploy order

1. AJ's `npm run test:rules` on his PC (the run that counts).
2. `firebase deploy --only firestore:rules --project prod`. The running app is
   unaffected.
3. Push `voice-review-followup` to `master` (fast-forward only): Render
   deploys the app.
4. Delete the one index by hand, whenever convenient (nothing reads it): the
   Firebase console → Firestore → the named database
   `ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa` → Indexes → the
   `taskInstances` row on `status` and `localDate` → Delete. **If
   `firebase deploy --only firestore:indexes` is ever run and asks whether to
   delete indexes that are not in the file, the answer stays N**: that
   prompt deletes every production index missing from the file in one go.

`scripts/ship/ship-voice-review-followup.ps1` does steps 1 to 3 and prints
step 4. `-Stage prepare` changes nothing: it checks the branch, a clean tree,
that the branch fast-forwards `master`, the index file's one removal, the
typecheck count, the suite, the rules tests and the builds. `-Stage golive`
tags the restore point `restore/2026-09-27-before-voice-review-followup`,
deploys the rules, pushes the branch to `master`, and prints how to delete the
index. It stops at the first failure.

## Measured

| | |
| --- | --- |
| Typecheck | 4 (the baseline) |
| Suite before the loose ends | 6,386 passing in 418 files (`TZ=America/New_York npx vitest run --dir src`, in the worktree on AJ's PC, before `10da42c`) |
| The loose ends alone | typecheck 4; 1,768 tests in 124 files over the touched areas |
| Case check | no two tracked files differ only by case |
| Budgets held by tests | the neutral ramp's bare palette 231 (was 235); the codex's hosted off-scale sizes 26 (was 57); My Studio's off-scale sizes 3 |

After the final review (K): typecheck 4; the whole suite 6,404 passing in 420 files
(`TZ=America/New_York npx vitest run --dir src`, in the worktree on AJ's PC);
the rules tests 180 passing in the emulator on AJ's PC (the rules themselves
unchanged; AJ's run is still the one that counts); case check clean.

Last, the Wrap-up render test's check that the renewal card never says "new"
held two raw backspace characters where `` was meant, so it matched
nothing (it came in before this round). It is written as `` now and still
passes, and no source file holds a raw control character.

## Open, for AJ

**Answered after the round (AJ, Sep 27 2026, in the chat that built it):**

- **The Hub outline** folds into the next round. AJ: "if we add more
  information like this on the hub, it's not really telling us a lot for that
  day ... a separate spot for that." A regular's usual time with no booking is
  "not that a slot is agreed to, it's just that trainer is usually very used
  to a client coming on that day", and it should help leadership "recognize
  like oh hey Austin's eight o'clock isn't going to be here this week", quietly.
- **Rotation days** need no rule in the app: rotations vary by studio and by
  week ("It's just something I want to give you context on"). The glossary
  says so; the check already reads a rotation booking at a regular's time as
  usual. Whatever a trainer and a leader agree for a rotation day stands.
- **"Suggest my regulars"** is not wanted: trainers mark their regulars
  themselves. What AJ wants instead is "My clients" on My Profile (the clients
  you've trained most, beside the Kaizen Roster, which is tracked clients, not
  regulars), in the next round.
- **The next round is approved** ("love it, lets go"): **Openings**, a My
  Studio section open to everyone at the studio that shows the studio's usual
  busy and quiet times, what opened up this week in a usually-busy time (a
  regular is out, and when they're booked again), and good times to offer a
  client who wants a regular time, for trainers at the desk right after a
  session. With it: a door from the Wrap-up when the next session isn't
  booked, "When I usually take clients" in place of the standing week's
  "hours" (trainers are paid per client, hourly or salary), "Your week" on My
  Profile (clients trained, training hours, time at the studio from the first
  session to the last) and "My clients". It never books (Mindbody charges
  $2.50 a booking made through the app) and nothing pings anyone. Its
  proposal is `docs/rounds/2026-09-27-openings.md`.

**Waiting on your word:**

- **A trainer Mindbody marks inactive**, but who still has Journey access, is
  still checked on Team, so each of their slots reads open. Should Team stop
  checking their week and say "Mindbody lists them as inactive"?
- **Who may change a role.** On Operations → Staff & Roles only administrators
  may change an existing person's role (the Sep 2026 audit's decision), while
  on My Studio → Team a studio's leaders may, within the studio tier. The
  difference was kept on purpose and noted in the code. Should they match?
- **A grant-holder's reach.** A trainer with the grant can open Team and, as
  the rules stand, approve someone as Studio Leader or hand out the grant
  too. Intended, or should a grant-holder stop at Life Transformer?
- **Franchise owners and Assign.** The Floor offers a franchise owner Assign,
  and the task rules refuse it (only administrators and the founder pass).
  Should owners assign studio tasks?
- **"This quarter" focus.** It stays on every Floor until someone replaces
  it. Operations now shows when it was set. Should it lapse when its quarter
  ends?
- **A separate stored mark for the Note for the next trainer.** Both
  end-of-session notes are stored with the same origin, so nothing can later
  tell them apart, and the Note for the next trainer's card reads "Wrap-up".
  A new stored value would fix it and needs your OK.
- **Machine reports.** Open loops on Team ends a shift-list report when the
  same check is done clean on a later day, while Learning and the Catalog keep
  a flagged machine until a manager clears it, so the two can disagree until
  one maintenance log is built. That merge is a Firestore change.
- **The vault's incidents** (staff and facility) and the client incidents the
  Overview counts are two separate records. Should the vault be for staff and
  facility only?
- **Two names for signing out** (from the voice-review round): "Switch
  Trainer" and "Log Out Facility" both sign out.
- **A standing week's first save** (from the final review, a rules change):
  a trainer's own week may still be CREATED naming another trainer's id,
  by a hand-made write (the app never does). One line in the rules pins it
  (`request.resource.data.trainerId == request.auth.uid` in the trainer's
  create branch), with a test beside D6's. It would ride this round's rules
  deploy. The app's side is already safe: Team never offers that week to the
  other person's row.
- **The note for the studio leader on a proposal** is hidden on a
  colleague's card, but it sits in the same document every colleague may
  read, so it is only hidden on screen. Keeping it private means a separate
  leader-only document, a Firestore structure change. (The days-away note is
  meant for everyone and now says so.)
- **Indexes for two small reads.** Your reports (Settings) and a studio's
  team jobs are read without an index, so production scans `bug_reports` and
  each studio's `teamJobs`. Both are small, so it costs pennies; adding
  `bug_reports(userId)` and `teamJobs(status)` / `teamJobs(closedOn)` to the
  index file is your call. Five other comments in the code make the same
  "automatic index" claim and should be corrected with it.

**For your screen audit (the names and looks chosen under answer 8):** Just
now (the Now Bar's teammates line), Past sessions (the Hub card), Back to
Reports, "Your closing note, printed at the end of the report", Edit in Body &
Pulse, Head Trainer, "Each person's standing week", Away. My Studio's masthead
title is the display face at 17px, not the codex's 30px, because it sits in a
58px bar. Learning's should read the same. My Studio's section tabs and Relay's
segmented control stay 11px small capitals, because they are tabs, not
buttons. Capture stays orange. Input fields in Learning are 16px (so iOS never
zooms) where the codex's are 14px, and one size should win.

**To do by hand:**

- **Delete the unused index** (deploy order, step 4), and answer N to the
  CLI's delete prompt.
- **Stop any leftover Firestore emulator** on port 8080 before
  `npm run test:rules`. One was left running by this round's builder; the
  ship script offers to stop it.
- **Walk Round 22** of `docs/ops/TESTING-CHECKLIST.md` on two iPads, portrait
  and landscape, light and dark. Three things have not been seen on an iPad
  at all: Machines' new floor list, reorder mode included (so far only tests
  have drawn it); the machine's door on Operations → Floor, especially in the
  Home Screen app (checked only in headless Chrome); and My Studio in dark
  mode (its colours are held by a test, but nobody has looked).

**Left for a later round (no decision needed):**

- **The Operations kit's own look.** `.adm-btn` (12px spaced capitals),
  `.adm-panel__title` (13px) and `.adm-badge` (10px) are off the app's scale
  and still draw the buttons and panel heads on My Studio → Machines, Studio
  and Team (Standing weeks, the staff list, temporary profiles), and across
  Operations. Suggested: 12px upright capitals for panel
  titles, 14px bold sentence case for buttons.
- **Relay's own Floor and Mine cards** have no header strip yet; the Floor's
  landscape two-column layout (`.sh__split`) is still unwired (your call).
- **The networks list can't say "loading" or "failed"** (`useNetworks` starts
  empty and only logs an error). The focus panel hedges with "Can't see the
  networks yet"; the real fix is a loaded/failed flag passed down to the
  Overview.
- **Operations → Machine fit** writes its hand-off to the profile before
  asking the unsaved-changes question, unlike the other four hand-offs.
  Probably harmless there, since nothing on Operations is typed at that moment.
- **Bug reports are filed by sign-in id now.** A report an older account filed
  under its trainer document id is still unreadable to its author: the read
  rule compares the sign-in id, and changing that is a rules change.
- The clinical strip's small title and its "No clinical flags" line are not
  yet on the app's scale; the chosen profile tab could take the brand blue.
  Both are visible changes, left for the restyle pass.
- Demo Mode could come with a couple of agreed standing weeks, so trainers can
  see the check working.
