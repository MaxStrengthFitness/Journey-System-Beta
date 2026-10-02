# The Atlas answers (Oct 2 2026)

AJ answered the Screen Atlas's short versions on the night of Oct 1 (50 tap questions, 01:19–03:24 UTC Oct 2) and the decision log's open questions on the morning of Oct 2 (40 answers). An interview the same day settled the ones he marked "I don't understand" or that contradicted each other. This page is every decision, in his words where he gave them, and the work each one became. The branches are `oct2/*`, merged on `oct2/atlas-answers`, on master's `7875a993` (Journey Lite, live).

## The big change of direction: no FileMaker

AJ, Oct 2: **"we need to be smart about this and stop hoping we get the filemaker data and start being realistic and going 'well lets just make the app work without it'. it will only take a few weeks to start getting real data so thats okay."**

- **A client's total and her first day are what matter** (for milestones), not when she joined Journey: "we dont need to know WHEN people joined journey. we just need to know how many sessions they have TOTAL and when was their first session."
- **Total sessions = sessions before Journey + Journey's.** Before-Journey is guessed from Mindbody and confirmed or corrected once by a trainer. Until it is confirmed, the card shows Mindbody's guess as the total, and the peek says it is unconfirmed. Milestones wait for a confirmed total.
- **Client since = her first appointment.** Mindbody's `firstAppointmentDate` is already stored on every synced client (no new Mindbody call). It is shown as from Mindbody, and a trainer confirms or corrects it. A new client's first Journey session sets it.
- **Sessions left and sessions recorded are different numbers and are never mixed.** Left comes from the contract (Mindbody). Recorded is visits: the trainer-confirmed before-Journey count plus Journey's. "A client could have 42 sessions in their package but only have 40 sessions by the end of their package due to late cancels."
- **Late cancels.** "our app doesnt send information to mindbody it only receives, so we really only need to take a session from a client if a session is logged or a unlogged session gets marked as a no show. it needs to be easy to mark a late cancel in the app." An early cancel is a cancellation where no session is taken (an emergency, an illness, usually a reschedule). A late cancel is when the session is taken (last minute without a good reason, forgot, a no-call no-show). Anyone at the studio may mark one. "At the end of the day it is up to the studio and its leaders to make the final call." Late cancels are tallied beside visits ("40 sessions · 2 late cancels"), never inside them.

## The Wrap-up

- **Congratulations**: "a few generic 'congratulations' messages that it randomly picks". This replaces "strong work."
- **The next session's weight**: "in the wrap up screen you should be able to adjust the weight for the next session ... currently our app uses the last sessions weight ... a trainer needs to be able to adjust this weight directly from a wrap up so that way i dont have to finish the session, go to the clients profile, adjust their weight/make a note ... the opposite needs to work too, so if i want to lower the clients weight i can do that too." This makes sure the progression reaches the next trainer, and sets you up for next time. It replaces the weight-advice line under the dose. The app still never suggests a weight: the trainer sets it.
- **The effort rating** replaces the dose Dial: one rating for the whole workout, "judging where in the 'goldilocks zone' the client total effort given. did they leave some in the tank? default is right in the middle ... or did that client PUSH HARD that day". Words, worst to best: Left some in the tank · Held back a bit · As expected · Pushed hard · Gave everything. **Untouched saves "As expected"** (AJ's call, overriding the Dial's usual not-asked rule for this one rating). It is collected over time to see effort declining before it becomes a problem, and to recognise clients who push hard ("valuable to the studios as review and potential testimonials").

## Every other answer

### Getting in and the shell
| Question | Answer | Work |
| --- | --- | --- |
| Demo Mode's search, Add Client and announcements | Practice studio only | build |
| Switch Trainer and Log Out Facility | One "Sign out" | build |
| An access request with "Not sure yet" for the studio | Require a studio | build |
| Inside Operations, tapping the studio name | "if you tap the top left like a studio name or icon it should just take you back to the hub"; 'Looking at' stays the only studio switch | build |

### Hub and finding a client
| Question | Answer | Work |
| --- | --- | --- |
| One "Mine" | Booked with you, or coached by you in the last 60 days, on every screen; labelled "My {thing}" ("we need to find a mine rule for all the areas") | build |
| Add Client and the chart importer | Add Client makes a temporary profile any trainer can start (run a session when Mindbody is down or for a walk-in, attached to her Mindbody record later by the existing merge); the Existing tab and the chart importer are hidden | build |
| A day away's note on the grid | Show the reason ("Away · surgery") | as built |
| Opportunities | For the whole floor: "it's opportunities for trainers and leaders to engage with clients through FORD and anniversaries and other milestones" (D-1002-01) | as built |
| Get to know | A dated FORD detail that just happened ("how did your son's soccer games go?") and a FORD "Follow up next time" both count, offered as a small Note-loudness line: "a small loudness note that offers the information to the trainer to use or follow up on in order to show we care and listen" | build |
| All stars | "just to show our dedicated clients in a special area and give them a special badge" | wording |
| Focus opens on | "use your best judgement": stays on Me | as built |
| Shading only for agreed weeks; three rows upright | yes | as built |
| Mindbody "Unavailable" blocks | "yes, if we can bring the note with it then yes to that too" (a Mindbody-integration change) | build behind a restore tag |
| The briefing's milestone and break rule | Move it onto the Hub's one engine | build |

### The client profile
| Question | Answer | Work |
| --- | --- | --- |
| The profile grid's rows | This studio's floor, its own machines included | build |
| Programming's All Machines, Setup and counts on the studio's floor | Before beta. "the standard list is to help new studios adopt and study material for the machines" | build |
| Given (comp) sessions and renewal | Count them in: renewal talk waits until the given sessions are used too | build |
| Progress reports | Due three months after the last full report; a per-client switch turns them off ("not every single client will want a progress report"); an approaching renewal makes one "definitely very important". One quiet line replaces the red strip | build |
| Routine B | Strictly alternates with A once switched on. Clients start on A to learn the protocol; a trainer may build B for accessory work, recovery or variety; some stay on A for a hundred sessions; routines change over time | as built |
| Quick entry overwriting a setting | Allow it (it is used when importing settings, not mid-session) | as built |
| Pulse and notes privacy lock | Before franchises, Jan 1 | later |
| Clinical flags and medical history | Save at once (each change is one small write, not a read) | build |
| Archiving a note | Open to all, with an Archived view and Restore | build |
| Reps as progress | Only weight changes count: "two more reps at the same weight can be considered progress, but I would not consider that notable progress. It depends on the CLIENT." | build |
| Pulses on the Reports shelf | Keep them together | as built |
| Who deletes a session | Keep as is | as built |
| A Pulse answer given on the floor | Counts at once everywhere | build |
| Locking a finalized report | Leave open | as built |

### The session
| Question | Answer | Work |
| --- | --- | --- |
| Open session | Becomes a real session when assigned (number, weights, Wrap-up) | build |
| A session nobody finished | Add "Finish it as it was" | build |
| Unfinished sessions for leaders | A Needs-you line on Operations → Today, and head office across every studio | build |
| A machine taken out for today | "Skipped: trainer's call" | build |
| Notes about her on one machine | In her journal, shown on the machine sheet | build |
| Notes written on a cross-train day | Her home studio. "When someone gets approved for cross train, you'll be able to see all their notes from the other studio" | build |
| A typed Profile note on the Wrap-up | Every exit saves it | build |
| A renewal "ask a leader" | Stays until a leader marks it handled | build |

### Learning, My Studio and Relay
| Question | Answer | Work |
| --- | --- | --- |
| Academy names and quick cards | The Catalog's names, and the quick cards rebuilt to their six sections | build |
| One maintenance record | The checklist's problems flag a machine too | build |
| Demo Mode and shared machines | No to both: Demo sees only itself, and no offer from it reaches head office | build |
| Opening an ask | Only an explicit Take it claims it | build |
| Franchise owners on a studio's shift | Let the database accept them | build (rules) |
| Kudos | A heart, no bell notification (one small write; nothing to scale) | as built |
| Removing a studio's own machine | Always retire, never delete. AJ: a leader adds a machine the studio doesn't have from the Catalog, and edits or removes its machines on My Studio → Machines | build |
| The studio's standard Gap | Reference only: "to help trainers know what the most common settings are" | as built |
| "I've read it" and Mark all read | "mark all should mark everything as read" | build |
| Who has read a notice | A leader sees "9 of 12 have read it" | build (rules) |
| "I've read it" in the bell | Offer it there too | build |
| A leader naming someone on a job | Stamp the time: "The time posted is very helpful" | build |
| A leader's notes about a trainer | "in the notes section of relay leaders should have the ability to track the studio trainers and have records and notes about them" | build |
| Cases | The trainer on it or a leader may close one (as built) | as built |
| Playbook | "Im not sure if we use the playbook": only what someone saves goes to it | as built |

### Calendar, Operations, Admins, Catalog
| Question | Answer | Work |
| --- | --- | --- |
| The Calendar | Everyone sees the whole team | build |
| Calendar Events | Clients' FORD dates (birthdays, vacations) | build |
| A trainer's own Edit profile | Staff ID, Mindbody link, email and full name are for leaders only | build |
| A colleague's profile | Open from My Studio → Team | build |
| "No longer matters" | A one-line reason, optional | build |
| Room later today on Operations → Today | Openings only | as built |
| Trends and Hours | Name order, no call-outs | build |
| Waiting for review | A count on the sidebar and a line on Home | build |
| Switching a former trainer's account off | On Change role | build |
| A studio rewording the method | Yes, as built | as built |
| Bug statuses | Settings uses the Admins words | build |
| Who may mark a no-show | Anyone (as a late cancel, above) | build |
| "Didn't come" on the floor | "Any communication and markings from the team needs to be apparent for the whole team. always show" | as built |
| A removed catalog safety line | "Just cross it out or make it faded" | build |
| The limit on removed safety lines | "Im not sure if there needs to be a limit here": no count limit, a reason still needed | build |
| A machine added to a floor | Joins the end, and reordering must be easy | check |
| Out of service needs a reason | Yes | as built |
| The body figure | "make sure we are using the correct model that also is used in the catalog" | check |
| The Catalog's calm | "Still needs work" | later round |
| Printed Pulse scores | Sentences only | build |
| The dead screens | Delete them all, keeping a way to make a client when Mindbody is down (the temporary profile) | build |
| Permissions | "Lets not focus on permissions at the moment, we can fine tune and lock everything out later i just want to make sure features are working first." | standing |
| Repository private | Eventually | later |
| Mindbody's billing allowance | Unsure | open |

## What was built

Five branches on master's `7875a993`, one commit per item, each typechecked on its own, merged on `oct2/atlas-answers`. Each branch's notes say item by item what changed and what was left:

| Branch | Notes | What it holds |
| --- | --- | --- |
| `oct2/floor` | [floor.md](2026-10-02-atlas-answers/floor.md) | The Wrap-up's congratulations, next session's weight (`features/next-weight/`), the effort rating and its Deep Dive line, every exit files the Profile note, the renewal flag until handled, floor Pulse counts at once, the briefing on the Hub's engine, Finish it as it was, Skipped: trainer's call, machine notes in her journal, cross-train notes to her home studio |
| `oct2/history` | [history.md](2026-10-02-atlas-answers/history.md) | Session totals from Mindbody's guess confirmed on Account (`lib/session-total.ts`), client since, late cancels for everyone, progress reports due at three months with a per-client switch, given sessions and the renewal, the Deep Dive on weight only |
| `oct2/profile` | [profile.md](2026-10-02-atlas-answers/profile.md) | Add Client as a temporary profile, the Existing tab and chart importer hidden, the dead screens deleted, the printed Pulse without scores, Archived notes with Restore, watch-outs saving at once, the studio's floor on the profile and in Programming, "No longer" with a reason, Demo Mode's realm, one Sign out, a studio required on an access request |
| `oct2/team` | [team.md](2026-10-02-atlas-answers/team.md) | One Mine (`lib/mine.ts`), the Calendar's whole team and FORD dates, identity fields for leaders, a colleague's profile from Team, Operations' top left back to the Hub, Get to know's follow-ups, Take it, franchise owners on a shift, notices' read counts, the time a leader named someone, Team member notes, Trends and Hours in name order, sessions left open on Today and Admins Home |
| `oct2/machines` | [machines.md](2026-10-02-atlas-answers/machines.md) | A studio's own machine retired never deleted, added machines join the end, one maintenance record, the Academy's names and quick cards, one body figure (already true, now held by a test), removed safety lines struck through with no cap, Waiting for review's count, switching an account off, the bug words |

The integration branch adds one fix of its own: the machine sheet's High importance alert reads the one notes list.

## Not built, and why

- **Mindbody "Unavailable" blocks** (AJ: yes). The schedule pull asks Mindbody for booked appointments only; blocked-off time is a separate endpoint, so it would be a **new Mindbody call on every pull**. That needs AJ's OK under the freshness rules. The four app-side steps are in machines.md, item 10.
- **Switching an account off at Firebase Auth.** The app refuses a switched-off trainer and the rules stop them switching themselves back on, but their Auth account stays enabled until a Cloud Function disables it (machines.md, item 8).
- **Discarding an open session from Operations** (team.md, item 13): it deletes sets and touches totals, so it stays in the Active Session's own flow.
- **Session numbers already stored on old sessions** keep the number they were written with (history.md, item 1).
- **A late cancel on a booking Mindbody already shows as Cancelled**, and cross-train late cancels in the home studio's tally (history.md, item 3).

## Deploy

`scripts/ship/ship-atlas-answers.ps1`: `-Stage prepare`, then `-Stage golive`. Indexes first (three new: `sessions` status + createdAt, `ford` studioId + followUpAt, `bookingMarks` clientId + day), then the rules, then the push. No Cloud Functions, no Mindbody calls.

## Measured

On `oct2/atlas-answers`, in a worktree on AJ's PC: typecheck **2** (the baseline); `TZ=America/New_York npx vitest run --dir src` **8,749 passing in 636 files**; `npx vite build` clean; `npm run test:rules` **284 passing**; no two files differ only by case.

## The walkthrough

`docs/ops/TESTING-CHECKLIST.md`, Round 51.
