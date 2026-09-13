# Trainer identity — the fix, and the migration that is still pending

Round: Sep 6 2026, branch `trainer-identity-fix` off `master`.
Diagnosis lives in `ADMIN-OVERHAUL-PREP.md`; this is what was done about it.

## The bug, in one paragraph

Every Firestore rule answered "is this your document?" with
`request.auth.uid == trainerId`, which is only true when the document id IS the
auth uid. Two admin creation paths used `addDoc`, which assigns a random id,
and sign-in matched people **by email first** — so those trainers arrived
holding a document id no rule would accept, and every write to their own
profile was denied. The Kaizen Roster was simply the first place it produced a
visible symptom. Because the `allow update` rule's superadmin branch skips the
roster guard entirely, it worked for admins and failed silently for everyone
else.

## What shipped (A + B)

| Phase | What | Where |
| --- | --- | --- |
| 1 | `ownsTrainerDoc()` — ownership is the uid **or** the email on the document matching the token. Used by both the roster guard and the identity clause. | `firestore.rules`, `firestore.staging.rules` |
| 2 | Sign-in looks up `trainers/{uid}` **before** the email query, and skips superseded documents | `useAuthInitialization.ts` |
| 3 | Admin-created profiles are marked `pendingClaim` and claim their uid at first sign-in | `features/trainer-identity/claim.ts`, the two admin screens |
| 4 | Tombstones are filtered out of every trainer list | `useTrainers`, sign-in, Staff & Roles, manual refresh |

Two things are worth knowing if you touch this again:

**Relaxing the roster guard alone would not have worked.** The `allow update`
rule ANDs the roster guard with an identity clause containing the same uid
comparison, so a mismatched trainer failed twice. Both now go through
`ownsTrainerDoc`, which is why it is a helper rather than an inline change.

**The claim's write order is the only thing holding it together.** Write
`trainers/{uid}` first, tombstone the placeholder second. No transaction spans
a create and an update that these rules accept, so the claim can be interrupted
between the two — and this order makes every interruption harmless, because
phase 2 makes the new document win from the moment it exists. The reverse order
would strand someone with no profile at all.

## What has NOT been done (C)

Profiles that already have the wrong id are **not** moved. They are referenced
by sessions, schedules, progress reports, journal entries, focuses, incidents,
rosters and studio owner fields; repointing those is a data migration, not a
sign-in side effect. `decideClaim` enforces that line — it refuses anything not
explicitly marked `pendingClaim`.

### Step 1 — find out whether there is anything to migrate

```powershell
npx firebase login
npx tsx scripts/report-trainer-identity.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
```

Read-only; it writes nothing. It reports every trainer as one of:

- **ok** — keyed on their auth uid. Nothing to do.
- **placeholder** — admin-created, claims itself at first sign-in. Nothing to do.
- **no-account** — a profile exists but nobody has ever signed in as them.
- **stranded** — needs the migration.
- **collision** — two documents for one person. Needs a human, not a script.

It also counts how many documents point at each stranded id. **That number is
the cost of the migration.** Add `--json report.json` to keep the output.

If `stranded` and `collision` are both zero, there is no migration and this
round is finished.

### Step 2 — only if step 1 says so

The write half is deliberately not implemented. A migration written before
anyone has seen the data is a guess with a backup attached, and the shape of
the fix depends on what comes back — particularly the collision count, which
decides whether this can be automated at all.

When it is written, follow `scripts/migrate-canonical-client-ids.ts`. It
already establishes the pattern this needs: dry run by default with nothing
written without `--commit`, a full JSON backup of every document it may touch
written **before** the first write, tombstones instead of deletes so anything
holding an old id stays traceable, and a resume log so a crashed run can be
re-run safely.

Order of operations for the real run: back up → move the profile → repoint
references → tombstone the old document. Same reasoning as the claim: the
person must never be without a working profile at any point in between.

## Flagged, not fixed — for the rules sweep

`firestore.rules` currently allows **any authenticated user to create
`trainers/{their own uid}` with any role**, including `Admin`. The clause is
the bootstrap escape hatch at the end of the trainers `allow create` rule, and
`isValidTrainer()` does not constrain `role`. So a signed-in Google account can
mint itself an admin profile.

It was left alone deliberately. Tightening it interacts with the first-trainer
bootstrap and with the claim (which carries an admin-set role across), the
rules emulator cannot run in this checkout — it needs JDK 21 and the machine
has 11 — and a wrong guess in a `create` rule locks people out of the app. It
wants the rules sweep, an emulator, and a test, in that order.
