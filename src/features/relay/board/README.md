# features/relay/board — Relay's own pieces

Round: Relay, Sep 16 2026 (`docs/rounds/2026-09-16-relay.md`). Pure logic in
`.ts` with a `.test.ts` beside it; screens in `.tsx`. Everything reads the
data My Studio, Relay and AppContent already load unless the file says
otherwise. Relay's tabs are **Floor · Mine · Notes**.

| File | What |
| --- | --- |
| `RelayContext.tsx` | What every tab and every My Studio section can reach (who, where, the clock, `openCapture`, `openPanel`). Who leads the studio the iPad is in is `../leads.ts` (`leadsHere`), which My Studio asks directly: `RoleGate.tsx` went in the voice review follow-up (Sep 27 2026), with one tier left and no caller |
| `now-context.ts`, `NowBar.tsx` | The clock: shift phase, the trainer's next session, minutes free (`useNowContext`), and the day strip (`DayStrip`). `shiftHoursOf` reads `studios/{s}.shiftHours`. The Now Bar itself went in the Relay room (Sep 28 2026): its time facts are in My Studio's one header (`my-studio/StudioHeader`), a tap there unfolds the day strip |
| `pulse.ts`, `rings.ts` | Module stores the Floor publishes into: what teammates did (read by `JustNow`); how many rings closed |
| `JustNow.tsx` | "Just now": the teammates' lines as a still list with a heart on each, on the Floor (the Now Bar's six-second ticker until Sep 28 2026). The app's only kudos button, never hidden (`my-studio/look.test.ts`) |
| `tracked.ts`, `track-live.ts` | Tracking: the one job this trainer took, which rides in the header's chip on every tab until it is done. This iPad's memory per studio and day, forgotten at sign-out; nothing stored. The Floor publishes the job's live count (`trackedLive`) once every read has answered, and lets go when the job is done |
| `board.css` | The Board's own rules (`rjn` so far), held to My Studio's look by `my-studio/look.test.ts` |
| `fixtures.ts` | Test fixtures (rows, asks, jobs, bookings), Lord of the Rings names and never the Fellowship |
| `capture.ts`, `CaptureSheet.tsx` | The one composer — what each destination writes, the sentence, validation |
| `next-up.ts`, `NextUpQueue.tsx`, `SwipeRow.tsx`, `ShiftRings.tsx` | The Floor's top: three ranked cards, the gestures, the rings |
| `machine-care.ts`, `machine-care-store.ts`, `FloorMap.tsx` | Wear signals, `studios/{s}/machineCare`, the map and the care sheet |
| `mine.ts` | Mine's lanes: my clients, follow-ups, growth, hand-offs |
| `OpenLoops.tsx` (was `TeamCockpit.tsx`), `vault.ts`, `VaultPanel.tsx` | My Studio → Team's open loops (unanswered asks, flagged machines from the Floor Map and the shift list, overdue jobs) and `studios/{s}/vault`. Who's in today and the month's client groups (`cohorts.ts`, "Route to team") went in the voice-review round, Sep 27 2026: the Hub and Operations answer them |
| `calendar-items.ts`, `RelayStrip.tsx` | The Relay layer on the Calendar |
| `kudos.ts` | One tap of thanks; the week's roll-up on My Studio → Team, per person, shown to leaders and to the person, never ranked |
| `focus.ts`, `FocusBanner.tsx` | The network's focus this quarter, as a quiet line on the Floor. It is SET on Operations → Overview → All my studios, and at the foot of the Overview for a franchise owner who sees one studio (`admin/network/NetworkActions.tsx`), since the voice-review round, Sep 27 2026, when `NetworkView.tsx` (focus, initiatives at every studio, studios ranked) went: the actions moved, the ranking was dropped. `focusHeadline` is the banner's first line: plain "This quarter" when only the line for the floor is set. The editor's idle line reads `setAt` ("Set by Ann Owner on Sep 27, 2026.") |
| `ContextPanel.tsx` | Detail beside the board: a right column ≥ 900px, a bottom sheet below |
| `relay.css`, `relay-strip.css` | On the hub's `--st-*` tokens plus `--rl-floor` / `--rl-mine` |

Rules for the two new collections are in `firestore.rules` (search
"MACHINE CARE" and "THE VAULT"); their tests are in
`tests/firestore.rules.test.ts`.
