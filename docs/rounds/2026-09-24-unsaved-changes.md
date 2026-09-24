# Unsaved changes — the leave warning (Sep 24 2026)

Branch: `unsaved-changes-guard`. Not on `master` yet.

## The brief

AJ: *"At a minimum, we need to implement an 'unsaved changes' warning modal when navigating away. Ideally, we should look into caching the form state so the data actually persists when switching tabs, but let's implement the warning as an immediate fix."*

An app-wide code review found that typed work vanished with no warning in eight places:

- the client record's Save bar
- Programming → Setup's Quick-entry drafts
- the Edit Routine drawer closed by a tap outside it
- the whole progress report (it has no autosave)
- the post-session closing note (the bottom bar stays live on that screen)
- the studio machine editor
- the catalog editor
- My Studio → Studio's save bars

The review was checked before anything was built, and it was right. The app has no router: a screen disappears when a piece of state changes, and the profile's tabs are thrown away when hidden. Nothing asked first.

## What a trainer sees now

Leave a screen with something typed and not saved, by any route, and the app asks:

> **Unsaved changes**
> You have unsaved changes to *this progress report*. Leave without saving?
>
> [ Leave ]  [ **Keep editing** ]

- **Keep editing** is the default. It is the filled button and it has the focus, and Escape or a tap outside the box means the same thing. The trainer is back where they were, with every character still there.
- **Leave** throws the typing away and goes wherever the tap was going.
- The name in the sentence says what would be lost: "Sam's profile", "Routine A", "Sam's machine set-up", "the closing note", "the studio's day", "Leg Press".
- A trainer who has typed nothing never sees it. Saving is never blocked; this only ever stands between a trainer and a way out.
- A reload or a closed browser tab gets the browser's own "Leave site?" prompt, but only while something is typed.

**Every way out asks:** the bottom bar, the header (bell, gear, trainer menu, studio name, search), Switch Studio, Switch Trainer, Log Out, the Trainer · Operations · Admin switch, the profile's back arrow and Start Session, a change of client, the profile's four tabs, My Studio's four sections, Operations' tabs, its Floor views and its "this studio · all my studios" picker, the Admin dashboard's tabs, the studio list in All locations, the machine editors' Back, and closing the Edit Routine drawer (a tap outside, Escape, the X or Close).

**What does not ask:** "Back to Hub" on the post-session screen files the closing note, so it goes straight through. Moving between Routine A, Routine B, Equipment and Setup inside Programming never asks either, because Setup keeps its drafts while hidden.

## Two bugs it uncovered, fixed here

Both were worse than lost typing: typing could land on the **wrong record**.

1. **The client record carried a half-typed edit onto the next client.** The record's form deliberately keeps unsaved edits when the client's document refreshes, and it could not tell a refresh from a different client. If the profile moved to another client on the studio's roster, the first client's unsaved edit stayed in the form, and Save would have written it to the second client. The form now always starts fresh for a different client, and "Leave" discards the edit.
2. **All locations carried a studio's unsaved details onto the next studio picked.** The same pattern in the Admin dashboard: pick another studio with edits on the details form, and Save would have written them to the studio just picked. Picking another studio now asks first, and the form starts fresh.

## What is not done

- **Caching the form state** — AJ's "ideally", where typing survives a tab change instead of being warned about. This round is the immediate fix. The registry built here is where caching would plug in, because it already knows every screen that holds unsaved typing.
- **Screens not yet registered**, each a few lines the same way: the header's quick note, the consultation wizard, the announcement composer, Log past session and the session pop-up's edits, Relay's note editor and the Pulse panel. They are listed in `src/features/unsaved-changes/README.md`.
- **The Notes & Profile redesign** on `client-codex` was not touched. It keeps its pages mounted and has its own Save bar, so registering it is one line: `useUnsavedChanges(dirty, "Sam's profile", { onDiscard })`.

## Where it lives

`src/features/unsaved-changes/` — read its `README.md` before changing it. The bottom bar moved, unchanged, from `AppContent.tsx` into `src/components/AppBottomBar.tsx` so a test can mount the real one.

## Checks

- Typecheck: 10 errors, the baseline, unchanged.
- Tests: **3,726 passing in 248 files** (`TZ=America/New_York npx vitest run --dir src`), up from 3,696 in 246 before the round. The 30 new tests cover the gate itself, the real bottom bar, the profile's tabs, a drawer closed by Escape, and the post-session screen. Switching the gate off makes 14 of them fail, so they test the real thing.
- Build: `npx vite build` succeeds.
- The dialog was looked at in a browser at iPad size, portrait and landscape, light and dark, on a throwaway page. The real app sits behind the production sign-in, so nothing was clicked inside it.
- No Firestore rules, indexes, Cloud Functions or Mindbody code changed. Shipping is a push to `master` only.

## On the iPad, once it is live

1. Open a client → **Notes & Profile**, change a field and don't save. Tap **Journey**. The question names the client's profile. Tap **Keep editing**: the edit is still there. Tap Journey again and then **Leave**: the edit is gone.
2. **Programming → Setup → Quick entry**, type a value, then tap **Hub** on the bottom bar. It asks.
3. **Edit Routine**, move a machine, then tap outside the drawer. It asks, and **Keep editing** keeps the drawer open with the change.
4. Start a **progress report**, type a word, tap the back arrow. It asks. Save a draft, then go back: no question.
5. Finish a session, type a closing note, tap **Hub** on the bottom bar. It asks. Now tap **Back to Hub** instead: no question, and the note is filed.
6. **My Studio → Studio**, change the studio's day, tap **Relay**. It asks.
7. With nothing typed, walk around the app. It never asks.
