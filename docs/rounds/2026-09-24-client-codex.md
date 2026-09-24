# The Client Codex — Notes & Profile as seven pages

*Sep 24 2026, overnight. Branch `client-codex`, one commit per phase. **Nothing is pushed or deployed** until AJ says go: the phases accumulate on the branch (AJ's decision). The plan is `INTEGRATION.md` and the six area specs in the session scratchpad; the approved mockup is `client-codex.html`. This document is started in phase 2 and finished in the last phase (the full story, the baselines, how it ships, and the index and CHANGELOG rows).*

## Phases so far

- **1 — FORD reads that work for every trainer, and honest test commands** (`29f653d`). `useClientFord` listed FORD with no studio filter, so the rules refused it for everyone below franchise owner and the refusal read as "nothing on file". Now filtered on the client's studio, with a `status` that tells "couldn't be read" and "kept by the home studio" from empty. `useClientJournal` reports what it could read and hands out the sessions it already streams. The test commands skip the `.claude` worktree copies. See KNOWN-TRAPS → The client profile.
- **2 — The InBody normal variation (AJ's decision 8).** Below.

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
