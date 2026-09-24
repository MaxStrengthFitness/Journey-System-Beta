# Stale sessions — Sep 24 2026

A data-integrity fix from the app-wide code review, on its own branch. **Nothing here is on `master`.** It changes no Firestore structure, no rules, no Mindbody code and no Cloud Function.

## What was wrong

A session a trainer starts and never ends stays `In-Progress` forever. Nothing on the server closes it, and since the tracker round (Sep 13) nothing on the iPad deletes it either. That was deliberate: abandonment became a **read-side** rule, `isSessionValid` (a heartbeat older than 60 minutes means abandoned).

But only some screens read the rule:

| Door | What it did with yesterday's abandoned session |
| --- | --- |
| Client profile → **Start session** | Read the rule: the session was hidden, so Start was offered. Start then opened the Active Session, which **did not** read the rule ↓ |
| Active Session, the client's sessions stream | Adopted **any** In-Progress session for the client. So Start the next morning quietly reopened yesterday's session, and the day's sets went into it, **under yesterday's date**. |
| Active Session, the device's remembered session | Followed the remembered id however old the session was. And its "only for this client" check compared against a value that is always empty at that moment, so it could adopt **another client's** session. |
| Bottom bar → **Start Session** | Its first two checks read the rule. Its fallback (the remembered id) did not, so the tab that says "Start Session" could take the trainer back into yesterday's session. |
| Briefing | Never shown: the stream had already adopted the old session. |
| Profile → **Discard** | Lives in the "In progress" menu, which only appears for a *live* session. An abandoned session could not be discarded from anywhere. |

The profile's check also read `limit(1)`, so an abandoned session could stand in front of a live one and the header offered Start while a session was running.

## What changed

- **One rule, one split.** `isSessionValid` (`src/lib/utils.ts`) is still the rule. `splitInProgress` (`src/lib/live-session.ts`) is the one answer to "which of these In-Progress sessions is running?", and the profile, the Active Session and the bottom tab all read it.
- **The Active Session never adopts a stale session without asking.** A live session is carried on with exactly as before. The session already on screen is never taken away because its heartbeat aged (a long pause, for example). A stale one is held back: the screen is the briefing, with a question over it (`src/features/tracker/StaleSessionDialog.tsx`):
  > **Judy has an unfinished session.** Started yesterday at 9:04 AM by JC. It was never finished. 3 machines were logged in it.
  > [Resume it] [Start a new session]

  It is **a confirm, never a block**. Closing the question any way at all means "start a new session", which is what the trainer pressed Start for. **Resume** makes it the session on screen, remembers it on the device, and writes one heartbeat. Nothing else about it changes, and its sets stay under its own day. **Start a new session** leaves the old one exactly as it is.
- **The remembered id is followed only while its session is live**, in the Active Session and in the bottom tab, and in the Active Session only for the client on screen.
- **The profile says it is there, and Discard reaches it.** Under the header: *"An unfinished session. Started yesterday at 9:04 AM by JC. It was never finished. Start session asks whether to resume it or begin a new one."* It has a **Discard it** button (`src/features/client-profile/StaleSessionNotice.tsx`). Discard uses the same confirm and the same delete sequence as before. It now takes whichever session it was opened for.
- The profile's check reads every In-Progress session for the client (guard rail 20), not one.

Nothing is closed, finished or deleted by itself. The only delete is still Discard, pressed and confirmed by a person.

## For AJ to decide

**What should happen to a stale In-Progress session when someone presses Start?**

1. **Resume it.** This was the old behaviour and the bug: today's sets under yesterday's date. Not recommended.
2. **Close it as it was, automatically.** Run End Session on it under its own date, so what was logged counts. The catch: many abandoned sessions are false starts (the wrong client, nothing logged). Closing those would add a session the client never had to their count. A confident wrong number is worse than a missing one.
3. **Ask.** *This is what is built*, as the safe default.

**Recommendation:** keep **ask**, and add a third answer to it, **"Finish it as it was"**. That runs the ordinary End Session on the old session under its own date, then carries on to today's briefing. A session with real sets then gets counted. One with nothing in it can be discarded from the profile. Never close one without a person choosing to.

Two related questions:

- **Should anything close abandoned sessions without a person?** Recommendation: no. Instead, list them for leaders on Operations → Overview ("Needs you": *Judy's session from Tuesday was never finished — Finish or Discard*). That is a server/Operations change and needs your OK.
- **"View current session" and "Take over session" do the same thing.** Both open the live session for editing. Take over also makes it this iPad's remembered session. Should View be read-only, or go? Not changed here.

## Known edges, not changed

- An iPad left open on a session overnight still shows that session in the morning. The tracker never ejects the session on screen. Its "Started" time is on the session bar.
- A new session started beside an abandoned one gets the same session number. The client's count is kept by `increment()` and stays right, but if both are later finished, two sessions carry one number.

## Verification

- `npx tsc --noEmit`: **10** errors, the baseline. A fresh worktree shows 12, because it has no `firebase-applet-config.json` (gitignored).
- `TZ=America/New_York npx vitest run --dir src`: **3,703 passed in 245 files** (244 before, plus `StaleSessionNotice.render.test.tsx`).
- New tests: the rule and the split, with a fixed clock (`src/lib/live-session.test.ts`). In `WorkoutTrackerView.render.test.tsx`: the question instead of the tracker, Resume, Start a new session, a live session still adopted silently, and the remembered id refused for another client and for a stale session. Run against the code before this fix, all five bug tests fail.
- Not yet seen on an iPad. To check: start a session, leave it, then change the session's `lastHeartbeatAt` to more than an hour ago and press Start.
