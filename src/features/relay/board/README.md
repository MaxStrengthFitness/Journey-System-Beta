# features/relay/board — Relay's own pieces

Round: Relay, Sep 16 2026 (`docs/rounds/2026-09-16-relay.md`). Pure logic in
`.ts` with a `.test.ts` beside it; screens in `.tsx`. Everything reads the
data the Planner and AppContent already load unless the file says otherwise.

| File | What |
| --- | --- |
| `RelayContext.tsx`, `RoleGate.tsx` | What every tab can reach (who, where, the clock, `openCapture`, `openPanel`); the two tiers (leaders of this studio; franchise and super roles) |
| `now-context.ts`, `NowBar.tsx` | The clock: shift phase, the trainer's next session, minutes free, the day strip. `shiftHoursOf` reads `studios/{s}.shiftHours` |
| `pulse.ts`, `rings.ts` | Module stores the Floor publishes into and the Now Bar reads: what teammates did; how many rings closed |
| `capture.ts`, `CaptureSheet.tsx` | The one composer — what each destination writes, the sentence, validation |
| `next-up.ts`, `NextUpQueue.tsx`, `SwipeRow.tsx`, `ShiftRings.tsx` | The Floor's top: three ranked cards, the gestures, the rings |
| `machine-care.ts`, `machine-care-store.ts`, `FloorMap.tsx` | Wear signals, `studios/{s}/machineCare`, the map and the care sheet |
| `mine.ts` | Mine's lanes: my clients, follow-ups, growth, hand-offs |
| `TeamCockpit.tsx`, `vault.ts`, `VaultPanel.tsx` | Team's Open loops (unanswered asks, flagged machines from the Floor Map and the shift list, overdue jobs) and `studios/{s}/vault`. Who's in today and the month's client groups (`cohorts.ts`, "Route to team") went in the voice-review round, Sep 27 2026: the Hub and Operations answer them |
| `calendar-items.ts`, `RelayStrip.tsx` | The Relay layer on the Calendar |
| `kudos.ts` | One tap of thanks; the Team tab's roll-up |
| `focus.ts`, `FocusBanner.tsx` | The network's focus this quarter, as a quiet line on the Floor. It is SET on Operations → All my studios (`admin/network/NetworkActions.tsx`) since the voice-review round, Sep 27 2026, when `NetworkView.tsx` (focus, initiatives at every studio, studios ranked) went: the actions moved, the ranking was dropped |
| `ContextPanel.tsx` | Detail beside the board: a right column ≥ 900px, a bottom sheet below |
| `relay.css`, `relay-strip.css` | On the hub's `--st-*` tokens plus `--rl-floor` / `--rl-mine` |

Rules for the two new collections are in `firestore.rules` (search
"MACHINE CARE" and "THE VAULT"); their tests are in
`tests/firestore.rules.test.ts`.
