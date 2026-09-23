# One Mindbody number, two people — what shipped, and a proposal for the real fix

*Sep 23 2026. Phases 28–30 on the `collision-cleanup` branch; the proposal at the end needs AJ's decision before any of it is built. Follows phases 24–27 (the collision check, the damage check, and the schedule sync's site test), which are in `CHANGELOG.md`.*

## The problem in one paragraph

Mindbody promises a client number is unique **within one site**. Max Strength has two sites — **29068** (Westlake, Strongsville, Willoughby) and **5746957** (Solon) — and both started counting at 100000001. So the same number can mean two different people: on Sep 23 the collision check found **43** numbers that name a different person at each site. Journey keeps a Mindbody client at `clients/{their number}`, with no site in it, so whoever got there first owns the number and the other person has nowhere to live. Every part of the app that looked a client up "by number" could put one person's things on the other's record.

## Where it stands tonight

| | |
| --- | --- |
| Bookings on the wrong person | **21** at 23:38 UTC (14 of Barjesh Walters's on Solon's Aydin Kara, 7 of Efty Simakis's on Solon's Sherry Noll). Phase 28 removes them — see *To run* below |
| Sessions on the wrong person | **0**. Nobody has trained under someone else's record |
| The schedule sync | Fixed by phases 26–27 (live): a booking from the other site is written unlinked, under the name Mindbody gave it |
| The Mindbody webhook | Had the same hole, and worse — it can move a client's home studio. **It has received 0 events in 30 days**, so it did no damage. Phase 29 closes it before anyone turns it on |
| Admin → Limbo | Its two buttons could write onto the wrong person. Phase 30 closes them |
| The people with no record | Barjesh, Efty, and anyone else on the "second" side of the 43 numbers who books. They show on the calendar but cannot be opened or coached in Journey. **This needs the proposal below** |
| Appointment numbers | Checked, and **not** a problem: Solon's run 3,070–25,059, site 29068's run 680,281–2,182,946. `schedules/{appointmentId}` cannot collide today |

## What shipped (branch `collision-cleanup`, not yet on `master`)

- **Phase 28 — `scripts/unlink-crossed-bookings.ts`.** Finds the bookings filed on the wrong person the same way `check-collision-damage.ts` does, and sets their `clientId` to empty — exactly what the fixed sync writes. The booking stays on the calendar under the right name. Dry run by default; `--commit` writes a backup to `backups/` first and re-checks every row as it goes. Never touches a session.
- **Phase 29 — the webhook's site test.** Before it writes anything to a client, the webhook checks where that client's home studio is. If it is on the **other** site, a client or contract event is parked in Limbo (marked `crossSite`, not applied) and a booking is written unlinked. A sibling studio on the same site is a visitor and is fine; anything unknown carries on as before. Six tests; switching the check off fails the three that matter.
- **Phase 30 — Limbo.** *Release to schedule* now asks Firestore whether the client exists (it used to look in whatever roster the screen had loaded, and could write a new name and home studio over someone missing from it), and releases unlinked when the number belongs to the other site. *Set home studio* refuses the same case. Entries the webhook marked `crossSite` explain themselves and offer only Dismiss. The rule lives once, in `src/lib/mindbody-site.ts`.

### To run (AJ, on the PC — this writes to production)

1. Open PowerShell in `C:\Users\austi\Projects\Journey-System-Beta-master`.
2. Look first: `npx tsx ..\Journey-preview\scripts\unlink-crossed-bookings.ts` — it lists the bookings and writes nothing.
3. If the list looks right: `npx tsx ..\Journey-preview\scripts\unlink-crossed-bookings.ts --commit`
4. Check: `npx tsx scripts/check-collision-damage.ts` should say **NOTHING CROSSED**.

(Once the branch is merged, the script is at `scripts\unlink-crossed-bookings.ts` in the main folder too.)

### To ship

- The app half (phase 30) goes live with a push to `master`, like everything else.
- The webhook half (phase 29) goes live separately: `firebase deploy --only functions:mindbodyWebhook`. Nothing depends on the order — the webhook is not receiving events.
- No rules change, no index change.

## The proposal: give the second person a record of their own

### The options

**A. Put the site in every client's id** (`clients/29068-100000310`, `clients/5746957-100000310`, for everyone). Clean, but every existing client moves, and so does everything that points at them — sessions, notes, routines, machine settings, journal, focuses, FORD, InBody, renewals and about a dozen more collections. The biggest migration this project has done, to fix 43 people. **Not recommended.**

**B. Keep every existing record where it is; give only the second person a site-qualified id.** *(Recommended.)* Nobody moves. The rule for "which Journey record is Mindbody client X on site S":

1. `clients/S-X` if it exists — the second person, already made.
2. Otherwise `clients/X`, **if its home studio is on site S, or its home is unknown** — the first person, as today.
3. Otherwise the number belongs to someone on the other site: create `clients/S-X` for this person.

Every client record also gains `mindbodySiteId`, so a record always says which site it belongs to rather than working it out from its home studio. The new id has a dash in it, so the old "an all-digit id is a Mindbody number" fallback (`src/lib/mindbody-id.ts`) can never mistake it.

**C. Give every client a random id and store their Mindbody numbers per site.** The most flexible, and the same migration as A. Only worth it if clients will routinely hold accounts at both sites. **Not now.**

### What B touches

The places that turn a Mindbody number into a Journey record — all of them, so none is left using the old rule:

- the schedule sync (`src/lib/mindbody-api-sync.ts`: `resolveCanonicalClientId`, `checkClientIds`, client creation), including a gap found tonight: when a trainer's read of a client is refused by the rules, the sync still links the booking to `clients/X` without checking the site;
- the webhook (`functions/src/mindbody/index.ts`, `clientResolver.ts`);
- the Limbo release (`src/lib/mindbody-limbo.ts`);
- the server's cross-site permission check (`server/auth.ts: readableClientSite`), which reads `clients/{mindbodyClientId}` from the request;
- the schedule panel's fallback to `mindbodyClientId` when a booking has no `clientId` (`src/features/relay/board/now-context.ts`).

What is already safe: Master Sync, the contract panel and the nightly renewals job send Mindbody the stored `mindbodyClientId` and pick the site from the home studio, so they work for a `S-X` record unchanged. Nothing in `firestore.rules` depends on the id's shape.

Then a one-off script: create the missing records for the people already booked (today, Barjesh Walters and Efty Simakis) and relink their bookings to them — dry run by default, as always.

Estimated at one round: five or six phases, each typechecked and tested on its own, the webhook deployed separately.

### What AJ decides

1. **B, or something else?** It is a change to the Firestore structure, which needs your explicit OK.
2. **Who keeps the plain number today?** The proposal says: whoever holds it now. That is Solon for nearly all of the 43, and site 29068 for 4 (Tony Lavorgna, Elaine R Kosco, Catherine Golladay, Mitch Zunich — so their Solon namesakes would get `5746957-…` records).
3. **The same person at both sites.** About six people have a separate Mindbody account at each site under the same number *and* the same name (for example Doug Wieder, Shelly Peet). Under B they become two Journey records. Keep them separate, or link them so their history is in one place?

## Found on the way, not part of this

- **About 600 past bookings are unlinked for reasons that have nothing to do with the collision** — 148 at Solon and 448 at site 29068 for non-colliding clients, last written Aug 26 – Sep 1. They are from before the sync fixes of mid-September and are outside the sync window now. `scripts/diagnose-schedule-links.ts` is the tool for them.
- `docs/KNOWN-TRAPS.md` still says collisions "haven't been ruled out". They have been ruled *in*; update it when the proposal is settled.
