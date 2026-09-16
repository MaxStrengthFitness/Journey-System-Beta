# Hub sync fixes — Sep 16 2026

Branch `hub-sync-fixes`, off `master` at `5386bd6` (the Planner rework docs).
Four fixes and this documentation, one commit each, each typechecked on its own.

AJ's report, with screenshots from the iPad:

1. **Clients not syncing.** On the Hub some blocks say "Not synced", more of
   them after a studio switch or when the app has been open a long time, and
   the directory doesn't seem to hold every client. A studio has about 300;
   he was worried that loading them all would wreck the read count.
2. **The Edit Routine dialog doesn't scroll.** On the iPad the bottom is cut
   off, including the button that adds machines.
3. **The client's contraindications are cluttered.** In Body → "Browse every
   condition" the severity labels sit on top of the names.

AJ OK'd two changes to the Mindbody sync (CLAUDE.md asks for that): the client
check in phase 1, and the stale-booking sweep.

## 1. The Hub roster (`useStudioRoster`)

### What was wrong

`useLiveSchedule` fetched the client documents named by the next nine days of
bookings and re-read the whole set whenever the set of ids changed.

- **A re-read asked for while one was in flight was dropped, and nothing asked
  again.** On a studio switch the old studio's read was usually still running,
  so the new studio's roster was never read. Every block said "Not synced",
  and the directory still listed the old studio's clients. AJ's Strongsville
  screenshot shows exactly that: Theresa Robinson, Lisa Kotora and Daniel
  Ungar, all Solon clients, marked "Visiting: Solon".
- **It watched the set of ids, not the documents.** A client created by the
  sync after the first read (same ids, so no re-read) stayed "Not synced"
  until the app was reloaded. No client change ever arrived either (a
  nickname, the nightly renewal snapshot).
- **For a trainer, a chunk holding one id with no document was refused
  whole** (the rules can't describe a document that isn't there), and those
  ten clients were missing.
- Every booking added or cancelled re-read every client in the window.

### What it is now

`src/hooks/useStudioRoster.ts`, with the pure rules in `src/lib/studio-roster.ts`:

- **Studio:** one listener on `clients where homeStudioId == <studio the iPad
  is in>`. The rules can prove that query from the trainer document, so it
  works for every role.
- **Visitors:** booked clients the listener doesn't hold (another studio's, or
  no home studio yet) are read by id, once. A visitor is re-read after 15
  minutes. An id that came back empty is asked about again after 5 minutes.
  A refused batch is retried one id at a time.
- **A studio switch** clears the old roster immediately, and `status` is
  `loading` until the new listener answers.
- **A failed read never empties the roster.** A failed listener is reported
  once and reopened with a backoff (15 s → 5 min).
- **The Hub** draws a quiet "loading" block (a pulsing dot) instead of "Not
  synced" while the roster is still arriving.
- **The directory** reads nothing of its own for the current studio once the
  roster is in:
  - the recent list and a name search both come from the roster;
  - the line under the search box says how many clients there are, and
    **Show all** lists them;
  - "Search entire corporate network" still queries, because other studios
    aren't in the roster;
  - the Last Session column now asks about each client once, instead of
    again on every render.
- `AppContent`'s `clients` list is memoised. It used to be a new array on
  every render, which re-ran every effect that depended on it.

### What it costs

| When | Reads |
| --- | --- |
| App opens / studio switch | ~1 per client at the studio (~300 at the largest) |
| A client document changes (a session ends, a sync creates one, the nightly renewal job) | 1 per change, per open iPad |
| Visitors | 1 per visitor on first sight, then at most once per 15 min |
| A booking is added or cancelled | 0 (it used to re-read the whole window) |

At Firestore's list price, 300 reads cost a fraction of a cent.

**Watch this when the FileMaker import lands.** Years of former clients with
the same `homeStudioId` would make the open cost grow. The listener has a
1,500 cap and warns if it hits it. The fix then is to filter it to active
clients.

## 2. The Edit Routine dialog

The builder scrolls its own list and pins its **Add / Ideas / Warnings** bar
under it, which only works inside a box of known height. Two things denied it
one:

- the dialog had only a `max-height`, so the builder's `height: 100%` resolved
  to "as tall as my content";
- the wrapper around the builder was a plain block, so the builder's
  `flex: 1` did nothing.

The builder grew past the dialog and `overflow-hidden` cut it off. Now:

- the dialog has a real height (`h-[94dvh]`), and the keyboard-avoidance style
  sets `height` as well as `max-height`;
- the wrapper is a flex column;
- the header scrolls itself past 42dvh, so a crowded header can never squeeze
  the builder to nothing;
- the builder's list and rail claim vertical pans at once on iPad.

Checked in a browser at iPad portrait (810×970):

| | List scroll height / visible height | Bottom of the Add bar |
| --- | --- | --- |
| Before | 637 / 637 (no scroll) | 1041px (below the 970px screen) |
| After | 637 / 327 (scrolls) | 732px (on screen) |

## 3. The condition list

- **A row is a grid:** mark · name · badge. Nothing can overlap the name.
- **The name gets a quiet second line** with the detail it drops ("Grade 2 or
  higher", "MI, Stent, or Bypass within 4 weeks").
- **Only the exceptions carry a badge,** in short words: **STOP** (absolute
  contraindication) and **HIGH** (high risk). "Moderate" is the common case
  and has none. A legend above the list says what each badge means.
- **A coloured left edge** repeats the tier.
- **Within a group, the most serious come first.**
- **Groups** have a heading with a rule, an "n on" count, and space above.
  The summary line shows how many conditions there are and how many are on.
- **The full matrix wording** stays in the tooltip and the accessible name.
- **The grid** is two columns at most. In the profile's narrow column it is
  one.

## 4. The schedule sync (`src/lib/mindbody-api-sync.ts`)

### Phase 1 read every client in every studio

**Before:** every sync (and auto-sync runs every 15 minutes) called
`getDocs(collection("clients"))`.

- **For an administrator:** that was the app's biggest read bill.
- **For anyone else:** the rules refused it, so the sync fell back to the
  caller's partial roster. Every client that roster didn't hold was "created"
  again with a merge write, which **reset `sessionCount`, `completedSessions`,
  `remainingSessions`, `height` and `createdAt`** on the existing record.

**Now:** only the ids the caller's roster lacks are checked, by id
(`checkClientIds`), and each gets one of four answers:

| Answer | What happens |
| --- | --- |
| **existing** | Never written over. |
| **missing** | Created in a batch. |
| **refused by the rules** (a trainer can't read a missing document, nor another studio's) | Created one at a time. A new client is created; someone else's is refused by the update rule, which is narrower than the read rule. |
| **unchecked** (any other read failure) | Unknown, so nothing is created for it this run, and the sync says so. |

Two more changes in this phase:

- **Demographics are filled in only on the studio's own clients.** A
  visitor's record belongs to another studio, and the update the rules
  refuse would have failed the whole batch of schedule rows.
- **Cost:** a sync now reads about as many client documents as there are new
  or visiting clients, usually a handful.

### The stale-booking sweep cancelled the past

**Before:** the sweep read every booking the studio has ever had (1,000+ at
Willoughby) and marked each one "Cancelled" if Mindbody's answer didn't
include it. Mindbody was only asked about today to +30 days, so **every past
booking was marked cancelled on every sync**, and yesterday's sessions
dropped off the Hub.

**Now:**

- the read is bounded to the sync window (`studioId` plus a `startTime`
  range, the index the live schedule already uses);
- only rows inside that window can be marked cancelled.

**Rows the old sweep already cancelled are not repaired by this round.** To
restore them, run Operations → Mindbody → Sync for each studio with a past
start date. The upsert sets them back to Scheduled, and the new sweep won't
cancel them again. (Roadmap.)

## Not changed

- No rules, indexes, Cloud Functions, packages or server changes.
- Nothing about how the webhook writes.

## Tests

- **Full suite:** 2,787 passing at `TZ=America/New_York`, 2,763 before.
- **New tests:**
  - `src/lib/studio-roster.test.ts`: the pure roster rules;
  - `src/hooks/useStudioRoster.render.test.tsx`: a studio switch, a
    late-created client, visitors, a refused batch, a failing listener;
  - four sync tests: no whole-collection read, no overwrite, the refused
    create, no visitor enrichment;
  - one sweep test: nothing outside the window is cancelled, and the read is
    bounded;
  - `flag-search` tests: most-serious-first, the detail line, the badges.
- **Typecheck:** 13 errors, unchanged. **Production build:** clean.
