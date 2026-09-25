# Unsaved changes — the leave warning

AJ, Sep 24 2026: *"At a minimum, we need to implement an 'unsaved changes' warning modal when navigating away. Ideally, we should look into caching the form state so the data actually persists when switching tabs, but let's implement the warning as an immediate fix."*

This folder is the warning. Caching the form state is the later step and is not built. The round document is `docs/rounds/2026-09-24-unsaved-changes.md`.

## Why typing vanished

There is no router. A screen leaves the tree because a piece of state changed: `currentView` in AppContent, the profile's tab, My Studio's section, an Operations tab, a drawer's `open`. When it leaves, its `useState` goes with it. The profile's tabs are Base UI `Tabs.Panel`s, which unmount when hidden (`keepMounted` defaults to false). Nothing asked first.

## The pieces

| File | What it is |
| --- | --- |
| `registry.ts` | **Pure.** The registry (who holds unsaved typing, with a label and the scopes it sits in) and the gate (a navigation is run at once, or held while the question is asked). `leaveQuestion()` words it. Tested in `registry.test.ts`. |
| `UnsavedChanges.tsx` | The provider (mounted once in `App.tsx`), `useUnsavedChanges`, `useLeaveGuard`, `useLeaveScope` + `<UnsavedChangesScope>`, and `beforeunload`. |
| `LeaveConfirmDialog.tsx` | The question. In-app, never `confirm()`. "Keep editing" has the focus and is the filled button; Escape and a tap on the scrim mean it too; buttons are 48px. |
| `useGuardedState.ts` | A piece of state whose every *change* asks first. AppContent's `selectedClientId` is built on it. `useGuardedSetter` is the same guard over state someone else owns: AppContent's screen lives in `admin/useGuardedPlace` (held to who may open Operations, sign-out round) and every button sets it through `useGuardedSetter`, while the route gate's own refusal writes the raw setter and never asks. |

## How a screen takes part

**A screen that holds typing registers. That is usually all it does:**

```ts
useUnsavedChanges(isDirty, "this progress report", { onDiscard });
```

- `label` finishes the sentence *"You have unsaved changes to …"*, so it is a noun phrase: "Sam's profile", "Routine A", "the studio's day".
- `onDiscard` throws the typing away. **Give it whenever the screen can survive a navigation.** The client record stays mounted when the client changes. Without a discard, "Leave" would carry one client's half-typed edit onto the next client.
- The hook returns `guard(proceed)`, which asks about this screen only (a drawer's own close, an editor's own Back). It also returns `release()`, for a button that saves *and* leaves in one tap (the post-session screen files its note on the way out).
- Every form built on `admin/useDirtyForm` is registered automatically. Pass `{ label }` as its third argument. `form.leave.guard(onBack)` covers the screen's own Back.

**A component that switches between its children uses a scope:**

```tsx
const scope = useLeaveScope();
…onClick={() => next !== current && scope.guard(() => setCurrent(next))}
<UnsavedChangesScope scope={scope}>{children}</UnsavedChangesScope>
```

Only typing inside the scope is asked about, because only that is about to unmount. A child the switch keeps MOUNTED is taken back out with `<ExemptFromLeaveScope scope={scope}>`: the client codex (Notes & Profile) stays mounted after its first visit and its edits survive a tab change, so the profile's tab bar does not ask about it, while the app's own navigation still does. The profile's tabs, My Studio's sections, Operations' tabs and Floor views, the Admin dashboard's tabs, and the studio list in All locations each have one. `useProfileNav` takes the profile's scope as its `guard` option, and asks only when the **tab** changes. A move within a tab never asks, because Setup (the one segment holding drafts) is kept mounted when hidden. Every move goes through it, `openRecord` included: that is the codex's own page switch (never a tab change, so it never asks) and the jump into Notes & Profile from another tab (the quick note's FORD door, the Deep Dive's Edit medical), which asks about the tab it leaves. It dispatched straight through until the landing (Sep 24), so a jump from Programming dropped Setup's drafts without a word.

**The app's own navigation asks about everything.** AppContent's screen and client are guarded state. The studio switch, sign-out, Switch Trainer, the app-mode switch, new-client onboarding, the bell's links, opening a filed report and typing in the header search go through `useLeaveGuard`. Operations' studio picker does too (`scope-context.tsx`).

## Rules

- **Never block a save.** The gate only ever stands between a trainer and a navigation that would lose typing, and "Leave" is always one tap.
- **Setting a value to what it already is never asks.** Neither does a navigation while nothing is dirty. A trainer who has typed nothing never sees the question.
- **One tap, one question.** A tap that changes the client *and* the screen (the profile's back arrow) holds both moves and asks once. "Leave" runs both, in order. A navigation made *while* "Leave" is running never asks again.
- **Set nothing before the answer.** Anything a navigation sets alongside the screen change goes inside the guarded move: a Learning jump, a Relay intent, a filed report's selection, the intro-session flag, the search term. Set first and then refused, it would fire on the next visit.
- **The question sits on top of an open drawer.** It is rendered into `<body>` after the drawer, at `z-[400]`. Base UI ignores a press on an element injected after a modal opened, so "Keep editing" is not read as a tap outside the drawer. An Escape inside the question is stopped there, or the drawer would read it as its own close.
- **Without a provider every hook proceeds at once**, so a component mounted alone in an older render test behaves as it did.

## What is registered (Sep 24 2026)

The client record's Save bar (`ClientInfoSheet` when the round was written; since the landing merge, the client codex's one Save bar, registered in `client-codex/ClientCodex.tsx`) · Programming → Setup's drafts, Quick entry included (`SetupView`) · the Edit Routine drawer (`EditRoutineDrawer`) · the progress report (`ClientProgressReportView`) · the post-session closing note and an unfinished mid-session note (`VictoryHUDScreen`) · every `useDirtyForm` form: the studio and catalog machine editors, My Studio → Studio's details, day and renewal settings, the InBody variation (named since the landing; it asked about "this page" before), and All locations' studio details.

**Not yet registered**, and worth doing next the same way: the header's quick note (`QuickNoteDialog`), the consultation wizard, the announcement composer, Log past session and the session pop-up's edits (`client-history`), Relay's note editor, the Pulse panel, and two on the client codex: the Notes page's composer (`JournalComposer`, mounted by `client-notes/NotesPage.tsx`; the old journal composer was not registered either) and FORD's In one line editor (`ford/page/OneLinePanel.tsx`, which the Overview's "Write one" opens). The composer is shared with the session sheet, so register it from the host, e.g. `useUnsavedChanges(text !== "", "the note about <name>")`.

## Tests

- `registry.test.ts`: the gate itself.
- `guard.render.test.tsx`: the real `AppBottomBar`, the real `useProfileNav` with a scope, and a real Base UI dialog closed by Escape.
- `components/VictoryHUDScreen.render.test.tsx`: the post-session screen asks before the bottom bar leaves with a typed note, and "Back to Hub" files it without asking.
