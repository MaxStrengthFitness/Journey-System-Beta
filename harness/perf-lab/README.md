# The perf lab: Journey on a slow iPad, measured the same way every time

AJ, Oct 5 2026: "we really need our app to run fast on devices like ipads even 10th generation ipads and ipad minis". This folder is a repeatable lab that runs the real app, built the real way, against a big seeded studio, in headless Chrome slowed down to iPad classes, through the scenarios a trainer and a leader actually live in, and writes down what each one cost. Run it before and after a speed change and compare.

It never touches production: only local Firebase emulators under the project `demo-perf-lab` (Firebase treats `demo-*` projects as emulator-only), and an app build that can reach nothing else.

## One command

```powershell
node harness/perf-lab/lab.mjs all
```

That builds the lab app, starts the emulators, seeds the studio and exports it, then runs every profile and scenario three times, each rep on emulators started fresh from that export (about 13 s), and writes the report. About 40 minutes on AJ's PC. Results go to `%TEMP%\journey-perf-lab\<run-id>\` (`report.md`, `results.json`, `summary.json`, a screenshot per run and per failure), or to `--out <folder>` / `PERF_LAB_OUT`.

Shorter runs:

```powershell
node harness/perf-lab/lab.mjs all --profiles ipad10-portrait --reps 1 --idleMs 10000
node harness/perf-lab/lab.mjs all --profiles old-ipad-landscape --scenarios cold,warm,session
node harness/perf-lab/lab.mjs all --skip-build          # reuse the last lab build
```

The pieces on their own: `lab.mjs emulators` (start and wait; from the seeded export when there is one, `--empty` for none), `lab.mjs seed` (seeds the running emulators and exports), `lab.mjs build`, `lab.mjs run` (needs the build and the export, same `--out`). To look at the seeded studio yourself: `lab.mjs emulators`, then serve the lab build (`<out>/lab-build`) with any static server on 127.0.0.1 and sign in from the browser console with `__perfLab.signIn(email, password)` and the values in `lab.config.example.json`.

Needs: Node 22+ (the driver uses Node's own WebSocket), Java (for the Firestore emulator), Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` (or `PERF_LAB_CHROME`), and the repo's `node_modules`. Nothing to install.

## What is in here

| File | What it does |
| --- | --- |
| `firebase.lab.json` | The emulators: Firestore on 8085, Auth on 9099, hub 4410, logging 4510, websocket 9160 (so the rules tests on 8080 can run beside it), UI off, single project. Firestore uses the repo's own `firestore.rules`, copied into the git-ignored `.work/` because the CLI refuses a rules file outside the config's folder, on the named database `perf-lab` (the app uses a named database too). |
| `lab-config.mjs` | The fixed values (ports, project, database, studio id, where output goes) and the guard every script calls: refuse unless `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` are on 127.0.0.1, the project is `demo-*` and no `GOOGLE_APPLICATION_CREDENTIALS` is set. |
| `lab.config.example.json` | The lab user's sign-in, generated for the lab. It works on the local Auth emulator and nowhere else. A `lab.config.json` beside it (git-ignored) wins. |
| `seed.ts` | One big studio (below). Deterministic: a seeded random generator, so two runs on the same day lay down the same studio. Uses only pure modules from `src/` (the machine definitions, `rollupFromHistory`), never `src/firebase.ts`. |
| `run.mjs` | The driver. Chrome over the DevTools Protocol, a static server cached like production, the profiles, the scenarios, the measurements. |
| `cdp.mjs` / `server.mjs` | Chrome and its protocol; the static server (`/assets/*` immutable, `index.html` no-cache, `/api/*` answered 204/404). |
| `profile.mjs` | A CPU profile folded into self time per source file and per function, through the build's source maps (a small VLQ decoder, no package). |
| `report.mjs` | Medians and `report.md`. |
| `lab.mjs` | The one command. |

### The app's side (`src/perf-lab-hook.ts`)

A build made with `VITE_PERF_LAB=1` connects Firestore and Auth to the emulators (127.0.0.1:8085 and :9099) under a `demo-*` project, and gives the driver `window.__perfLab.signIn(email, password)` (the real sign-in is a Google or Microsoft popup a headless browser can't complete) and `window.__perfLab.waitForWrites()`. `src/firebase.ts` reaches it only behind the literal `import.meta.env.VITE_PERF_LAB === "1"`, which Vite replaces at build time, so every other build drops the branch, the hook and the emulator imports. `src/perf-lab-hook.test.ts` holds that, and a build without the flag was checked for `connectFirestoreEmulator`, `__perfLab`, `127.0.0.1:8085` and `demo-perf-lab` (none). The hook also refuses any project that isn't `demo-*`.

**The lab build is always `NODE_ENV=production`.** A shell with `NODE_ENV=test` (Claude's shell on AJ's PC has it) makes `vite build` ship React's development runtime (`jsxDEV`), which was 2 to 4 times slower in the first trial and nothing like what an iPad runs. `lab.mjs build` sets it; if you build by hand, set it too.

## The seeded studio

Lakeside (`lab-studio-lakeside`), America/New_York, a Journey cutover 400 days back, Mindbody `offline` (nothing calls `/api`, and no sync runs). About 56,000 documents in two minutes:

- 6 trainers. The lab user, Lena Labrador, is a Studio Leader (`trainers/lab-leader-uid`, role claim `StudioLeader` on the Auth emulator account) so Operations opens; the other five are placeholders, as an admin-made trainer is before first sign-in. Each has an agreed standing week.
- The twenty machines (`machines/*`) and the studio's floor (`studios/{s}/roster`).
- 300 clients: packages, rollups, last-set metrics, routines A and B, machine settings. About 45% have a confirmed history before Journey (`priorHistory`, about a third of those 300 to 720 sessions), 17% have none confirmed, the rest started on Journey.
- 8 weeks of bookings (5 back, this week, 2 ahead): about 1.6 a client a week, Sundays closed, today and tomorrow fully booked (6 trainers x 22 half-hours, 7:00 to 17:30).
- About 3 months of sessions from the past bookings (and the weeks before them), about 6,000, with their exercise logs for the last 4 weeks (about 12,000; every client's last eight or so sessions, which the grids draw first). The rollups, last-set metrics and session numbers come from all three months. 3% of past bookings are left unlogged, a third of those marked late cancels (`bookingMarks`). Why only 4 weeks of logs: the emulator's write time grows with a collection's size (one exerciseLogs write took 4.3 s with 39,000 logs, rules or no rules, and 30 ms with 12,000), which made every set and Finish wait on the emulator instead of the app. `PERF_LAB_LOG_WEEKS=13` writes all of them.
- About 600 notes (`journalEntries`), 14 of them Critical on today's or tomorrow's clients; about 250 FORD details; 5 announcements; 25 notifications in the lab user's bell.

`PERF_LAB_CLIENTS` and `PERF_LAB_MAX_LOGS` change the size (`--clients` on `lab.mjs`).

Not seeded: the nightly jobs' documents (`clientStates`, `watch/*`), so Operations says there is no nightly record yet; InBody, Relay's board and tasks, floor notes, cases, FileMaker imports.

## Profiles

| Profile | Viewport | CPU | Stands for |
| --- | --- | --- | --- |
| `ipad10-portrait` | 820 x 1180 @2x | 3x slower | iPad 10th gen (A14) |
| `ipadmini-portrait` | 744 x 1133 @2x | 3x | iPad mini 6 (A15) |
| `old-ipad-landscape` | 1180 x 820 @2x | 5x | iPad 8th/9th gen (A12/A13, 3 GB) |
| `desktop` | 1440 x 900 @1x | 1x | the reference |

The multipliers are Speedometer-3-class estimates against a fast desktop. Every profile adds 60 ms of latency at 20 Mbps down / 10 up (gym Wi-Fi to us-west1 from Ohio); `--latency 0` turns that off, which is how to tell the app's own waits from the network's (on desktop the cold open went from about 6.2 s to 3.0 s without it: the open is a chain of round trips). The iPad profiles turn on touch (5 points) and send iPad Safari's desktop-class user agent, so the app takes its iPad paths (the sign-in helper loads early, as on an iPad).

## Scenarios (each timed, three times, medians)

| | What | Timed to |
| --- | --- | --- |
| a `cold` | Empty profile: load, sign in, the studio greeting, Start | `journey:hub-data` (the app's own boot mark) and the Hub's cards drawn, from navigation; plus the sign-in screen, the greeting and the other boot marks |
| b `warm` | Reload with the HTTP cache and the Firestore cache kept | the same, from navigation |
| c `idle` | The Hub left open 70 s, so a minute tick falls inside | long tasks only |
| d `client` | A card on today's Hub, the peek, Open profile | the Journey tab's grid rows, from the tap |
| e `session` | The first card on tomorrow's Hub (the same client every rep, since every rep starts from the same data), Start session, the briefing's Start, 5 sets typed and Next, the machine menu opened and closed, Finish, Finish session | the Wrap-up, from the card tap; plus each step and the database's answer |
| f `ops` | The trainer menu, Open Operations, Today; back to the Hub, the Client tab, "Pat" typed in the search | Today drawn and settled (no "Reading..." left), the Directory drawn and settled, results after the last key |
| g `scroll` | The Hub's grid and the Directory scrolled down and up by script, 36 px a frame | frames the main thread missed |

Collected per scenario: the wall time, long tasks (count, total, worst; a PerformanceObserver installed before the app runs), the slowest interaction (event timing, INP-like), Performance.getMetrics deltas (script, layout, style, task, layout and style counts) and the JS heap, the DOM size, uncaught exceptions, and a CPU profile folded to the top 15 source files and functions. Taps are real input events (the browser treats them as trusted), so event timing sees them.

## Reading the numbers

Compare runs of the same lab on the same PC, before and after a change, with nothing else heavy running (the first smoke run shared the PC with another worktree's tests and its numbers swung by 2x between reps; on a quiet PC three reps agree within a few percent).

What is the emulator's, not the app's: **the session's Finish to Wrap-up (about 5 s on every profile, desktop included, with no long tasks) and the database's answer (about 7 s)**. That 5 s is the app's two Finish waits running out (`FINISHED_ELSEWHERE_WAIT_MS` 2 s for the "finished on another iPad" read, then `FINISH_WAIT_MS` 3 s for the commit; `features/session-record/finish-wait.ts`) because the emulator answers slowly while the app's listeners are open; with the network latency off it is the same. On a real iPad these waits matter only if Firestore is slower than 2 s and 3 s, so read `finishToWrapUpMs` as "the timeouts fired", and judge the Finish on the script and long-task columns. The absolute numbers are Chrome's, not Safari's (see the report's last section). A scenario that failed is listed under its table with the reason and a screenshot (`fail-<profile>-<rep>-<scenario>.png`); a failure in `cold` or `warm` skips the rest of that rep.

## Traps found building it

- **The emulator wedges if it is reused.** Closing Chrome while a write is on its way once left the Firestore emulator holding locks: every later write whose rules read the same trainer document hung, and a REST commit got "Transaction lock timeout". In the first full smoke run (one emulator for all twelve reps) the cold open got slower rep by rep and four of twelve timed out at "Opening your studios". Hence fresh emulators from the export for every rep, and the driver waits for `waitForWrites()` before closing Chrome.
- **The CLI's export skips a named database.** `firebase emulators:export` writes only `(default)`; the lab's data is in `perf-lab`. `lab.mjs` asks the emulator's own endpoint (`POST /emulator/v1/projects/demo-perf-lab:export` with the database named) and an `--import` restores it into `perf-lab`.
- **`NODE_ENV`**, above.
- **`/harness/` is git-ignored** (and in `.git/info/exclude` on AJ's PC); `.gitignore` lets `harness/perf-lab/` through, and on AJ's PC its files are added with `git add -f`.
