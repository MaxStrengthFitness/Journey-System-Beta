# Admin overhaul — round 1

Branch `admin-overhaul-round1`, off `master` after merging `trainer-identity-fix`.
Fourteen commits, one per phase, each individually revertable.

Sections 1–5, 7 of the brief, plus the fallback protocol (offline studios,
temporary profiles, reconciliation), machine cloning and the maintenance log.
Sections 6, 8–18 are round 2 — see the end of this file.

---

## Deploy before this ships

Two of these are hard requirements: without them, screens render but come back
empty or refuse writes.

1. **Firestore indexes.** `firebase deploy --only firestore:indexes`
   - `clients(homeStudioId, isActive)` — the per-studio client count. Without
     it every count reads as unknown (an em-dash), never as zero.
   - `clients(homeStudioId, lastName)` — the Clients screen. Without it the
     screen shows the index name in its error rather than an empty list.

2. **Firestore rules.** `firebase deploy --only firestore:rules`
   - New: `studios/{id}/upkeepLog` — create for any trainer, no updates ever,
     delete for managers.
   - Changed: a trainer document someone creates FOR THEMSELVES may no longer
     hand itself Admin, Founder or Overseer. See the warning below.

3. Nothing else. No functions changed, no data migration in this round.

### The rules change is not emulator-tested

`npm run test:rules` still cannot run: the Firestore emulator needs JDK 21,
this machine has 11, and the cloud container that does have 21 has its egress
blocked from `storage.googleapis.com`, so the emulator jar will not download.
That was checked again this round, not assumed.

So verify it the two ways that are available:

- `firebase deploy --only firestore:rules` compiles server-side and **fails
  before writing** if the syntax is wrong. A clean deploy proves it compiles.
- The Rules Playground in the Firebase console proves it behaves. Two cases
  worth running:
  1. Signed in as any non-admin, `create` at `trainers/{your uid}` with
     `role: "Admin"` → must be DENIED. That is the hole being closed: until
     now any signed-in Google account could make itself a system administrator.
  2. Signed in as `jurgensaj@gmail.com`, the same create → must be ALLOWED.
     That is your own bootstrap, and it is exempted by email to mirror the
     hard-coded bootstrap already in `useAuthInitialization.ts`.

If it ever blocks someone who should be an admin, an existing super admin can
set the role — the update rule permits that. Nobody gets locked out.

`firestore.staging.rules` has diverged from production since the studio roster
and machineNotes rounds and does not get these changes; reconciling the two
files is its own piece of work.

---

## Review on the iPad, in this order

The interesting screens first, because they are where the arguments are.

**Admin → Overview.** The old landing page showed a month's session total, a
cross-train total and a per-studio card headed "Strict Demographic Adherence".
It should now be today's floor: who is coaching and who they are with, what is
booked, what fell over.
- [ ] The trainer lanes match who is actually in.
- [ ] "Not marked" — slots that finished with no outcome. This number has
      never been visible before, so it may be large on first look. That is the
      finding, not a bug.
- [ ] Missed = no-shows + cancellations, broken out underneath.
- [ ] Studio to-do shows today's list and Done works.

**Admin → Studios.** This is where three defects were.
- [ ] Edit a studio, save, reopen. `ownerId` and `headTrainerId` must survive
      — every save used to null them.
- [ ] Delete a test studio that belongs to a franchise. The franchise must
      stop listing it.
- [ ] If the red "Registry needs attention" panel appears, that is real damage
      the old delete path already did. Repair is safe to run twice.
- [ ] Create an OFFLINE studio with no Site ID at all. It should be allowed
      and should read "Runs offline", not "Not linked".
- [ ] Add the standard set twice. The second time should add nothing.

**Admin → Staff & roles.**
- [ ] Mindbody staff with no app account are listed, and explained. There is
      no "New User" button any more — that is deliberate.
- [ ] Anyone waiting for approval sorts to the top.
- [ ] A red triangle means two accounts match one person. Do not delete
      either yet — run the trainer identity report first (TRAINER-IDENTITY.md).

**Admin → Clients.**
- [ ] Defaults to your studio, not the network.
- [ ] Search waits for you to stop typing.
- [ ] "Every studio" with no search asks for a filter instead of listing
      18,000 documents.

**Admin → Catalog, and Studios → a studio → Equipment.**
- [ ] The New Machine modal is now wide. It was 384px on this device, which is
      the single cause of everything being cut off.
- [ ] Local setup: type the catalog's own name into "What this studio calls
      it" — it should tell you it will not store that as an override.
- [ ] Upkeep: log a deep clean, then check the history and the tally.

**Everywhere.**
- [ ] Save bars say "Saved", not nothing.
- [ ] Nothing destructive commits on one tap.
- [ ] The active tab orange matches the rest of the app.

---

## Things you should know before you look

**Auto-sync is now real.** `autoSyncEnabled` and `syncIntervalMinutes` have
been settable since the round that added them and nothing has ever read them.
They are read now, and the lease is SHARED across every device at a studio, so
six iPads still do one pull per interval rather than six. The countdown on the
Integrations screen used to be theatre — a wall-clock timer with no sync
behind it — and now reflects the real lease.

**A test caught two accessibility bugs in the CSS this round wrote:** white on
solid `#ef5302` is 3.55:1, below AA for small text, and `--adm-border-strong`
is 1.96:1 as an input boundary. Both are inherited from the existing app
palette, so **screens outside admin have the same problem** — worth a pass.

**The old client-id migration script was going to lose the journal.**
`scripts/migrate-canonical-client-ids.ts` repointed `focusRecords` and
`trainerFocuses` but not `journalEntries` or `clientFocuses` — the two
collections that superseded them. Corrected. If it has ever been run with
`--commit`, some clients may already have lost journal references; the
`migratedTo` tombstone is how you would find them.

---

## Round 2

Sections 8–18, in the order they make sense:

- **9. Alerts & Comms** — already removed from the nav this round. Announcements
  still need routing into the user-side Alerts section (section 8).
- **10–12. Mindbody / Integrations / Limbo** — collapse into one diagnostic
  status screen with a single Force Sync. The Mindbody tab is still a
  fixture-driven mockup shipping in production: "Downtown Studio", a trainer
  called Marina, five invented clients, a reliability score of 82, and
  Approve/Deny buttons that `console.log`. Only the connection test is real.
- **13. Bug reports** — surface the diagnostic payload the feedback drawer
  already collects.
- **15. Franchise hub** — `FranchiseTeamManagement` still has an "Add New"
  that creates trainer documents with random ids. It is guarded by
  `pendingClaim`, so it is safe, but it is the last surviving path of the
  model phase 8 replaced.
- **16. Customize Studio** — the redundant route back to the admin dashboard.
- **18. Catalog** — the body-group landing screen, the MSF Academy hierarchy
  in the machine picker, and the upkeep screen. The upkeep DATA layer is done
  (`features/admin/upkeep`); the catalog just has to render it.
- **6. Insights** — deferred by you, deliberately.

Also carried forward, not forgotten:

- The duplicate Leg Extension is still a real Firestore document filed under
  the old `leg_extension` id convention. Seeding now collapses it so no studio
  gets two, and the summary names it — but it wants deleting at the source.
- `functions/` has no test script and no CI, so 13 backend suites including
  the whole Mindbody set have never run.
- `setCustomUserClaimsV2` is still never called, so every
  `request.auth.token.role` fast path in the rules falls through to a document
  read. A plausible contributor to the Aug 30 quota storm.

---

## Verification at the end of round 1

- 38 test files, 873 tests, all passing (up from 27 files / 528 at the
  baseline — 345 new tests).
- Typecheck: 43 errors, which is the master baseline of 44 less the one that
  lived in a screen phase 2 deleted. No new errors.
- `vite build` clean.
- Not pushed, not merged. `git push origin admin-overhaul-round1` when you are
  happy, or merge into master locally first.
