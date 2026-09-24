# The Client Codex — Notes & Profile as seven pages

*Sep 24 2026, overnight. Branch `client-codex`, one commit per phase. **Nothing is pushed or deployed** until AJ says go: the phases accumulate on the branch (AJ's decision). The plan is `INTEGRATION.md` and the six area specs in the session scratchpad; the approved mockup is `client-codex.html`. This document is started in phase 2 and finished in the last phase (the full story, the baselines, how it ships, and the index and CHANGELOG rows).*

## Phases so far

- **1 — FORD reads that work for every trainer, and honest test commands** (`29f653d`). `useClientFord` listed FORD with no studio filter, so the rules refused it for everyone below franchise owner and the refusal read as "nothing on file". Now filtered on the client's studio, with a `status` that tells "couldn't be read" and "kept by the home studio" from empty. `useClientJournal` reports what it could read and hands out the sessions it already streams. The test commands skip the `.claude` worktree copies. See KNOWN-TRAPS → The client profile.
- **2 — The InBody normal variation (AJ's decision 8)** (`9e77640`). Below.
- **3 — Navigation: the record tab becomes pages** (`b02e66d`). The record arm of the profile's one location is `{ page, anchor }`; every old section and tab id still lands; the tab always opens on the Overview. See `src/features/client-profile/README.md`.
- **4 — The sub-toggle can wrap** (`5884295`). `ProfileSubnav` gains `wrap`, `idPrefix` and a plum `warn` dot, all opt-in, so Programming and the Activity Archive are unchanged. See KNOWN-TRAPS → The client profile.
- **5 — One visual kit** (`c8203b9`). Below.
- **6 — Additive props and exports the pages need.** Below.

## Phase 2 — the scanner's normal variation

An InBody scan of the same body reads a little differently every time, and until now every screen called any difference a change: "+1.2 lb muscle" was proof on the renewals pipeline, made a client an upgrade candidate, and printed green on the progress report the client takes home.

**The rule** (`src/features/inbody/variation.ts`): a change smaller than the client's HOME studio's number is "within the scanner's normal variation" and no screen calls it up, down, better or worse; a change equal to the number or bigger is called. The number itself is always shown. Max Strength's defaults are **3.5 lb** skeletal muscle, **5.3 lb** body fat mass and **2.7 points** body fat %. Fat mass and body fat are the cautious end of McLester et al. 2020 (checked against the abstract tonight: 2.12–2.73 %, 1.49–2.39 kg fat mass, 1.60–2.32 kg fat-free mass). The study did not measure skeletal muscle: 3.5 lb is AJ's figure, the low end of the fat-free-mass range. Weight has none and is never toned.

**Each studio sets its own** on My Studio → Studio → *InBody: the scanner's normal variation*, between the studio's day and Renewals. It is stored at `studios/{id}.inbodyVariation`, written whole with `updatedBy` = the Auth uid; "Use Max Strength's defaults" removes the field. **No rules change**: the studio update rule already scopes the write to the studio's own leaders (and the grant), franchise owners and administrators — pinned by four new rules tests ("Studio InBody variation"). No index change. No read: the studios are already in memory.

**What is stored never changes.** `clients/{id}.inbodySummary` and the nightly `renewal.proof.inbody` keep the raw changes, and the nightly job is untouched. Lowering a studio's numbers brings a hidden change straight back.

### The wording, before and after

At the defaults, for the fixtures the tests pin (a client up 2.3 lb of muscle and down 1.8–2.2 points of body fat):

| Where | Before | After |
| --- | --- | --- |
| **Progress report** — Body Composition, Change column | `+2.3 lb` (green), `−2.2 pts` (green) | `+2.3 lb · within normal variation`, `−2.2 pts · within normal variation` (uncoloured), and one line under the table: *"Within normal variation: smaller than the difference an InBody scanner can show between two scans of the same body, so it isn't counted as a change."* A change beyond the variation prints as before, e.g. `+4.1 lb` (green) |
| **Renewal Brief** — health, the InBody line | `InBody since Jan 15: muscle up 2.3 lb, body fat down 1.8 points` | `InBody since Jan 15: no change bigger than the scanner's normal variation`. Only a called change is named: `InBody since Jan 15: muscle up 4 lb, body fat down 3.1 points`, or just `… muscle up 2.3 lb` when a studio's muscle number is 2 |
| **Renewal Brief** — upgrade reasons | `InBody: muscle up 1.2 lb.` counted as visible progress | only muscle up, or body fat down, beyond the variation counts; otherwise "Progress isn't visible in the data yet." |
| **Pipeline row and the profile's renewal card** — the proof line | `In 11 of the last 12 weeks · stronger on 12 of 14 machines · +2.3 lb muscle` | `In 11 of the last 12 weeks · stronger on 12 of 14 machines` (the muscle part returns at `+4 lb muscle` and above) |
| **Pipeline** — "Upgrade candidates" filter | a client whose only progress was +1.2 lb of muscle was a candidate | not a candidate at the defaults; each row is judged by its client's home studio's numbers |
| **InBody card** — the sentence | `Since Jan 15: muscle up 2.3 lb, body fat down 2.2 points.` | `Since Jan 15: no change bigger than the scanner's normal variation.` — or `Since Jan 15: muscle up 4.0 lb; body fat within the scanner's normal variation.` when one is called |
| **InBody card** — the tiles | `+2.3 lb` (green) | `+2.3 lb · within normal variation` (uncoloured) |

### Files

`src/features/inbody/variation.ts` (+ test), `useInBodyVariation.ts`, `scans.ts` (`formatCalledChange`; `changeTone` and `summarySentence` take the variation), `InBodyCard.tsx` (+ render test), `InBodyReportSection.tsx`; `src/components/ClientProgressReportView.tsx`; `src/features/renewals/brief.ts`, `sentences.ts`, `options.ts`, `pipeline.ts`, `RenewalCardDialog.tsx` (+ the three tests); `src/features/admin/renewals/RenewalsPipeline.tsx`, `RenewalBrief.tsx`; `src/features/my-studio/InBodyVariationPanel.tsx` (+ render test), `StudioSection.tsx`; `src/types.ts` (`Studio.inbodyVariation`); `tests/firestore.rules.test.ts`; the InBody and My Studio READMEs, KNOWN-TRAPS and ARCHITECTURE.

## Phase 5 — one visual kit

Every codex page is built from one kit, so a trainer learns one panel, one button and one set of words: `src/features/client-codex/kit/` (read `src/features/client-codex/README.md`). Nothing on screen changes in this phase — the kit has no caller yet; the shell (phase 8) and the pages use it.

- **Tokens** (`codex.tokens.css`): every colour is an alias of a token the app already has (`--eq-*`, `--ford-*`), so there is no new palette and light and dark come for free. Text is 11 / 12 / 14 / 17 / 30px and nothing else.
- **Pieces** (`primitives.tsx`, `ReadEdit.tsx`, `fields.tsx`, `SaveBar.tsx`, `kit.css`): Page (head, ‹ › neighbours, Next card), Card, Slot, FactList, Rows, Chip, LoudChip, Btn, FordMark, the read-view-then-Edit frame, the inputs and pick pills, and the one Save bar ("1 unsaved change · FORD · Occupation"). Nothing tappable is under 40px; nothing is clipped; solid buttons are brand blue, never orange.
- **Words** (`text.ts`, `src/lib/first-sentences.ts`, `pronouns.ts`): whole sentences instead of "…" (a critical note is never cut mid-instruction), dates the studio way, and she / he / they from the gender Mindbody holds — they when it holds none (the overnight default for AJ's pronoun question; one file to change). The review caught `firstSentences` ending "Train her at 7 a.m. only…" after "a.m." and "Ask "does it pinch?" before every set" after the question mark; the word after the mark now decides (a lower-case word or a number means the sentence goes on), so an abbreviation it does not know makes the line longer instead of cutting it. `inTime` counts days up to 30 ("Birthday in 17 days", as the mockup says), and FORD will use it rather than a second formatter.
- **Loudness**: `LOUDNESS_TONE` is exported from `src/features/rating/Loudness.tsx`, so the codex shows Heads up plum and Critical crimson with the one control's own mapping (a departure from the mockup's gold, as agreed).
- **The contract is a test** (`kit/scale.test.ts`): it reads every codex file and fails on an off-scale text size, a raw hex colour or a colour a component sets itself, clipped text (a line clamp is allowed only on the two named row-body selectors, at two lines), a regex lookbehind or a raw invisible character, and on any file in the folder that is not on its list. Adding a 13px rule to `kit.css` fails it (checked). `kit/kit.render.test.tsx` mounts every piece in light and dark and checks each control is at least 40px tall.
- **Accessibility**: a field's label is its name and its hint its description, so VoiceOver reads each once; the Save bar announces the first unsaved change through a live region that is mounted before it.

No Firestore, rules, index or Functions change.

## Phase 6 — additive props and exports the pages need

The codex loads each thing ONCE for the whole tab and hands it to every page. This phase lets the existing pieces take what the tab loaded instead of reading it again, and exports the small readers the pages need. **No screen changes**: every new prop is optional, and a caller that passes none of them behaves exactly as before (the existing notes, Pulse panel, goals and contract tests pass unchanged).

- **Shared data, one listener each.** `FordSection` takes `ford` (the tab's FORD stream), `InBodyCard` takes `inbody` (the tab's scans), and `ClientCheckInPanel` takes `draft` (the Body & Pulse page's one Pulse draft). Given one, each disables its own hook — it is not opened a second time. For the Pulse this is more than cost: two drafts of one client autosaving side by side is the duplicate-draft bug. The panel also takes `startInClientMode` (opens client mode once the draft is in, and again each time it turns true, so "Hand to client" on the page is one tap) and `onClientModeClose`; client mode never opens over a draft still loading. `CheckInDraftState` is exported.
- **Readers exported, not rewritten.** `statementAnswer` (a saved round's own answer to one statement on 0–10 — a v1 answer converted, `null` when the round did not ask; it was the private `ownAnswer`) and `painKeyOf` (`region:side`, how a spot is paired with last round's). `ContractTermRow.cancelledAt` — when Mindbody said a contract was cancelled; null unless the row is cancelled (a re-activated contract with a stale stamp never reads as cancelled) and for paid-in-full rows. Story will read it.
- **`useFocusActions`** (`src/features/goals/`): set, achieve, extend, retire and check in on a focus, moved out of `ClientJournalTab` unchanged (author = the Auth uid, the check-in carries its focus id). The journal's Focus area uses it now; Goals & Focus will.
- **`useNoteDismissalsState`**: the trainer's dismissals plus whether they have been read (`loading · ready · failed`), keyed by uid so another trainer never inherits the map. The Notes page offers hush / restore only once it is `ready`. `useNoteDismissals` (the briefing's) returns the same map as before.
- **ClientProfileView** gains `progressReportsStatus` (whether the progress-reports listener answered for THIS client — Pulse history is read from that list, and a list never read must not pass for "no Pulse on file") and `journeyCompletedCount` (the Journey session count, null until the count answers — the header's number starts at 0). The profile is not remounted per client, so both are stamped with the client they are for and read through `answerFor` (`src/features/client-profile/client-answer.ts`). Nothing reads them yet; the shell (phase 8) passes them to the codex. Out of quota, the reports listener never opens, so the status says `failed` rather than waiting forever.

Tests: the new props each have a render case (the panel with the page's draft makes no read of its own — checked by count against the panel alone — and writes once; client mode waits for the draft and re-opens on a second tap; FORD and InBody open no listener when handed their data and say "couldn't be read" / "loading" rather than "nothing"); `useFocusActions` mounts on its own and through the journal's Focus card; the dismissals status, `answerFor`, `cancelledAt`, `statementAnswer` (v1 and v2) and `painKeyOf` have unit cases. No Firestore, rules, index or Functions change.

**Carried to phase 8.** Nothing mounts `ClientProfileView`, so the wiring that stamps `progressReportsStatus` (the listener's success and error callbacks) has no test: dropping the `failed` stamp would leave Pulse history "loading" forever with the suite still green. Phase 8 moves the reports listener into a small hook with its own render test (ready, failed, a client switch, out of quota). The codex also stays keyed on `client.id`: `draft`, `ford` and `inbody` are not checked against the panel's `client`, so a stale hand-over is prevented only by that key.
