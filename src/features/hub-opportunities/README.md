# The Hub's Opportunities layer

*Directory and opportunities round, Sep 27 2026 — `docs/rounds/2026-09-27-directory-and-opportunities.md`. Design: research-hub §6.3 (switching layers), §6.4 (the sort sentences), §6.5 (Direction O1, the Run-sheet) and §7 (the noise rules).*

AJ: "just clean it up and add the second layer" — a layer that "list[s] every client coming in that day", sortable "by appointment time, by last seen, by session count, by sessions left, by birthday (turns 80 on June 4th)", "so trainers can see opportunities for that day quickly". The directory round built this second layer; the calm Hub round (Sep 28 2026, `features/hub-schedule/`) cleaned up the grid on the SAME engine, so the grid, its peek and this list can never disagree.

## Files

| File | What it is |
| --- | --- |
| `moments-today.ts` | The pure engine: one entry per client booked on the selected day, her moments in five families, the sentence each sort reads, and the sections. `moments-today.test.ts` |
| `use-day-moments.ts` | The day's entries, worked out ONCE for the Hub (the directory's rows, the package table, the engine). ClientsView calls it and hands the same entries to the grid's cards, the peek, the day summary and this list |
| `RunSheet.tsx` + `run-sheet.css` | The layer (prefix `ho-`). Lazy: fetched the first time Opportunities is opened, inside a `LoadBoundary kind="screen"` in `ClientsView`. It takes the day's `entries` as a prop, and a `request` to open on a family (the Schedule's spotlight "See them as a list") |
| `LayerSwitch.tsx` + `layer-switch.css` | `[ Schedule \| Opportunities ]` at the start of the Hub's strip (prefix `hl-`). Small and eager |

## Decisions

- **Schedule is the default and unchanged.** The Hub always opens on Schedule. The grid stays MOUNTED while Opportunities is showing (only `hidden`), so its scroll position and its land-on-now effect are exactly as they were. The strip (the day's two numbers and the seven days) and the Critical-notes banner are shared by both layers, and so is the selected day.
- **Everything is asked about the SELECTED day, never today** — the birthday window, the milestone (her count plus her bookings before it, Operations' `count + i + 1`), the break measured to that booking — so flipping to Thursday shows Thursday's truth. (The Hub card still counts from today; see the open items.)
- **One vocabulary, reused, never re-derived**:
  - *Read first* — the Hub's own Critical read (`useHubCriticalNotes`, handed in as `criticalFor`), through `getClientAlertState(client, criticalNotesOn(notes, day))`: the card's exact rule. A client whose notes could not be read claims nothing, and the line under the chips says so.
  - *Watch* — no liability waiver signed (Mindbody's "nw" corner, AJ Sep 28: `waiverState` "not-signed" only, never "not synced yet"), then the last Pulse's red flags, from the same alert state. Clinical history on file is NOT a moment (it would sit on most clients): the entry carries it as `clinicalOnFile`, said quietly in an opened row and the peek.
  - *Welcome* — a consultation (the card's rule); sessions 1–3 when the number may be quoted; first time with this trainer only where Journey holds her whole story (so the trainer tally is every session she has had); back after a break measured in **missed sessions at her own pace** (`renewal.pacePerWeek`; about 3 or more), claimed only inside the part of her timeline Journey owns (`ownedWindow` / `canClaimGap`).
  - *Celebrate* — a milestone from Operations' ONE list (`SESSION_MILESTONES`: 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000…) only when `canQuoteSessionNumber`; a birthday within a week either side, "turns N" only when the birth year is on file.
  - *Renew* — `renewalPromptDue`, in the Wrap-up's own words (`promptText`).
- **Noise rules** (§7): one sentence per row in ONE fixed column; at most three chips (`MAX_ROW_CHIPS`), Read first always first, and never the fact the sort already states; filter chips carry counts and a zero is not drawn; "Can't tell yet" is gathered at the bottom, folded, with its count — never a "0", a "#1" or "New" for a client we can't number.
- Colour by family, shape by family (the Key): Read first crimson (the Critical note's own colour — the only red, as on the card), Watch plum, Welcome blue, Celebrate orange, Renew green.
- Studio / Mine: Mine is booked with you that day, or coached by you in the last 60 days (`renewal.coachIds`). Sort, filter and scope are remembered on the iPad (local storage; a sign-out clears it).

## Reads

None of its own beyond the studio's package table (`useRenewalSettings`, the one document the profile and the directory read), so Left says the profile's number. Bookings, roster, sessions and the Critical notes are the Hub's. **No per-client query.**

## Deliberately out of scope

- **FORD "Get to know"** (✎): needs one studio-scoped FORD read (a collection-group query like the Delight queue's) — a new read, so a later round.
- **Surgery / away within 14 days** from dated notes and FORD: the same new read. The card's Away and Medical chips still read the legacy `client.events`.
- **"Show on schedule"** (the list has no scroll target on the grid yet). The Key sheet, the card peek, the chips that spotlight the grid and the grid clean-up itself are built: `features/hub-schedule/`.
- **A private "seen"** per opportunity (§7 rule 12).

## Seams and open items

- The Hub card reads this engine since the calm Hub round (Hub question 5's default: Operations' one milestone list), so its old rules are retired there. `lib/hub-markers.ts` still has them — every 25th session, 21 calendar days for "back", counted from today — for the **briefing**, which reads it; moving the briefing onto this engine is the last of that drift.
- `ENDING_SOON_AT` (12) and the tenure words (New 1–3, Building 4–49, Regulars 50+) are placeholders for AJ's answer.
- `criticalFor` / `logged` / `rowsById` are the injection points: a test or another screen can hand in its own.
