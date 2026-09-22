# Does this actually scale?

*Sep 22 2026. AJ asked, and it's the right question to ask before forty
locations rather than after.*

**Short answer: yes, the shape is right — and Render is almost irrelevant to
it. There is one real time bomb, and it's in a place nobody would think to
look.**

---

## 1. Render barely matters here, and that's the first thing to understand

It's natural to worry about the server. Almost every app you've used gets slow
because its server got busy. **This app mostly doesn't work that way.**

Here's what the Render service actually does:

- Serves the built files — the HTML, the JavaScript, the CSS. Once.
- Proxies calls to Mindbody, because the API key can't live in a browser.
- Two Gemini endpoints for reading charts.

Here's what it does **not** do: touch your data. The web service has no
Firestore admin key at all — that's a deliberate design decision written into
the code. **Every trainer's iPad talks to Firestore directly.** A session being
logged, a note being written, the Hub loading — none of it goes through Render.

So "will Render keep up?" is close to the wrong question. A hundred trainers
hitting Render is a hundred people downloading a file once and then making the
occasional Mindbody call. That is nothing. Render's own scaling will handle it
long past the point where other things break.

**What you should worry about instead is Firestore — and how it charges.**

---

## 2. The cost model is per-read, not per-hour

This is the mental shift that makes everything else make sense.

A normal server costs money by the hour, and gets slow when too many people
arrive at once. **Firestore charges per document read.** If a screen reads 200
client records to draw itself, that screen costs 200 reads every time somebody
opens it — whether one person opens it or a hundred.

So scaling this app is not about traffic. It's about **how many documents each
screen touches**, multiplied by how many people open it, multiplied by how
often.

That's why the same number keeps coming up in this project's history: the
August quota storm wasn't caused by too many users. It was caused by one screen
reading too much, too often, with six iPads doing it simultaneously.

---

## 3. The good news: the live parts are already sharded by studio

Every trainer's app keeps a few live connections open. These are the ones that
would hurt if they were wrong, and they're right:

| What it watches | How it's scoped | Grows with |
| --- | --- | --- |
| The studio's clients | `homeStudioId == this studio`, **and capped** | clients at *one* studio |
| Today's sessions | this studio **and the last 24 hours** | one day's work |
| The schedule | three live days, this studio | three days |

Read that middle row again, because it's the best decision in the app: the
sessions listener is bounded **by time, not by history**. A studio with ten
years of sessions costs exactly the same to open as a studio with one week.
That does not get worse. Ever.

And because everything is scoped to the active studio, **forty locations are
forty independent small loads, not one big one.** Westlake's trainers never
read Solon's data. That is the architecture you want and it's already built.

---

## 4. The one real time bomb

`functions/src/index.ts`, line 28 onward. A Cloud Function called
`calculateFacilityAnalyticsV2`, scheduled `"0 2 * * *"` — **every night at 2am.**

```js
const clientsSnap = await db.collection("clients").get();
const sessionsSnap = await db.collection("sessions").get();
const logsSnap    = await db.collection("exerciseLogs").get();
```

No filter. No limit. No date range. **Every client, every session ever
recorded, and every individual set ever logged** — read into memory, every
night.

Today that's small and nobody notices. Run the numbers at the scale you
described:

- 40 locations × ~150 clients = **~6,000 clients**
- 40 locations × 150 sessions a week × 52 weeks = **~310,000 sessions a year**
- ~6 machines a session = **~1.9 million exercise logs a year**

That's **over two million document reads, every single night**, growing
forever, and it never gets smaller because it reads all of history every time.

**And nothing reads its output.** I grepped the entire codebase for anything
consuming what it writes. There is nothing. The roadmap already noticed this
and it's still there.

So: a nightly scan of your entire database, for a number no screen shows.
Right now it's harmless. In a year at forty locations it's the biggest line on
your Firebase bill, and it would arrive as a mystery.

The function's own comment says: *"For large production datasets, consider
using schedule-based Cloud Functions or distributed counters to reduce read
volume per write."* Somebody knew. It was never done.

**Fixing it is easy and should happen before beta**: either delete it, or give
it a date window like the machine-trends job already has. That job does the
same kind of work correctly — one 90-day window rather than all of history.

---

## 5. Two smaller ones

**Every trainer's app watches every trainer in the company**, live, all the
time — `collection(db, "trainers")` with no filter. At forty locations that's
maybe 320 records held open on every device. Not fatal, but it's the one live
listener that doesn't shard: it grows as the *company* grows, not as a studio
grows. Worth scoping to the studios a person can actually see.

**The nightly renewals job reads every session in its window across all
studios** before splitting them per studio. Bounded by 90 days, so it won't run
away — but it's the pattern to watch as locations multiply.

---

## 6. The real ceiling isn't Firestore at all — it's Mindbody

Firestore is essentially unlimited if you read carefully; it just bills you.
**Mindbody gives you 1,000 free API calls a day for the whole company**, and
charges about a third of a cent after that.

At forty locations, a per-client sync costing five calls, that's the number
that actually constrains you — not servers, not the database. It's why the
sync plan exists and why the retry-and-throttle floor was the first thing
built. That document has the arithmetic.

---

## So: is it scalable?

**Yes, with three caveats, and none of them are the server.**

The shape is right — studio-scoped listeners, time-bounded queries, no
per-client loops on screen. That's the hard part and it's done. What's left is
housekeeping:

1. **Fix or delete the 2am function.** Before beta. It's the only thing here
   that gets unboundedly worse.
2. **Scope the trainers listener.** Small job, do it when convenient.
3. **Respect the Mindbody ceiling.** Already in hand.

The thing that would actually break this app at scale isn't load — it's a
screen somebody adds later that reads a whole collection to draw one number.
That's what the house rules already forbid (*"no per-client queries in a
loop"*, *"every query names the studios it reads"*), and it's why those rules
are worth keeping even when they're annoying.

---

## How you'd know, before it hurts

Firebase Console → Usage shows daily document reads. Two numbers worth a glance
once a month:

- **Reads per day.** If it climbs faster than your client count does, something
  is scanning rather than querying.
- **The 2am spike.** Once that function is fixed, nights should be quiet. If
  they aren't, something else is scanning.
