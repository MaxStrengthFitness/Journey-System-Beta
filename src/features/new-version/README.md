# A new version, picked up safely

Every deploy puts a new Journey on Render (since Oct 6 2026 a push to `master` deploys nothing by itself: AJ presses Manual Deploy on the web service). This folder is how an open Journey notices, and how it loads the new version without interrupting anything on the floor. The round is `docs/rounds/2026-09-26-new-version.md`.

## Why it is needed

Journey fetches each screen the first time it is opened (a profile, the calendar, My Studio, the Active Session, Pulse). Each screen is a file whose name is unique to its deploy, and a deploy replaces every one of them. An app that doesn't notice keeps running the old version. The first time it opens a screen it hasn't opened yet, it asks for a file that is gone.

Before this, that ended on the whole-app "Something went wrong" screen, whose Reload was the only way out. A Home Screen app has no reload button, and resumed from memory it could run the old version for days. Pulse loads inside the Active Session, so after a deploy, opening Pulse took the whole session's screen with it.

There is no service worker, on purpose: a caching service worker is the usual way to pin a device to old code.

## What it does

1. **Every build carries a name.** `vite.config.ts` names each production build: the time it was made, plus the commit when Render says which. It writes the name into the app (`__APP_BUILD__`, read by `build.ts`) and beside it as `version.json`. `serveBuiltApp` in `server/served-files.ts` (which `server.ts` mounts in production) sends that file `no-store`, ahead of the static handler that would cache it for an hour. `window.__appVersion` carries the name, so bug reports say which version broke.

2. **It looks for a new version when Journey comes back on screen.** That covers the iPad being unlocked, the app being brought back from the app switcher, a page restored from the back-forward cache, the connection returning, arriving at the Hub, and a screen whose file couldn't be loaded.
   - There is no timer.
   - Each look is one request for a few dozen bytes to our own server, with no Firestore read and no Mindbody call.
   - Coming back several times within a minute looks once.

3. **It loads by itself only on the Hub** (AJ, Sep 26 2026): when a trainer arrives there, or when Journey comes back on screen showing it. A reload lands on the Hub anyway, and every session starts and ends there. Nothing reloads from a timer while someone is reading a screen.

4. **Everywhere else, one quiet line under the header** (`NewVersionLine`) says a new version is ready.
   - It offers Load now where pressing it can work. Otherwise it names what it is waiting for: your session with a named client, or saves still sending.
   - It never appears on the Active Session.
   - It is never red, a pop-up or a sound, and nothing reaches outside the app.

5. **A screen whose file is gone replaces only itself** (`LoadBoundary kind="screen"`). The header and the bottom bar keep working.
   - When nothing is at risk, it loads the new version and puts the trainer back on the same screen and client.
   - Otherwise it says in one sentence why it is waiting.
   - When the server still has this build, the cause was the connection: "This screen couldn't be loaded. The iPad may be offline." with Try again.
   - When it was waiting for the trainer's session and the session closes (finished on another iPad, say), it asks again rather than keep a sentence that's no longer true.
   - Any other error goes on up to the error screen, as before.

6. **Pulse inside a session** (`LoadBoundary kind="panel"`) says, in the panel, that it will open after this session. It never reloads anything, and it marks the page as wanting a reload, which the Hub gives it after the session.

7. **The session's screens are fetched early** (`warm-up.ts`; AJ's call). Four seconds after the shell is up, the Active Session and Pulse are fetched once in the background. A screen fetched once stays in the page's memory whatever is deployed after it, so a deploy later in the day can't stop a session from opening. The files are cached for a year under their build's names, so this is one download per new version, not per open.

## What a reload never interrupts

`verdict.ts` is the one answer, and every reload asks it, with the facts read after every wait. The first reason to wait wins:

| Waits for | Why |
| --- | --- |
| A fresh answer from the server | A Home Screen app reloaded offline opens to a blank screen, with no browser around it to recover. |
| The Active Session | This covers the briefing, the post-session screen and watching another trainer's session. Never, whatever else is true. |
| Your own open session | Even while you've stepped out to a profile. It uses the same answer sign-out and the bottom tab give (`findMyLiveSession`). |
| Saves still sending | The check sign-out makes (`unsentWritesWaiting`). Automatic moments wait up to four seconds for them to land, so Back to Hub after a session usually loads straight away. |
| Typing | It asks the unsaved-changes registry (`useUnsavedStatus`), never guesses. Load now asks the app's own "Leave without saving?" instead. |
| A session note draft | Only one for the session this iPad has open (the device's remembered session). |
| A reload already tried for this version | Automatic reloads for the same target are ten minutes apart, so a Render mid-swap can't cause a loop. A person may always tap again. |

**One exception:** the Active Session's own screen failing to load. Nothing is recording on that iPad, because the screen never mounted. A reload is the only way the session can be recorded, and it comes straight back into it. So the session checks don't hold that reload. A save still sending does.

**Why a draft is safe anyway:** session note drafts live in the iPad's session storage, and a reload of the same app keeps session storage (a relaunch doesn't). The Active Session restores the draft when the session resumes. The draft check is the extra caution. It is scoped to the open session because a draft orphaned by a take-over or an abandoned session would otherwise hold the new version off forever, while the reload loses nothing.

## Where you were

Before any reload, `reload-once.ts` notes the screen and the client. Once the shell is back up, the same person is put back there, within two minutes. Only screens that stand on their own qualify (`RETURNABLE_VIEWS` in AppContent), and the route guard still applies. It is a one-shot handoff, so sign-out forgets it. The loop guard belongs to the iPad, so sign-out keeps it.

## The pieces

| File | What it is |
| --- | --- |
| `build.ts` | This build's name, the live one (null is "unknown", never "the same"), and whether it is new. |
| `version-store.ts` | What the server last said, shared asks, and "a screen of this page is broken". One store outside React, because main.tsx hears of a failed file first. |
| `verdict.ts` | `whenToLoad(moment, facts)`: load now, or wait and why. Pure. |
| `words.ts` | Every sentence. Pure. |
| `reload-once.ts` | The loop guard and "where you were". Pure apart from the storage it is handed. |
| `chunk-error.ts` | Telling a missing screen file from any other error. |
| `warm-up.ts` | Fetching the session's screens early. |
| `useNewVersion.ts` | The React half, mounted once by AppContent. |
| `NewVersionLine.tsx`, `LoadBoundary.tsx` | The line, and the boundary for screens and panels. |

## Rules for what comes next

- **A new lazy screen goes inside a LoadBoundary.** `lazy-screens.test.ts` lists every file that makes one, and fails on a new file until it is added with its boundary.
- **A lazy screen's own error screen goes outside the boundary**, as the calendar's does. Otherwise it catches a missing file first and offers a raw reload.
- **Never `preventDefault()` on `vite:preloadError`.** The error must reach React's boundary. Swallowing it makes React.lazy fail later with a confusing error of its own.
- **Never reload with `window.location.reload()` from a new screen.** Ask `useNewVersion` (or `whenToLoad`), so the floor's rules hold.
