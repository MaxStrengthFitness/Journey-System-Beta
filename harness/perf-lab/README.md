# The perf lab: Journey on a slow iPad, measured the same way every time

AJ, Oct 5 2026: "we really need our app to run fast on devices like ipads even 10th generation ipads and ipad minis". This folder is a repeatable lab that runs the real app, built the real way, against a big seeded studio, in headless Chrome slowed down to iPad classes, through the scenarios a trainer and a leader actually live in, and writes down what each one cost. Run it before and after a speed change and compare, or let it compare two builds for you (A/B below).

It never touches production: only local Firebase emulators under the project `demo-perf-lab` (Firebase treats `demo-*` projects as emulator-only), and an app build that can reach nothing else. Chrome is also told to refuse Google's hosts, and the lab's server takes the production preconnects out of `index.html`.

## One command

```powershell
node harness/perf-lab/lab.mjs all
```

That builds the lab app, starts the emulators, seeds the studio and exports it, then runs every profile and scenario: three timed reps, interleaved (rep 1 of every profile, then rep 2...), each on emulators started fresh from that export, plus one rep per profile with the CPU profiler, kept out of the medians. Results go to `%TEMP%\journey-perf-lab\<run-id>\` (`report.md`, `results.json`, `summary.json`, a screenshot per run and per failure), or to `--out <folder>` / `PERF_LAB_OUT`. About an hour on AJ's PC.

Shorter runs:

```powershell
node harness/perf-lab/lab.mjs all --profiles ipad10-portrait --reps 1 --idleMs 10000 --no-profile-rep
node harness/perf-lab/lab.mjs all --profiles old-ipad-landscape --scenarios relaunch,session
node harness/perf-lab/lab.mjs all --skip-build          # reuse the last lab build
node harness/perf-lab/lab.mjs calibrate                 # how fast this PC is against the reference
```

Any subset of scenarios works: a run without `cold` signs in first without timing it.

### Before against after (A/B)

```powershell
node harness/perf-lab/lab.mjs build --as before         # on the old code
# ...make the change...
node harness/perf-lab/lab.mjs build --as after
node harness/perf-lab/lab.mjs run --build-a before --build-b after
```

The two builds run against the same seeded export, alternating rep by rep (and which goes first), and the report adds a table of deltas, calling a change real only when it is bigger than both builds' spread. `--build-a` / `--build-b` also take a folder.

The pieces on their own: `lab.mjs emulators` (start and wait; from the seeded export when there is one, `--empty` for none), `lab.mjs seed` (seeds the running emulators and exports), `lab.mjs build`, `lab.mjs run` (needs the build; reseeds first when the seed is from an earlier studio day). To look at the seeded studio yourself: `lab.mjs emulators`, then serve the lab build (`<out>/lab-build`) with any static server on 127.0.0.1 and sign in from the browser console with `__perfLab.signIn(email, password)` and the values in `lab.config.example.json`.

Needs: Node 22+ (the driver uses Node's own WebSocket), Java (for the Firestore emulator), Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` (or `PERF_LAB_CHROME`), and the repo's `node_modules`. Nothing to install. Nothing may be listening on 8085 or 9099.

## What is in here

| File | What it does |
| --- | --- |
| `firebase.lab.json` | The emulators: Firestore on 8085, Auth on 9099, hub 4410, logging 4510, websocket 9160 (so the rules tests on 8080 can run beside it), UI off, single project. Firestore uses the repo's own `firestore.rules`, copied into the git-ignored `.work/` because the CLI refuses a rules file outside the config's folder, on the named database `perf-lab` (the app uses a named database too). |
| `lab-config.mjs` | The fixed values (ports, project, database, studio id, where output goes) and the guard every script calls: refuse unless `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` are on 127.0.0.1, the project is `demo-*` and no `GOOGLE_APPLICATION_CREDENTIALS` is set. |
| `lab.config.example.json` | The lab user's sign-in, generated for the lab. It works on the local Auth emulator and nowhere else. A `lab.config.json` beside it (git-ignored) wins. |
| `seed.ts` | One big studio (below). Deterministic, and its clock is held. Uses only pure modules from `src/` (the machine definitions, the rollups, the renewal engine and the nightly job's core), never `src/firebase.ts`. |
| `calibrate.mjs` | The slowdown, calibrated to the PC running the lab (below). |
| `run.mjs` | The driver. Chrome over the DevTools Protocol, the profiles, the scenarios, the measurements. |
| `cdp.mjs` / `server.mjs` | Chrome and its protocol; the static server (`/assets/*` immutable, `index.html` no-cache and without its production preconnects, `/api/*` answered 204/404). |
| `profile.mjs` | A CPU profile folded into self time per source file and per function, through the build's source maps (a small VLQ decoder, no package). |
| `report.mjs` | Medians with min and max, the headline, A/B deltas, `report.md`. |
| `lab.mjs` | The one command. |

### The app's side

`src/perf-lab-hook.ts`: a build made with `VITE_PERF_LAB=1` connects Firestore and Auth to the emulators (127.0.0.1:8085 and :9099) under a `demo-*` project, and gives the driver `window.__perfLab.signIn(email, password)` (the real sign-in is a Google or Microsoft popup a headless browser can't complete) and `window.__perfLab.waitForWrites()`. `src/firebase.ts` reaches it only behind the literal `import.meta.env.VITE_PERF_LAB === "1"`, which Vite replaces at build time, so every other build drops the branch, the hook and the emulator imports. `src/perf-lab-hook.test.ts` holds that, and a build without the flag was checked for `connectFirestoreEmulator`, `__perfLab`, `127.0.0.1:8085` and `demo-perf-lab` (none). The hook also refuses any project that isn't `demo-*`.

**A lab build can't ship.** `vite.config.ts` refuses `VITE_PERF_LAB=1` into `dist/` or on Render (`RENDER` set), and stamps a lab build with `PERF-LAB-BUILD.txt`; `server/served-files.ts` refuses to serve a folder carrying it, so a lab build deployed by mistake never starts and Render keeps the running version. `src/services/served-files.test.ts` holds both.

**The lab build is always `NODE_ENV=production`.** A shell with `NODE_ENV=test` (Claude's shell on AJ's PC has it) makes `vite build` ship React's development runtime (`jsxDEV`), 2 to 4 times slower and nothing like what an iPad runs. `lab.mjs build` sets it; if you build by hand, set it too.

## The seeded studio

Lakeside (`lab-studio-lakeside`), America/New_York, a Journey cutover 400 days back, Mindbody `offline` (nothing calls `/api`, and no sync runs). About 35,600 documents in about 80 seconds:

- **The clock is held.** The seed's "now" is 09:40 Eastern on the day it runs, whatever the wall clock says, and the driver holds every page's clock at that moment (a `Date` shim installed before the app runs, starting each rep at 09:40 and running normally from there). A run at 2 AM and a run at 3 PM see the same mid-morning Hub, and a run that crosses midnight stays on the seed's day. `seed-summary.json` records the day and the anchor; `lab.mjs run` reseeds when the Eastern day has moved on.
- 6 trainers. The lab user, Lena Labrador, is a Studio Leader (`trainers/lab-leader-uid`, role claim `StudioLeader` on the Auth emulator account) so Operations opens; the other five are placeholders, as an admin-made trainer is before first sign-in. Each has an agreed standing week.
- The twenty machines (`machines/*`) and the studio's floor (`studios/{s}/roster`).
- 300 clients: packages, rollups, last-set metrics, routines A and B, machine settings. About one in ten stopped coming (some 2 to 5 weeks ago, some past the lapse line), so Operations has people to find. About 45% have a confirmed history before Journey (`priorHistory`, about a third of those 300 to 720 sessions), 17% have none confirmed, the rest started on Journey.
- **Two focus clients**, the people the client and session scenarios open, found on the Hub by surname (no other client has it), so every rep and every profile opens the same person however the cards fall: Winifred Ashcombe (today 10:00) and Theodora Pemberton (tomorrow 09:00), both the lab user's, 600 sessions before Journey (confirmed), a year of twice-weekly Journey sessions (about 100) with every exercise log written (about 800 each), eight machines a session. The report prints their depth.
- 8 weeks of bookings (5 back, this week, 2 ahead): about 1.6 a client a week, Sundays closed, today and tomorrow fully booked (6 trainers x 22 half-hours, 7:00 to 17:30).
- 26 weeks of sessions (about 12,000), with exercise logs written for the last 4 weeks (about 12,000) and for the focus clients in full. The rollups, last-set metrics and session numbers come from every session. 3% of past bookings are left unlogged, a third of those (in the booking window) marked late cancels (`bookingMarks`). Why only 4 weeks of logs for everyone else: the emulator's write time grows with a collection's size (one exerciseLogs write took 4.3 s with 39,000 logs, rules or no rules, and 30 ms with 12,000), which made every set and Finish wait on the emulator instead of the app. `PERF_LAB_LOG_WEEKS=26` writes all of them.
- **The nightly record**, worked out by the nightly job's own pure core over the seeded data: each client's renewal snapshot (`clients/{id}.renewal`, `buildRenewalSnapshot` over the attendance the job reads), then `nightStudio` for `studios/{s}/clientStates`, `watch/journey` and `watch/hubMarks` (All stars). So Operations Today, the Directory and the Hub do the work they do in production.
- About 600 notes (`journalEntries`), 14 of them Critical on today's or tomorrow's clients; about 250 FORD details; 5 announcements; 25 notifications in the lab user's bell.

`PERF_LAB_CLIENTS` and `PERF_LAB_MAX_LOGS` change the size (`--clients` on `lab.mjs`). Not seeded: InBody, Relay's board and tasks, floor notes, cases, FileMaker imports.

## Profiles, and the slowdown calibrated to the PC

| Profile | Viewport | JS speed | Stands for |
| --- | --- | --- | --- |
| `ipad10-portrait` | 820 x 1180 @2x | 3x slower than the reference | iPad 10th gen (A14) |
| `ipadmini-portrait` | 744 x 1133 @2x | 3x | iPad mini 6 (A15) |
| `old-ipad-landscape` | 1180 x 820 @2x | 5x | iPad 8th/9th gen (A12/A13, 3 GB) |
| `desktop` | 1440 x 900 @1x | 1x | the reference |
| `floor` | 1440 x 900 @1x | 1x, **no added network** | the emulator floor: what is left of an open with the iPad and the network taken away (mostly the emulator's own waiting). Cold, warm, relaunch, after-deploy, client, session and ops only, never profiled. |

The multipliers are Speedometer-3-class estimates against a fast desktop. **They are calibrated, not fixed**: Chrome's throttle slows the page by a factor of whatever PC runs it, and it isn't linear (on AJ's PC a fixed "3x" made JavaScript about 3.9 times slower and "5x" about 8 times, so runs before Oct 6 2026 emulated slower iPads than they said). Before every rep the page times a fixed piece of JavaScript unthrottled (`calibrate.mjs`, BENCH: objects, sorting, maps, strings, JSON), then finds the throttle at which it runs the class's multiple of the **reference, AJ's PC on Oct 6 2026 (235 ms)**, in two or three measured steps. The report prints this PC's time, the rate each profile got and the class it reached, warns when the PC's speed moved more than 10% during the run, and says so when the PC is slower than the reference (the desktop profile then can't be brought up to 1x).

Every profile but `floor` adds 60 ms of latency at 20 Mbps down / 10 up (gym Wi-Fi to us-west1 from Ohio); `--latency 0` turns it off for all. The iPad profiles turn on touch (5 points) and send iPad Safari's desktop-class user agent, so the app takes its iPad paths.

## Scenarios

| | What | Timed to (the report's "wall") |
| --- | --- | --- |
| a `cold` | Empty profile, first sign-in: load, sign in, the studio greeting, Start | the Hub's cards painted and the app's `journey:hub-data` mark, whichever is later, from navigation; plus the sign-in screen, the greeting, Start tap to the Hub and the other boot marks |
| b `warm` | Reload: the same renderer with its memory caches, HTTP and Firestore caches kept | the same, from navigation |
| b2 `relaunch` | **The headline open.** Chrome closed and started again on the same profile (an iPad's Home Screen app that iOS put away): a fresh renderer with nothing in memory, the disk caches kept | the same, from navigation |
| b3 `afterdeploy` | The first open after a deploy (every push to master): relaunched with the HTTP cache and V8's code cache emptied, the Firestore cache (IndexedDB) kept | the same, from navigation |
| c `idle` | The Hub left open 70 s, so a minute tick falls inside | long tasks only |
| d `client` | Winifred Ashcombe's card on today's Hub, the peek, Open profile | the Journey tab's grid rows painted, from the tap |
| e `session` | Theodora Pemberton's card on tomorrow's Hub, Start session, the briefing's Start, 5 sets typed and Next, the machine menu opened and closed; then Finish, Finish session | **wall = start -> briefing + briefing -> Now Bar + the five sets + the menu**, the app's own work a trainer waits on. Each step is reported; Finish (to the Wrap-up, and the database's answer) is reported apart, as the emulator's |
| f `ops` | The trainer menu, Open Operations, Today; back to the Hub, the Client tab, "Pat" typed in the search | **wall = Today settled**: nothing anywhere on the Operations page still "Reading..." and no spinner. Plus Today first drawn, the Directory drawn and settled, results after the last key |
| g `scroll` | The Hub's grid scrolled down and up three times, the Directory once down, by script, 36 px a frame | frames the main thread missed, per pass |

### How a number is taken

- **"Drawn"** is the next paint after the thing appeared, found by a watch on the DOM (checked at most once a frame) with a 100 ms poll behind it.
- **"Settled"** is the moment the page went quiet: no element added or removed and no long task for 300 to 600 ms. Style and text changes (animations, the minute tick, a "sending" counter) don't count, so a ticking clock no longer moves it.
- **A set** is the Next tap's own interaction from event timing: from the input to the next paint after its handlers ran. Event timing reports nothing under 16 ms, so a set that fast is written as 16. `setSettledMedianMs` is the tap to the page going quiet.
- **Main thread** is `Performance.getMetrics` TaskDuration in wall time, so it includes the slowdown (before Oct 6 2026 the columns were thread time, which leaves the slowdown out; ScriptDuration does not follow the throttle at all, so it stays in results.json only). Layout and style are beside it. The report checks that the iPad 10th gen's cold main-thread time is at least twice the 1x profile's and says plainly when it isn't.
- **Waiting** (for the opens and the client scenario, whose wall is one span) is the time not spent in long tasks: the network, the emulator and the app's own timers.
- **Requests / KB** are what the page fetched during the scenario (bodies, from the network log).
- Long tasks, the slowest interaction (INP-like) and uncaught exceptions as before; the DOM size and the JS heap at the end.
- **The timed reps run without the profiler.** The profiled rep (one per profile, kept out of the medians) is what "Where the time went" reads. A function's line there is where it is DEFINED, not the hot line (the bundle is minified to one line, so V8's line ticks can't help), and forced layout counts as the calling function's own time.
- `--bare` drops every page instrument (no observers; only the clock shim stays), to measure what they cost: compare a `--bare` desktop cold with a normal one. The clock shim itself shows in the profile as `(LabDate)`, about 30 ms of a 5 s open at 3x.

Every cell in the report is the median of the timed reps, then [min-max]; **!** flags a spread over 15% of the median.

## Reading the numbers

Compare runs of the same lab on the same PC, before and after a change, with nothing else heavy running, or use A/B, which alternates the two builds through one run. The calibration takes out most of a PC's own speed, not the noise of something else running.

What is the emulator's, not the app's: **the session's Finish** (`finishToWrapUpMs` about 5 s on every profile, the floor included, with `finishWaitsRanOut` = 1, and `databaseAckMs`). That 5 s is the app's two Finish waits running out (`FINISHED_ELSEWHERE_WAIT_MS` 2 s for the "finished on another iPad" read, then `FINISH_WAIT_MS` 3 s for the commit; `features/session-record/finish-wait.ts`) because the emulator answers the Finish batch slowly while the app's listeners are open. On a real iPad these waits matter only if Firestore is slower than 2 s and 3 s. Judge the Finish on its long tasks. The `floor` profile shows how much of every open is the emulator's own waiting. The absolute numbers are Chrome's, not Safari's (see the report's last section). A scenario that failed is listed under its table with the reason and a screenshot (`fail-<profile>-<build>-<rep>-<scenario>.png`); a failure in an open skips the rest of that rep.

## Traps found building it

- **The emulator wedges if it is reused.** Closing Chrome while a write is on its way once left the Firestore emulator holding locks: every later write whose rules read the same trainer document hung, and a REST commit got "Transaction lock timeout". Hence fresh emulators from the export for every rep, and the driver waits for `waitForWrites()` before closing Chrome (relaunch included).
- **The CLI's export skips a named database.** `firebase emulators:export` writes only `(default)`; the lab's data is in `perf-lab`. `lab.mjs` asks the emulator's own endpoint (`POST /emulator/v1/projects/demo-perf-lab:export` with the database named) and an `--import` restores it into `perf-lab`.
- **A cold emulator answers its first rules-checked reads seconds late.** Each rep warms it first (the app's opening reads and two writes, removed with the owner token).
- **Chrome's throttle isn't the number you give it**, and thread-time metrics leave it out entirely. Hence the calibration, and wall-time metrics.
- **`NODE_ENV`**, above.
- **`/harness/` is git-ignored** (and in `.git/info/exclude` on AJ's PC); `.gitignore` lets `harness/perf-lab/` through, and on AJ's PC its files are added with `git add -f`.
