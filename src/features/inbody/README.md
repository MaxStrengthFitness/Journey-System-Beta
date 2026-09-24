# InBody scans

Renewals round, Sep 2026 (Phase 7). The proposal is `OPERATIONS-RENEWALS-PROPOSAL.md` §4.5. The scanner's normal variation came with the client codex (Sep 2026, AJ's decision 8).

## What it does

- **Notes & Profile → Body & Pulse → Body composition · InBody** (last on the page). The latest scan's four headline numbers (weight, skeletal muscle mass, body fat mass, percent body fat). Each shows its change since the first scan. Every scan is listed below, with who entered it (the row wraps; nothing is cut). It is the printout's "Body Composition History", with every test kept instead of the last eight. The card draws its own trend lines unless its host passes `showTrends={false}` — Body & Pulse does, because its timeline (client codex, phase 13) draws them. Since phase 12 the card is drawn with the codex kit and its tokens: good news is `--cx-ok`, a change worth watching plum `--cx-warn`, anything else — a change inside the variation, and weight — the muted ink (`data-tone` on the change line).
- **Add scan.** Typed from the InBody 270S printout, in the printout's order. The four headline numbers are required. Everything else is optional: BMI, phase angle, water, dry lean mass, fat-free mass, BMR, SMI and segmental lean. The form checks the numbers the sheet ties together: percent body fat against fat mass ÷ weight, fat-free mass against weight − fat mass, and water + dry lean mass against weight − fat mass. A mismatch shows a warning but never blocks saving.
- **Renewals.** The Renewal Brief says "InBody since Jan 15: muscle up 4.1 lb, body fat down 3 points" — or "no change bigger than the scanner's normal variation". The Renewal card and the pipeline rows add "+4.1 lb muscle" to their one line of proof, and a body-composition change can make an upgrade candidate. All of these read `clients/{id}.inbodySummary` through the nightly snapshot (`proof.inbody`), or through the live snapshot when a single client is open, and every one of them goes through the variation below.
- **Progress reports.** Finalized and printed reports show a Body Composition table and trend lines, taken from the scans up to the report's date.

## What counts as a change (client codex, Sep 2026)

An InBody scan of the same body reads a little differently every time. Before this round every screen called any difference a change, so "+1.2 lb muscle" was proof on the renewals pipeline, made a client an upgrade candidate, and printed green on the progress report the client takes home. A confident wrong number is worse than a missing one.

**The rule** (`variation.ts`, the ONE answer): a change SMALLER than the studio's number for that measure is *within the scanner's normal variation*, and no screen calls it up, down, better or worse. A change equal to the number or bigger is called. The number itself is always shown — only the call is withheld:

| Measure | Max Strength's default | A studio may set |
| --- | --- | --- |
| Skeletal muscle | 3.5 lb | 0.5–10 lb |
| Body fat mass | 5.3 lb | 0.5–15 lb |
| Body fat % | 2.7 points | 0.5–6 points |
| Weight | none — never toned, always shown plainly | — |

**Where the defaults come from.** McLester, Nickerson, Kliszczewicz and McLester, "Reliability and Agreement of Various InBody Body Composition Analyzers as Compared to Dual-Energy X-Ray Absorptiometry in Healthy Men and Women", *Journal of Clinical Densitometry* 23(3), 2020 (PubMed 30472111). Across the InBody 230, 720 and 770 the minimal difference was 2.12–2.73 % body fat, 1.49–2.39 kg fat mass (3.3–5.3 lb) and 1.60–2.32 kg fat-free mass (3.5–5.1 lb) — checked against the abstract on Sep 24 2026. Fat mass and body fat use the CAUTIOUS end, because the studios' 270S is a portable scanner like the study's 230, and a missed small change is better than calling noise progress. The study did not measure skeletal muscle. 3.5 lb is AJ's figure, the low end of the fat-free-mass range — a judgement, not a measured number, and the first one to revisit if InBody or a later study publishes a skeletal-muscle figure.

**Each studio sets its own** on **My Studio → Studio → InBody: the scanner's normal variation** (`src/features/my-studio/InBodyVariationPanel.tsx`), stored at `studios/{id}.inbodyVariation`:

- the whole map is written at once, `{ skeletalMuscleMassLb, bodyFatMassLb, percentBodyFat, updatedBy, updatedAt }`, with `updatedBy` the **Auth uid**; the panel names who set it and when;
- "Use Max Strength's defaults" fills the form, and saving it **removes the field**, so an absent field always means "the defaults" and a studio on the defaults follows them if they change;
- `normalizeInBodyVariation` reads a missing, malformed or out-of-range number as the default, field by field — one bad value can't make a studio's scans read as all change or all noise;
- no rules change: the studio update rule already lets only the studio's own leaders (a leader role there, or the grant), franchise owners and administrators write a studio (`tests/firestore.rules.test.ts` → "Studio InBody variation").

**A client is always read against their HOME studio's numbers** (`variationStudioIdOf(client)`: `homeStudioId`, then the older `studioId`), wherever the profile is opened — so one client never reads two ways. The numbers come from the studio documents the app already streams (`useInBodyVariation(client)`, and `useInBodyVariationLookup()` for the pipeline's rows, both through `variationForClient`). Both take the CLIENT, never a studio id, so no screen can pass the studio the iPad is in. There is no read, and while the studios have not arrived the defaults apply.

**The readers**, every one through `callChange`:

| Screen | What obeys it |
| --- | --- |
| The InBody card | the tiles' change line and colour (`formatCalledChange`, `changeTone`), the summary sentence (`summarySentence`) |
| The progress report (print and view) | the Change column, plus one line explaining "within normal variation" when any row is |
| The Renewal Brief | the InBody health line (`healthLines`) and the upgrade reasons (`upgradeVerdict`) |
| The renewal card on the profile | the proof line (`proofSentence`) |
| Body & Pulse → Measured, and what she told us | the Strength row: first scan against the latest, "inside the scanner's normal variation (±3.5 lb, Max Strength's default)" or "Up 4.0 lb, beyond … (set by Solon)" (`client-codex/body/pairs.ts`) |
| Operations → Renewals → Pipeline | each row's proof line, and the "Upgrade candidates" filter (`PipelineRow.inbodyVariation`) |

**What is stored never changes.** `clients/{id}.inbodySummary` and the nightly job's `renewal.proof.inbody` keep the RAW changes; the variation is applied only when a screen shows them. The nightly job (`server/renewals-job.ts`) writes no sentence and is untouched. Lowering a studio's numbers brings a hidden change straight back.

**Wording, before and after** (at the defaults, for a client up 2.3 lb of muscle and down 1.8 points of body fat):

| Where | Before | After |
| --- | --- | --- |
| InBody card sentence | Since Jan 15: muscle up 2.3 lb, body fat down 1.8 points. | Since Jan 15: no change bigger than the scanner's normal variation. |
| InBody card / progress report change | +2.3 lb (green) | +2.3 lb · within normal variation (uncoloured) |
| Renewal Brief | InBody since Jan 15: muscle up 2.3 lb, body fat down 1.8 points | InBody since Jan 15: no change bigger than the scanner's normal variation |
| Pipeline / renewal card proof | In 11 of the last 12 weeks · +2.3 lb muscle | In 11 of the last 12 weeks |
| Upgrade candidates | a +1.2 lb muscle change counted as visible progress | only muscle up, or body fat down, beyond the variation counts |

## Data

| Where | What | Written by |
| --- | --- | --- |
| `clients/{clientId}/inbodyScans/{scanId}` | One printout (`types.ts` → `InBodyScan`) | The app, as one batch with the summary |
| `clients/{clientId}.inbodySummary` | The first scan against the latest (`InBodySummary`), raw changes | The same batch, every add, correction or removal |
| `studios/{studioId}.inbodyVariation` | The studio's own numbers (`StoredInBodyVariation`); absent = the defaults | My Studio → Studio → InBody |

One listener per open client (`useInBodyScans`). A screen that already holds it — the Notes & Profile codex reads the scans once for every page that shows them — hands it to `InBodyCard` as `inbody`, and the card's own read is disabled (client codex, phase 6).

The progress report does **not** copy InBody numbers into the report document. `progressReports` can be read by any signed-in user, and body composition is health data. The report section reads the scans live instead, so anyone who can't open the client doesn't see it. The studio variation holds no client data, so the studio document (readable by anyone signed in) is the right place for it.

## Permissions (`firestore.rules`, mirrored in `access.ts`)

- **Read:** anyone who can open the client (the sessions pattern). That means administrators and franchise owners, plus trainers who work at or lead the client's studio or are cleared to cross-train them.
- **Add or correct:** the same people who can edit the client document: trainers who work at or lead the client's home studio, and administrators. A correction is signed (`updatedBy`). Who entered a scan, when, and where never change.
- **Remove:** whoever entered it, the studio's leaders, or administrators.
- **The studio's variation:** the studio's own leaders (and the grant), franchise owners and administrators — the studio update rule.

## Later (not built)

- **Photo of the printout:** read by the server's Gemini endpoints, with the trainer confirming each number. It would save as `source: "photo"`, which the rules already accept.
- **LookinBody Web import:** each studio has its own LookinBody Web account (AJ, Sep 11). An import therefore needs one API key per studio, held server-side, with scans written by the server as `source: "lookinbody"`. The app can't write that source.
- **A variation for the secondary measures** (BMI, water, lean masses, BMR, SMI, phase angle): not this round. They keep today's display, and no sentence names them.
