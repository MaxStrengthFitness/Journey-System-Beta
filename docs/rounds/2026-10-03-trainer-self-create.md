# Closing the self-made trainer profile (Oct 3 2026)

**Branch:** `claude/trainer-self-create-tighten`, off master `295c0516`. Two commits: this page, then the rule and its tests. **Nothing is deployed** — the rules go live only when AJ runs the deploy order in `CLAUDE.md`.

## The gap, in plain words

Since phase 8 the only way into Journey is to be let in: a studio leader approves the request on My Studio → Team, or a leader or owner sets up a profile for the person ahead of time. The database is meant to hold that line even if someone skips the app.

It didn't, quite. The database has a rule that lets a signed-in person create **their own** trainer profile — it has to exist, because of the two cases below. That rule only checked one thing: that you didn't make yourself an administrator. It never checked **which studios** you gave yourself. So anyone with a Google account who knew how to send a hand-made request (not through the app — the app never does this) could create a profile saying "I'm a trainer at Solon" and read Solon's clients, or "I'm the studio owner at Westlake".

## The two things that legitimately use that rule

1. **Claiming a profile someone set up for you.** A leader adds "Jane Smith, jane@…, Strongsville" before Jane has ever signed in. The first time Jane signs in, the app copies that profile onto her own sign-in and marks the old one as replaced. Her studios and role come from what the leader set up, not from her.
2. **AJ's own first sign-in** (jurgensaj@gmail.com), which makes the System Admin profile when there is none.

## What changes

A person creating their own profile now has to be one of those two cases — nothing else:

- **The claim** must name the profile it is copied from (the app already writes this, `claimedFromId`). The database then looks that profile up and checks: it is still waiting to be claimed, nobody has claimed it yet, its email is the email you signed in with, and the new profile is **the same profile** — same studios, same role, same everything — with only the claim's own bookkeeping added (when it was claimed, from where, by which sign-in).
- **AJ's own bootstrap** is unchanged.
- **Everyone else is refused.** That includes a profile with "no studios": any trainer profile at all is enough to be treated as a trainer by parts of the database (writing sessions, Demo Mode), and the app has no screen that makes one, so there is nothing to keep it for.

The approval path is untouched: when a leader approves a request, it's the **leader** who writes the profile, under a different rule that already limits what a leader may hand out.

## What you'd notice

Nothing, if the app is working as it does today. The tests prove a stranger is refused, a set-up profile is still claimed, and your bootstrap still works.

Two edge cases worth knowing:

- **A claim the app half-finished before** (new profile written, old one not yet marked replaced) is unaffected: the new profile already exists, so it isn't created again.
- **Someone whose sign-in carries no email** (possible with some Microsoft accounts) can't claim a set-up profile. They already couldn't save changes to it today for the same reason, so this isn't new; they'd go through Request Access instead.

## To ship it (AJ)

Measured on this branch on your PC: rules tests **289** passing (284 before: one test that asserted the old, open behaviour was replaced, six added), and both "stranger" tests fail against the old rule, so they prove the hole was real. Typecheck 2, unchanged. Your run is the one that counts. Then the usual order: `npm run test:rules` → `firebase deploy --only firestore:rules`. No index and no app change is needed; the app already sends everything the new rule checks.
