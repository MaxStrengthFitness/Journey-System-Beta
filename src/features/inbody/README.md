# InBody scans

Renewals round, Sep 2026 (Phase 7). The proposal is `OPERATIONS-RENEWALS-PROPOSAL.md` §4.5.

## What it does

- **Profile → Details → Medical → Body composition.** The latest scan's four headline numbers (weight, skeletal muscle mass, body fat mass, percent body fat). Each shows its change since the first scan. Weight, muscle and body-fat trend lines appear once there are two scans, and every scan is listed below. It is the printout's "Body Composition History", with every test kept instead of the last eight.
- **Add scan.** Typed from the InBody 270S printout, in the printout's order. The four headline numbers are required. Everything else is optional: BMI, phase angle, water, dry lean mass, fat-free mass, BMR, SMI and segmental lean. The form checks the numbers the sheet ties together: percent body fat against fat mass ÷ weight, fat-free mass against weight − fat mass, and water + dry lean mass against weight − fat mass. A mismatch shows a warning but never blocks saving.
- **Renewals.** The Renewal Brief says "InBody since Jan 15: muscle up 2.3 lb, body fat down 2.2 points". The Renewal card and the pipeline rows add "+2.3 lb muscle" to their one line of proof. All of these read `clients/{id}.inbodySummary` through the nightly snapshot (`proof.inbody`), or through the live snapshot when a single client is open.
- **Progress reports.** Finalized and printed reports show a Body Composition table and trend lines, taken from the scans up to the report's date.

## Data

| Where | What | Written by |
| --- | --- | --- |
| `clients/{clientId}/inbodyScans/{scanId}` | One printout (`types.ts` → `InBodyScan`) | The app, as one batch with the summary |
| `clients/{clientId}.inbodySummary` | The first scan against the latest (`InBodySummary`) | The same batch, every add, correction or removal |

The progress report does **not** copy InBody numbers into the report document. `progressReports` can be read by any signed-in user, and body composition is health data. The report section reads the scans live instead, so anyone who can't open the client doesn't see it.

## Permissions (`firestore.rules`, mirrored in `access.ts`)

- **Read:** anyone who can open the client (the sessions pattern). That means administrators and franchise owners, plus trainers who work at or lead the client's studio or are cleared to cross-train them.
- **Add or correct:** the same people who can edit the client document: trainers who work at or lead the client's home studio, and administrators. A correction is signed (`updatedBy`). Who entered a scan, when, and where never change.
- **Remove:** whoever entered it, the studio's leaders, or administrators.

## Later (not built)

- **Photo of the printout:** read by the server's Gemini endpoints, with the trainer confirming each number. It would save as `source: "photo"`, which the rules already accept.
- **LookinBody Web import:** each studio has its own LookinBody Web account (AJ, Sep 11). An import therefore needs one API key per studio, held server-side, with scans written by the server as `source: "lookinbody"`. The app can't write that source.
