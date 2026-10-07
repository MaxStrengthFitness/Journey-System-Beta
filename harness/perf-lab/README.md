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
node harness/perf-lab/lab.mjs report --runId <id>       # the report again from a run's results.json
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

### The slim roster (`--split`)

`--split` on `all`, `run` or `seed` seeds each client's machine maps (`currentMachineMetrics`, `machineStats`) in their own document, `clients/{id}/machineTotals/current`, the shape `scripts/split-client-metrics.ts` leaves in production (the iPad round, Oct 6 2026; `src/features/machine-totals/README.md`). Without it the seed is the shape before the migration. Both are written by the migration's own `planClientSplit`, so they can't drift; `src/features/machine-totals/split-run.test.ts` holds that the script turns the unsplit shape into exactly the split one. `seed-summary.json` records `split`, and `run` reseeds when it doesn't match what was asked.

A build from before the split reads a split seed with no machine maps at all, so compare the slim roster as **before build on the unsplit seed** against **after build on the split seed** (two runs: `run --build-a before` without `--split`, then `run --build-a after --split`), not as one A/B run. The migration script runs against the lab's emulator too, with the emulators up: `$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"; npx tsx scripts/split-client-metrics.ts --project demo-perf-lab --database perf-lab --commit`.

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
| h `live` (opt-in: `--scenarios live`) | The Directory left open across a minute tick, then one client document changed (the emulator's owner token, a field no screen reads, as a webhook or the nightly job would), then the same on the Hub | long tasks per phase (`lt.directoryIdle`, `lt.directoryWrite`, `lt.toHub`, `lt.hubWrite`) |

### How a number is taken

- **"Drawn"** is the next paint after the thing appeared, found by a watch on the DOM (checked at most once a frame) with a 100 ms poll behind it.
- **"Settled"** is the moment the page went quiet: no element added or removed and no long task for 300 to 600 ms. Style and text changes (animations, the minute tick, a "sending" counter) don't count, so a ticking clock no longer moves it.
- **A set** is the Next tap's own interaction from event timing: from the input to the next paint after its handlers ran. Event timing reports nothing under 16 ms, so a set that fast is written as 16. `setSettledMedianMs` is the tap to the page going quiet.
- **Main thread** is `Performance.getMetrics` TaskDuration in wall time, so it includes the slowdown (before Oct 6 2026 the columns were thread time, which leaves the slowdown out; ScriptDuration does not follow the throttle at all, so it stays in results.json only). Layout and style are beside it. Chrome starts these counters again with every new document, so an open reads the new document's own count from its navigation on. The report checks that the iPad 10th gen's relaunch main-thread time (relaunch is mostly work; cold is mostly waiting) is at least twice the 1x profile's and says plainly when it isn't.
- **Waiting** (for the opens and the client scenario, whose wall is one span) is the time not spent in long tasks: the network, the emulator and the app's own timers.
- **Requests / KB** are what the page fetched during the scenario (bodies, from the network log).
- Long tasks, the slowest interaction (INP-like) and uncaught exceptions as before; the DOM size and the JS heap at the end.
- **Phases.** client, session, ops and live name their phases (session: peek, start, onBriefing, toNowBar, sets, menu, finish, wrapUp; ops: open, settle, backToHub, directory, search). Each phase's long tasks are a step (`lt.<phase>`, the tasks that began in it), and in the profiled rep the report adds "By phase": each phase's CPU and its top functions, from the profile's samples between the phase's page times (matched to the profile's clock at Profiler.start, so a few ms either way).
- **The timed reps run without the profiler.** The profiled rep (one per profile, kept out of the medians) is what "Where the time went" reads. A function's line there is where it is DEFINED, not the hot line (the bundle is minified to one line, so V8's line ticks can't help), and forced layout counts as the calling function's own time.
- `--bare` drops every page instrument (no observers; only the clock shim stays), to measure what they cost: compare a `--bare` desktop run with a normal one. On Oct 6 2026 they cost about 1 to 2% of an open at 1x (cold Start tap to Hub 4,055 ms bare against 4,150, warm 835 against 854, after-deploy 2,230 against 2,258). The clock shim itself shows in the profile as `(LabDate)`, about 30 ms of a 5 s open at 3x.

Every cell in the report is the median of the timed reps, then [min-max]; **!** flags a spread over 15% of the median.

## Reading the numbers

Compare runs of the same lab on the same PC, before and after a change, with nothing else heavy running, or use A/B, which alternates the two builds through one run. The calibration takes out most of a PC's own speed, not the noise of something else running.

What is the emulator's, not the app's: **the session's Finish** (`finishToWrapUpMs` about 5 s on every profile, the floor included, with `finishWaitsRanOut` = 1, and `databaseAckMs`). That 5 s is the app's two Finish waits running out (`FINISHED_ELSEWHERE_WAIT_MS` 2 s for the "finished on another iPad" read, then `FINISH_WAIT_MS` 3 s for the commit; `features/session-record/finish-wait.ts`) because the emulator answers the Finish batch slowly while the app's listeners are open. On a real iPad these waits matter only if Firestore is slower than 2 s and 3 s. Judge the Finish on its long tasks.

**The session's Start -> briefing is mostly the emulator's queue, too** (traced Oct 6 2026). The briefing waits, rightly, for the server's answer to the client's sessions (whether one is already running, and the history it reads). The browser sends every new listener over one WebChannel "forward" request at a time, and the emulator holds that request open until it has worked out the queries in it. When the scenario before has left heavy reads in flight (the `client` scenario's profile asks for fifty sessions' sets in five `exerciseLogs` `in` queries), that request takes the emulator about 7 s, and the session's reads, made 0.3 s after the tap, cannot leave the browser until it answers: Start -> briefing was 6.1 to 7.4 s with `client` run first and 1.1 s with `session` alone (desktop). Production acknowledges a listen request at once and works the queries out on its own, so a real iPad waits for the client's own reads only. Compare it only between builds run in the same scenario order, and read `PERF_LAB_TRACE` (below) before blaming the app for it.

**The Wrap-up after Finish is the emulator's re-sending, not the app** (traced Oct 6 2026, the Wrap-up round). The emulator answers every write by sending every listening query again WHOLE (a target RESET with all its documents), where production sends only the documents that changed. After Finish that is about 3,500 documents and 8 MB in 40 s: the 300-client roster (4 MB) once the client's document is written, the client's sessions (two listeners) and the studio's day of sessions four or five times each, the sets of the last fifty sessions six times. The build before the speed round (c20d2abe) and the release take in the same documents (3,671 and 3,439, 8.3 and 7.8 MB, in one rep each); what changed with the speed round (7aca6195 alone: 651-663 ms of Wrap-up long tasks over three reps, the release 473-797, c20d2abe 54-375 with the same 10 s tail) is that the emulator now hands them over in about 540 frames rather than 30, and the Firestore SDK's CPU on them in the 30 s after the Wrap-up appears went from about 1.4 s to 2.5 s (its document-key maps), while the app's own CPU there FELL, 282 to 142 ms. Inside the release's Wrap-up long tasks the app's frames are about 10 ms of 722 (WrapUpScreen 18-26 ms in the whole phase). So `lt.wrapUp` measures the emulator; judge the Wrap-up by the profiled rep's "app ms" (By phase), and by a trace (`recv` lines) before blaming the app. The roster split adds one 3 KB document to that answer. Where `lt.wrapUp` ends also moves it: it runs to the database's answer to Finish, and the roster's re-send lands just before that answer in the release and just after it in c20d2abe, which alone made it look like 60 against 581 ms; `PERF_LAB_WRAPUP_TAIL_MS` keeps measuring after the answer when comparing builds.

**Opening a profile again is the emulator's queue as well** (traced Oct 6 2026). The profile reads a page's sets in five `exerciseLogs` `in` queries side by side (the speed round, R12: one round trip in production instead of five), and the emulator works those out for about 4 s while holding the one forward request every new listener must wait behind. Going back to the Hub and opening the next profile within those seconds, the profile's own reads leave the browser only when the emulator lets that request go: 2.2 to 3.9 s from the tap against 0.8 s for the first open (a direct probe, six opens), and the build before the speed round, which read the five one after another, 0.8 to 3.4 s. The machine totals listener is not on that path (it is one small document, and it stays open while the same client is selected); the Journey tab never waits for it (`src/features/machine-totals/profile-draws.render.test.tsx`). A real iPad's reads are answered as they come.

Switches for looking closer, all off by default and never on in a timed comparison:

- `PERF_LAB_TRACE=<file>` writes every Firestore channel request the page sends and when it finished (`send` / `done` with its `took=` time and body size, aligned to the page's clock), the data arriving on the listen stream (`data`), and any `console.log("[trace]", label, ...)` the app makes (put one in a lab build to time a step). `<file>.bodies` gets each listen request's decoded body: which targets were added and removed. Since the Wrap-up round (Oct 6 2026) it also decodes what ARRIVES (`recv`: one line per frame, the documents by collection and the targets they came for, target changes such as RESET and CURRENT, existence filters), marks the session's and the client's steps (`mark`: Start tapped, the Now Bar, Finish tapped, the Wrap-up, the database's answer; Open profile tapped, the Journey tab drawn), and writes each long task and slow interaction on the same clock (`longtask`, `interaction`), so a stutter can be laid beside the data that caused it.
- `PERF_LAB_SAVE_PROFILE=<path prefix>` (the profiled rep only) saves the raw CPU profile with its phases and long tasks (`<prefix>-<time>.json`), to look inside one long task: which code was on the stack, the app's or a library's.
- `PERF_LAB_WRAPUP_TAIL_MS=<ms>` keeps the session's Wrap-up phase measuring that long after the database's answer to Finish (by default it ends at the answer), so two builds whose answers land at different moments are compared over the same stretch.
- `PERF_LAB_SHOTS=1` takes screenshots in the `client` and `session` scenarios (the profile's Journey grid and the session's grid, each as drawn and then scrolled sideways and down, `shot-<profile>-<build>-<rep>-<label>.png`), to check that a build still looks the same as another. The scrolling adds time to those scenarios. The `floor` profile shows how much of every open is the emulator's own waiting. The absolute numbers are Chrome's, not Safari's (see the report's last section). A scenario that failed is listed under its table with the reason and a screenshot (`fail-<profile>-<build>-<rep>-<scenario>.png`); a failure in an open skips the rest of that rep.

## Traps found building it

- **The emulator wedges if it is reused.** Closing Chrome while a write is on its way once left the Firestore emulator holding locks: every later write whose rules read the same trainer document hung, and a REST commit got "Transaction lock timeout". Hence fresh emulators from the export for every rep, and the driver waits for `waitForWrites()` before closing Chrome (relaunch included).
- **The CLI's export skips a named database.** `firebase emulators:export` writes only `(default)`; the lab's data is in `perf-lab`. `lab.mjs` asks the emulator's own endpoint (`POST /emulator/v1/projects/demo-perf-lab:export` with the database named) and an `--import` restores it into `perf-lab`.
- **A cold emulator answers its first rules-checked reads seconds late.** Each rep warms it first (the app's opening reads and two writes, removed with the owner token).
- **Chrome's throttle isn't the number you give it**, and thread-time metrics leave it out entirely. Hence the calibration, and wall-time metrics.
- **Performance.getMetrics starts again with every document**, and ScriptDuration ignores the throttle. An open reads the new document's TaskDuration as it is; subtracting the blank page's (where the calibration ran) gave nonsense.
- **A list's height changes while it scrolls**, and at 2x scrollTop is fractional, so a scroll pass ends when the list stops moving, not at a height measured once.
- **A blocked-URL pattern naming googleapis.com also matches the Auth emulator** (127.0.0.1:9099/identitytoolkit.googleapis.com/...): the lab refuses every https URL instead.
- **`NODE_ENV`**, above.
- **A tap in the same frame as its button arriving can miss.** Two client reps once timed out with the peek open and a session rep never left today (Oct 6 2026). The client and session scenarios now wait two animation frames after the peek's buttons appear, and for the day header to settle, before tapping; tomorrow is tapped once more if its cards don't come in 10 s. The two frames are inside the client scenario's wall (about 30 ms).
- **A build from before the speed round shows the Now Bar only after the database answers the new session** (c20d2abe awaited `addDoc`), and the emulator sometimes takes longer than 45 s. `--nowbar-wait <ms>` sets the wait for every build; `--slow-start A` (or `B`, or `main`, comma-separated) gives that build at least 120 s. Even then c20d2abe missed it in 2 of 3 reps on Oct 6 2026, the emulator's answer to that write being the slow part; such a build's Briefing -> Now Bar is the database's time, not the app's.
- **A Chrome left running holds its profile folder** (the old-iPad "evening anomaly" of Oct 6 2026, investigated for twenty minutes). From about 17:00 the old-iPad profile with the release downloaded everything again on relaunch and on reload (5.3 MB, 6.5 to 8.8 s to the Hub, against 2.3 MB and 4.0 s at 15:10). What was found: it was not the evening (a run at 20:07 with `cold` first was normal, 4.1 s and 2.3 MB); the same re-download shows in the afternoon run too (the release's old-iPad warm reload 5.4 MB in 2 of 3 reps, its relaunch 2.3 MB against the iPad 10's 1.2 MB), and every affected run started without `cold`; and during this round a Chrome WAS left running on a profile folder (`old-ipad-landscape-main-2`), by a launch that failed reading its port file (EBUSY) and never ended the browser it had started. A Chrome left on a folder makes the next launch on it hand over to the old browser, whose page can still hold Firestore's disk cache, so the new page runs on memory and downloads everything (Firestore then warns that it fell back to a memory cache). Not proved to be the cause of the evening runs, but each piece is now handled: a launch ends any Chrome still running on its folder first (and says so), a failed launch ends the whole process tree it started, a close ends the whole tree, the page's Firestore warnings about its disk cache are counted per scenario (`cacheFallbacks` in results.json), and a relaunch or a reload first waits for the database to go quiet for 2 s and the page to settle (`cacheQuiet`), so a slowed profile is not closed while it is still writing the last download to disk. If an open downloads everything again, look at `cacheFallbacks` first.
- **`/harness/` is git-ignored** (and in `.git/info/exclude` on AJ's PC); `.gitignore` lets `harness/perf-lab/` through, and on AJ's PC its files are added with `git add -f`.
