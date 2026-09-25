# Sign-out — the next person on this iPad starts fresh

Sign-out round, Sep 24 2026. The app review found that signing out left the
last person's screen, app mode, selected client and studio in place. On a
shared studio iPad the next person to sign in landed exactly where the last
one had been: their client open, and Operations still showing to a Life
Transformer who could never have opened it.

**The rule: a sign-out is a fresh load for the next person.** Two things are
kept, because they belong to the iPad or to the session rather than to the
person:

| Kept | Why |
| --- | --- |
| The studio this iPad is pinned to (`lib/default-studio.ts`) | A tablet on one studio's floor should open that studio for the next trainer. It is re-checked against their access before it is used, so keeping it grants nothing. |
| A note started mid-session and not saved (`client-notes/session-draft.ts`) | It belongs to the session, and nothing a trainer wrote about a client may be lost by the app. |

Everything else goes, in four places:

1. **React state** - `App.tsx` keys the whole signed-in tree on
   `personKey(user, trainer)`, so a sign-out unmounts every screen, mode,
   selection and the in-memory active studio, and the next person mounts
   fresh. A key rather than a list of setters, so state added later is covered
   without anyone remembering to add it here.
2. **Local storage** - `clearPersonalStorage` keeps `DEVICE_KEYS` (the pin)
   and clears the rest.
3. **Session storage** - `clearSessionHandoffs` removes the one-shot handoffs
   (`SESSION_HANDOFF_PREFIXES`: where a client's profile should open, machine
   fit's Setup hint) and leaves note drafts alone.
4. **Module memory** - `memory.ts`. A module that keeps a memory in module
   scope (the Planner's tab, My Studio's section, the Operations span, a
   waiting Planner request, the Catalog scope, Relay's "Not me") registers its
   reset with `forgetOnSignOut` beside the variable. `memory.ts` imports
   nothing, so any module can use it without growing the main bundle.

`endPersonalSession` does 2-4 in one call. It runs from the menu's
`handleLogout` and, through `personChanged`, from the auth listener - so a
sign-out that did not come through the menu (another tab, an outside
Microsoft account turned away) forgets too.

**Adding a module-level memory?** If it is about what a person was doing, it
registers a reset here. If it is keyed by the signed-in uid (Relay's note
draft stash, the reminder bell) or is a cache of a studio's data, it does not
need to.

**Why the key waits for the trainer profile.** The Firebase user arrives a
beat before the profile, and a Microsoft account from outside the company is
signed in and straight back out by the sign-in screen, which then says why.
Keying on the bare uid would remount the sign-in screen between the two and
lose that sentence.
