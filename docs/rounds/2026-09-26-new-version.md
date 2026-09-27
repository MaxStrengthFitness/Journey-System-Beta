# Picking up a new version, safely: Sep 26 2026

Branch `new-version`, cut from master and rebased onto `74bffb9`. Four phases, one commit each, each typechecked on its own. **No database, rules, index, Cloud Functions or Mindbody change.** It adds one small route to `server.ts` (`/version.json`). Shipping it is a push to `master`. The feature's own page is `src/features/new-version/README.md`.

This follows the Home Screen round (branch `ipad-home-screen`, "Left for later: Picking up a new deploy"). The two are independent and can ship in either order. When both are on master, the Home Screen README's line "There is no reload button. A new version arrives when the app is opened fresh" should become "A new version loads by itself on the Hub; elsewhere a line under the header offers it."

## The problem

Every push to `master` puts a new Journey on Render, and nothing in the app noticed.

- **An open app kept running the old version indefinitely.** Most of all a Home Screen app, which has no reload button and is resumed from memory for days.
- **The old version broke on the first screen it hadn't opened yet.** Journey fetches each screen (a profile, the calendar, My Studio, the Active Session, Pulse) the first time it opens it, from a file whose name is unique to that deploy. A deploy replaces every one of them. `server.ts` answers 404 for a missing one, and the whole app turned into "Something went wrong" until someone tapped Reload.
- **The worst case was mid-session.** Pulse loads inside the Active Session. If a deploy landed after the session started, opening Pulse replaced the whole Active Session with the error screen. The sets were safe (each is sent when entered), but the trainer lost the screen with the client standing there.

## AJ's decisions (Sep 26 2026, on the proposal)

1. **A new version loads by itself on the Hub only.** That means arriving at the Hub (including Back to Hub after a session), or Journey coming back on screen while it shows the Hub. Everywhere else, the line and Load now.
2. **A screen whose file is gone reloads by itself** when nothing is at risk, back to the same screen and client. Otherwise one sentence says why not.
3. **The Active Session and Pulse are fetched early,** in the background, once the app is up.
4. **Its own branch,** independent of the Home Screen work.

## What was built

| Phase | What |
| --- | --- |
| 1. The build's name | `vite.config.ts` names each production build (the time, plus the commit from `RENDER_GIT_COMMIT`), defines `__APP_BUILD__` and writes `version.json`. `server.ts` sends `/version.json` `no-store`, ahead of the static handler's one-hour cache. `main.tsx` sets `window.__appVersion`, so bug reports carry the version (it was declared and read, never set). |
| 2. The pure core | `verdict.ts` (`whenToLoad`: load now, or wait and why), `words.ts`, `reload-once.ts` (the loop guard and "where you were"), `chunk-error.ts`, `version-store.ts`. Sign-out forgets the remembered place and keeps the loop guard. |
| 3. Notice it, load it on the Hub, say so elsewhere | `useNewVersion` (mounted once by AppContent), `NewVersionLine` under the header, and `useUnsavedStatus()` in `unsaved-changes` (a read-only getter, so the new version asks the registry rather than guessing). |
| 4. A screen whose file is gone, Pulse, the warm-up | `LoadBoundary kind="screen"` around `<main>`'s screens (and inside the calendar's own error screen), and `kind="panel"` around Pulse in the Active Session. Also `main.tsx`'s `vite:preloadError` listener, `warm-up.ts`, Pulse's loader moved to `components/journal/load-check-in-panel.ts`, and `lazy-screens.test.ts`. |

**What a reload never interrupts** is the table in the README. In order: no fresh answer from the server, the Active Session, your own open session, saves still sending, typing, a note draft for the open session, and a reload already tried for this version in the last ten minutes. The one exception is the Active Session's own screen failing to load. Nothing is recording then, so the session checks don't hold that reload.

**Refinements made while building, beyond the proposal:**

- **The note-draft check is scoped to the session this iPad has open.** A draft orphaned by a take-over or an abandoned session would otherwise have held the new version off for good. A reload loses nothing: session storage survives a reload of the same app, and sign-out already keeps drafts.
- **Automatic moments wait up to four seconds for saves to land** before calling them "still sending". Back to Hub after a session has just written the session and its note, and without the wait the Hub would nearly always have said "sending" and not loaded.
- **A screen that fails while the server still has this build** is the connection, not a deploy. It says "This screen couldn't be loaded. The iPad may be offline." with Try again. React remembers a failed screen until the page reloads, so such a page is marked as wanting a reload, which the Hub gives it.
- **On the Hub itself the line promises no moment.** When something held the load there (typing, no answer), it says "A new version of Journey is ready." with Load now.
- **A broken screen waiting for the trainer's session asks again when the session closes** (finished on another iPad, say), rather than keeping a sentence that's no longer true.
- **The line's button is 44px**, like the other one-handed buttons on the floor (Take over, the watch line). The proposal said 48px. The broken-screen buttons are 48px, like `NothingOnScreen`'s.

## How it was checked

- **Typecheck:** 4, the baseline, on master and on each of the four phase commits on its own.
- **Tests:** 5,860 passing in 374 files with `TZ=America/New_York npx vitest run --dir src` in the worktree on AJ's PC. That is 99 new tests in 10 new files, so master at `74bffb9` is 5,761 in 364 (worked out, not measured on its own). There are render tests for the hook (every moment above), the line and the boundary (a real `React.lazy` whose file won't load).
- **Build:** `npx vite build` writes `version.json` beside the app, and the name is stamped into the entry chunk.
- **A rehearsal in a real browser.** A throwaway harness (the git-ignored `harness/new-version/`) mounted the real hook, line, boundary and store. It was built twice as two "deploys" with the real `vite.config.ts` and served by a copy of `server.ts`'s production static handlers, in order; a deploy was switching which build that server sent. Vite's own preload wrapper was confirmed around the lazy import, so `vite:preloadError` fires as it will in the app. What it showed:
  1. **A stale screen, nothing at risk:** on build A, after B was deployed, opening Profile reloaded into build B and landed back on Profile, drawn by B's file.
  2. **A stale screen with the trainer's session open:** no reload. Only the screen was replaced ("…which will load after your session with Sam"), the header kept working, and the line named the session.
  3. **The session closes, then to the Hub:** it loaded build B by itself on the Hub.
  4. **Coming back on the Hub:** after a rollback to A, firing `visibilitychange` on the Hub loaded A.
  5. **Typing:** on the Hub with unsaved typing it did not reload, and the line offered Load now. Load now from Profile asked "You have unsaved changes to the harness note. Leave without saving?", and Leave loaded the new build back on Profile with no browser prompt.
- **Not checked on a device, and not with the real app signed in.** The harness proves the mechanism (the browser, Vite's wrapper, the server's caching), not every screen of Journey.

## On a studio iPad, at the next real deploy

Added to `docs/ops/TESTING-CHECKLIST.md` as Round 21 (renumbered when it met the voice review's Round 20): an iPad left on the Hub over a deploy, a profile left open over one, a session running over one, and Pulse opened mid-session after one.

## Left for later

- **The Home Screen README line** above, once both branches are on master.
- **The calendar's own error screen** ("Schedule Unavailable", with a raw Reload) still exists for other errors. A missing file no longer reaches it.
- **The whole-app error screen's Reload** is unchanged. It still reloads even offline, which on a Home Screen app is a blank screen. It is only reached now by errors that aren't a missing file.
