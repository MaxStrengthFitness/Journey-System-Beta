# features/planner/relay — Relay's own pieces

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
| `cohorts.ts`, `TeamCockpit.tsx`, `vault.ts`, `VaultPanel.tsx` | The Team tab's cockpit, cohorts routed to the team, the studio's day, `studios/{s}/vault` |
| `calendar-items.ts`, `RelayStrip.tsx` | The Relay layer on the Calendar |
| `kudos.ts` | One tap of thanks; the Team tab's roll-up |
| `NetworkView.tsx`, `FocusBanner.tsx` | Franchise and super roles: focus, initiatives at every studio, studios ranked |
| `ContextPanel.tsx` | Detail beside the board: a right column ≥ 900px, a bottom sheet below |
| `relay.css`, `relay-strip.css` | On the hub's `--st-*` tokens plus `--rl-floor` / `--rl-mine` |

Rules for the two new collections are in `firestore.rules` (search
"MACHINE CARE" and "THE VAULT"); their tests are in
`tests/firestore.rules.test.ts`.
