# Why the Refresh button took 30–100 seconds

*Sep 22 2026. AJ: "can you look into making the mindbody sync refresh to load
the schedule a little faster? Really I just want it to update today."*

His instinct was right, and the window was one of three reasons. Looking for
the other two turned up a bug that mattered more than the speed.

---

## Start with the bug

The proxy fetches the window in **pages of 500**. A busy 30-day window on Site
29068 is about 3,800 appointments, so eight pages.

When one of those pages failed, the old loop did this:

```js
if (!apiResponse.ok) {
  if (offset === 0) return res.status(...)   // only the FIRST page is an error
  break;                                     // any other page: stop, return what we have
}
```

A short list, handed back looking whole. And at the other end, the sync does
this:

```js
// Gone from Mindbody means cancelled
if (!currentMbIds.has(mbId) && inWindow(existing.data.startTime)) {
  batch.update(..., { status: "Cancelled", cancelSource: "sweep" });
}
```

**So one failed page cancelled every real booking that would have been on it.**
Not hidden, not flagged — stamped `cancelSource: "sweep"` and dropped off the
calendar, from a transient 500 that nobody saw.

This is the Aug 30 storm's second cause, word for word: *a transient read
failure turned into permanent data loss.* The house rule that came out of that
week is **a failed read means unknown, never empty** — and this path never got
it.

**Fixed.** The proxy now says whether its answer was whole. The sync refuses to
sweep when it wasn't, saves everything that *did* arrive, and puts a sentence
on the result instead of reporting a clean run. Five tests hold it shut,
including one proving an older proxy that sends no flag still sweeps normally.

I'd rather have found this than the speed.

---

## Then the speed — three things

### 1. The pages waited for each other

Eight round trips to Mindbody, each one starting after the last finished,
before the browser saw anything. That is most of the spinner.

Page 1 reports `TotalResults`, so every remaining offset is known up front.
**Eight sequential trips became two.**

They go through `mindbodyGet` now rather than a bare `fetch`, so the token
bucket, `Retry-After` handling and per-site breaker from Phase 9 cover them.
Firing seven pages at once *without* that would be an excellent way to earn a
429 with nothing to catch it.

### 2. Two thirds of the work was thrown away

Site 29068 is shared by Westlake, Strongsville and Willoughby. A refresh at any
one of them fetched all three studios' appointments, **looked up all three
studios' clients from Mindbody** (thirty-odd more calls), normalized all three,
sent all three to the iPad — and the browser then filtered to one.

The browser now tells the proxy which locations are claimed, and the proxy
drops the siblings before any of that.

**The part that needed care:** it must *not* filter down to "my location" alone.
Before the browser narrows, it walks the whole answer and parks every
appointment at a location **no studio claims** into the Limbo queue — which is
the only way a location that came online before anyone mapped it is ever seen.
A plain `=== locationId` filter in the proxy would have starved that queue
silently, which is the exact failure the parking step was built to fix.

So: keep mine, keep anything unclaimed, keep anything with no location at all.
Drop only what another studio already owns.

### 3. It pulled a month to draw a week

This is AJ's point. The button asked for **30 days**. The app can display
**eight** — `WEEK_AHEAD_DAYS`, which is what the Hub's day tabs, the trainer's
upcoming list and the Operations week all read.

The button now pulls eight days. **The background auto-sync still pulls 30**, so
the calendar's forward months are exactly as populated as before — that's why
this is safe to do to the button and not to both.

**Why eight and not one.** AJ asked for "just today", and one day would be
faster still. But a trainer who presses Refresh after a client books next
Tuesday would watch it not appear, with nothing to explain why. Eight days
means everything you could be looking at is everything that just got refreshed.

If you want today only, it's one line — `REFRESH_WINDOW_DAYS` in
`src/lib/mindbody-api-sync.ts`. The comment above it says what the trade is.

---

## What to expect

Roughly: **a month of three studios became a week of one, fetched in two
trips instead of eight.** I'd rather not put a number on it before the logs do.

Which is the last piece: the endpoint now prints a line per refresh —

```
[staff-appointments] site 29068 loc 3 2026-09-23..2026-10-01: 2 page(s) 1840ms,
  980/2931 appts -> 347 after dropping siblings, 18 client lookup(s) 610ms
```

Press Refresh once and that line says exactly where the time went, and whether
anything is left worth chasing.

---

## Still open

`scripts/probe-mindbody-location-filter.ts` — read-only, about three calls per
studio. If Mindbody honours a `LocationIds` parameter on `staffappointments`,
the *fetch* shrinks by the same factor the sibling-drop already shrinks
everything after it, and eight pages become three on the deep sync.

Its docs don't settle whether that parameter exists, and an unsupported one
could be refused — or, worse, accepted and ignored. That's not something to
guess at inside the live sync path, so the script asks, and reports HONOURED /
IGNORED / REFUSED rather than a bare number.

Nothing is gated on it.
