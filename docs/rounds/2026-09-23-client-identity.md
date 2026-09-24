# One Mindbody number, two people — the client-identity round

*Sep 23 2026. Phases 28–37 on the `collision-cleanup` branch. Follows phases 24–27 (the collision check, the damage check, and the schedule sync's first site test), which are in `CHANGELOG.md`. AJ approved the design ("I trust you, go for it") the same evening. Restore point: the tag `restore/2026-09-23-before-client-identity` (= phase 27, the last state before this round).*

## The problem in one paragraph

Mindbody promises a client number is unique **within one site**. Max Strength has two sites — **29068** (Westlake, Strongsville, Willoughby) and **5746957** (Solon) — and both started counting at 100000001. So the same number can mean two different people: on Sep 23 the collision check found **43** numbers that name a different person at each site. Journey kept a Mindbody client at `clients/{their number}`, with no site in it, so whoever got there first owned the number and the other person had nowhere to live — and every part of the app that looked a client up "by number" could put one person's things on the other's record. It had: 21 bookings (Barjesh Walters's on Solon's Aydin Kara, Efty Simakis's on Solon's Sherry Noll). No sessions.

## The rule now

Nobody moves. The **second** person on a shared number gets a record of their own, `clients/{site}-{number}` — for example `clients/29068-100000310` for Efty Simakis. Which record is Mindbody client X on site S:

1. `clients/S-X` exists → that is them.
2. `clients/X` is on site S, or its site is unknown → that is them (a sibling studio on the same site is a visitor).
3. `clients/X` is on the other site → someone else: `S-X`, made if it does not exist yet.
4. `clients/X` does not exist → X, made. A new client keeps the plain number, as always.

`src/lib/mindbody-site.ts` is the rule (`chooseClientDoc`). A record's site is its own `mindbodySiteId` (written on every record Mindbody creates from now on) or its home studio's. A record's Mindbody id is always the `mindbodyClientId` field; the `S-X` id has a dash, so `mindbodyIdOf` never mistakes it for a number. Master Sync, the contract panel and the nightly renewals job already send Mindbody the field and pick the site from the home studio, so they work for an `S-X` record unchanged. Nothing in `firestore.rules` depends on the id's shape.

**Decided with AJ:** whoever holds a number today keeps it (Solon for nearly all 43; site 29068 for Tony Lavorgna, Elaine R Kosco, Catherine Golladay and Mitch Zunich, whose Solon namesakes would become `5746957-…`). The half-dozen people with an account at each site under the same number and name (Doug Wieder, Shelly Peet…) stay two records for now — two Mindbody accounts, two records; linking them is a later decision.

## What shipped (branch `collision-cleanup`)

- **28** — `scripts/unlink-crossed-bookings.ts`. Superseded by 36 before it was ever run; kept for the record.
- **29** — the webhook's first site test (park rather than overwrite). Superseded by 34.
- **30** — Limbo's two buttons stop writing onto the wrong person, and *Release* asks Firestore whether a client exists instead of trusting the roster the screen had loaded (which could write a new name and home studio over someone missing from it).
- **31** — this document's first version (the proposal).
- **32** — the rule, `lib/mindbody-site.ts`, with its tests; `Client.mindbodySiteId`; Limbo release and *Set home studio* move onto it (they were phase 30's users of the older helper).
- **33** — the schedule sync files the second person at `S-X`, creating it like any new client. Also closes a gap found on the way: when a trainer's iPad could neither read nor create `clients/X` (it exists at a studio they cannot see), the sync linked the booking to X anyway — which on a shared number is the other site's person. Now nothing new is linked in that case, and a link a sync that *could* read the record already made is kept, so a leader's sync and a trainer's never undo each other. That trainer could not have opened the profile either way.
- **34** — the webhook follows the rule: client, contract, membership and booking events all go to `S-X`. It has received 0 events in 30 days, so this is ahead of any subscription (ARCHITECTURE 5.4, Gate C). The `crossSite` Limbo marker from 29 is gone; nothing writes it now.
- **35** — the server's cross-site permission check asks about `S-X` first; the Relay Now panel no longer opens a client by bare Mindbody number.
- **36** — `scripts/rehome-colliding-bookings.ts`: makes the missing `S-X` records from the bookings and moves those bookings onto them. Dry run against production on Sep 23: **2 people, 23 bookings** — Barjesh Walters (14, Westlake) and Efty Simakis (9, Strongsville; 7 filed on Sherry Noll, 2 left unlinked by phase 26).
- **37** — docs (CLAUDE.md's "where a client lives", KNOWN-TRAPS, ARCHITECTURE, START-HERE, this page) and `scripts/ship/ship-client-identity.ps1`.

Tests: 3,851 app tests and 156 webhook tests pass; typecheck at the baseline of 10. With the rule switched off, the new sync and webhook tests fail.

Checked and **not** a problem: appointment numbers. Solon's run 3,070–25,059 and site 29068's run 680,281–2,182,946, so `schedules/{appointmentId}` cannot collide.

## To ship (AJ, on the PC)

`scripts/ship/ship-client-identity.ps1` does it in stages, stopping before anything that goes live. By hand:

1. **The app** — push the branch to `master` (every push to `master` deploys the app to trainers). No rules or index changes.
2. **The records** — `npx tsx scripts/rehome-colliding-bookings.ts`, read the list, then again with `--commit`. Then `npx tsx scripts/check-collision-damage.ts` should say **NOTHING CROSSED**. Run this AFTER step 1, so no iPad on the old code files a booking back on the wrong person in between.
3. **The webhook** — `firebase deploy --only functions:mindbodyWebhook`. Not urgent: it receives no events today.

To undo: `git reset --hard restore/2026-09-23-before-client-identity` and push; the rehome script's backup in `backups/` holds every booking as it was.

## Found on the way, not part of this

- **About 600 past bookings are unlinked for reasons unrelated to the collision** — Solon and site 29068 alike, last written Aug 26 – Sep 1, before the mid-September sync fixes and outside the sync window now. `scripts/diagnose-schedule-links.ts` is the tool.
- The same-person-at-both-sites question above.
