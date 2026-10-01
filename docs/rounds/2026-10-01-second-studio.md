# A second studio, and taking someone off a studio's team

*Oct 1 2026. Branch `oct1/second-studio` on origin/master's `a6c58935`.
Nothing pushed, nothing deployed, no production data written.*

## The gap

A trainer can work at more than their home studio: **also works at**
(`accessibleStudioIds`, a floater) and **a guest** (`activeGuestStudioIds`)
on `trainers/{id}`. `src/lib/who-works-here.ts`, every Team list and the
rules' `trainerWorksAt` all read them. But once an account existed no screen
could set either list: the Sep 24 cross-train work left the trainer-side
lists with no working editor (`EditTrainerModal`'s admin mode is never
mounted), the studio picker's Request Access from an existing account was
"not built", and nothing took a person off a studio's team. The Oct 1 scale
re-read found the same.

## Where it lives, and why there

**Admins → Studios → a studio → Team → Studios**, a button on each person's
row beside **Change role**. It opens one dialog, *Where {name} works*:

- **Home studio: Solon.** Said, never changed here.
- **Also works at**: each studio besides home, "also works there" or "a
  guest", with **Remove**.
- **Add a studio**: a picker of every real studio not already theirs, by
  name. Demo Mode is never offered (the realm rule).
- **Take off {this studio}'s team** when this studio is one they also work
  at. When it is their home studio, instead: "Westlake is Glorfindel's home
  studio, so it can't be taken away here: everyone has one. Give them another
  home studio first on Operations → Setup → People & access, then take
  Westlake off here."
- What will happen, in sentences, before **Save studios**; Cancel writes
  nothing. The edits register with the leave warning while unsaved.

Why the Admins dashboard and not Operations → Setup → People & access:

1. **Change role already lives there**, on the same row, with the same dialog
   pattern — one place an administrator manages a person.
2. **The Activity record takes administrators' entries only** (the rules'
   `activity` create: `isSuperAdmin()`). Every change here is logged; from
   Operations a franchise owner's line would be refused silently.
3. **The rules already allow it** for administrators (`trainerUpdateAllowed`:
   `roleIsSuper`), so the picker can honestly offer every studio — "studios
   the editor may manage" is all of them.
4. People & access is shared with My Studio → Team (`StaffEditor`), where a
   studio's leaders work; the rules let a leader write the lists only of
   people whose **home** studio they run, so a leader there could add any
   studio but couldn't take a visitor off their own. That needs a decision
   (below), not a second editor.

## What a save writes

`src/features/admins/studios/studio-membership.ts` is the pure half:

- **Add** a studio: into `accessibleStudioIds` only.
- **Remove** a studio (and Take off this studio's team, which is the same
  act): out of `accessibleStudioIds`, out of `activeGuestStudioIds`, and out
  of `managedStudioIds` — helping run a studio you no longer work at would
  leave the door open behind you.
- **Never touched**: `primaryHomeStudioId` and the home studio's own entry in
  `accessibleStudioIds`, `ownedStudioIds` (an owner isn't on the floor's
  team), the role, the trainer document itself, and everything they did —
  sessions, notes, standing weeks stay where they are.
- **Only the lists that change** are in the update (the admin README: only the
  diff): `arrayUnion` for a list that only gains, `arrayRemove` for one that
  only loses, the whole list only when one list does both in one save. No
  `undefined` can reach the write (every value is a list).
- Then **one Activity line per studio changed, at that studio**, kind
  `assisted-change`, so that studio's leaders read it on My Studio → Studio →
  Activity: "Added Beregond to Willoughby's team: also works there." / "Took
  Beregond off Westlake's team.", with *Also works at* before and after. The
  line goes after the write has landed.

**Claims.** `syncTrainerClaims` mirrors only `role` onto the token
(`functions/src/claims-logic.ts`); the studio lists are read by the rules
from the trainer document on every request. So the rules see the change at
once and no claim needs refreshing. The person's own iPad reads its trainer
document at sign-in, so their studio picker shows the change the next time
they sign in or Journey reloads; the dialog says so.

## Rules

**No rules change.** One rules test was added to pin what the control relies
on ("lets an administrator give a trainer a second studio and take them off
it, and nobody else at that studio"): a trainer can't add themselves, another
studio's leader can't add or remove them, an administrator can, with
`arrayUnion` / `arrayRemove`, and the home studio stays. **261** rules tests
passing (260 before), `npm run test:rules` on AJ's PC with JDK 21; the
emulator on 8080 was stopped afterwards.

## Measured

- `npx tsc --noEmit`: **4** errors, the baseline.
- `TZ=America/New_York npx vitest run --dir src`: **8,270** passing in **592**
  files (8,256 in 590 before; 14 new: 9 pure in `studio-membership.test.ts`,
  5 mounted in `StudiosDialog.render.test.tsx`), in the worktree on AJ's PC.
- `npx vite build`: clean.

## Also changed

- `StaffEditor`'s notice on a studio-access request (someone with an account
  asking for another studio) now says where it is done: "an administrator
  adds the studio on Admins → Studios → {home} → Team → Studios", instead of
  "isn't built yet".

## Left for AJ

1. **Should a studio's own leaders take a visiting trainer off their team?**
   Today the rules let only administrators, franchise owners and the leaders
   of the person's *home* studio write the lists. Saying yes is a rules
   change (a leader may remove *their own* studio from someone's
   `accessibleStudioIds` / `activeGuestStudioIds` / `managedStudioIds`) and a
   button on My Studio → Team.
2. **Should franchise owners get this on Operations → People & access?** The
   rules already let them; the Activity record doesn't take their entries.
3. **Approving a studio-access request** could become one tap that adds the
   asked-for studio, now the write exists.
