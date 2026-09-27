# The Client Directory

*Directory round, Sep 27 2026 — `docs/rounds/2026-09-27-directory-and-opportunities.md`. Design: research-directory Direction A (the smart table), run on Direction C's engine, with Direction B's lenses as the view chips.*

AJ called the old screen "a sad list". What he wants from it, in his words: "when they are in next, when they were in last, how many sessions they have left", sortable — "search Nancy and then sort by last seen and then know which Nancy was here last of all Nancys" — and to ask the roster questions ("all our nurses, female clients over 60, everyone who's five foot six"). This folder is that screen and the engine under it.

## Files

| File | What it is |
| --- | --- |
| `row.ts` | **One row per client**: what every cell says and the key it sorts by. `prepareDirectory` indexes the held bookings and the last day's sessions once; `buildDirectoryRow` / `buildDirectoryRows` do the rest. Pure |
| `buckets.ts` | The sorts, their words ("Last in: most recent first"), and the sections each sort breaks the list into. Unknowns always last, ties by the name she goes by. Pure |
| `search.ts` | The one name matcher: normalisation, the nickname table (read both ways), tiers, labelled close matches, bold ranges. Pure |
| `tokens.ts` | Descriptions become removable filters ("female nurses over 60", "5'6"), with "not on file" counts and ambiguity reporting. Pure |
| `views.ts` | All · Mine · Kaizen · In today, the Mine definition, and the sort remembered per trainer on this iPad |
| `ClientDirectory.tsx` | The screen (lazy, view id `client-directory`) |
| `client-directory.css` | Its stylesheet, prefix `cd-`, colour from `equipment.tokens.css` |
| `fixtures.ts` | Test fixtures (a fixed Sunday in Ohio). Imported by tests only — including `hub-opportunities` |

## The rules it keeps

- **A failed or stale read is unknown, never a fact.** Every cell has four states — known, none, unknown, and (for Last in) Before Journey — and every Unknown carries its reason in words, shown on a tap (never on hover).
- **Last in** is the latest day ANY record gives: today's finished Journey session (with its trainer), `lastSessionDate` (read as a studio day — a date-only string is never handed to `new Date()`), the nightly record's `renewal.lastVisitDate`, and the last machine-setting day. With no day at all it follows the migration rule: a prior record, or partial coverage, is **Before Journey** (with "FileMaker record to Aug 2026" when the record says so); a client whose whole story is in Journey, or one the nightly record looked at, is **Nothing recorded**; anyone else is **Unknown**. "with Mike" appears only when a booking the app holds for that exact day says so.
- **Next** is the held bookings (about 8 days, `useLiveSchedule`) matched by `clientId` only, never by name; then the nightly record's `nextBookingDate` beyond them ("as of last night"); then **"Nothing booked · next 8 days" only while the bookings were read in the last two hours** (`BOOKINGS_FRESH_MS`). Stale or unread, it is **Unknown** with when they were last read. A client whose home is another studio is Unknown here unless she is booked here — her own studio's bookings are not read on this iPad.
- **Left** is `sessionsSplit` with the studio's own package table — the profile header's exact pair ("36 left", "+12 extra"; "5 on hand" for a contract paid by the month). **Never "0" when unread**: no pull from Mindbody, the table not loaded, or a visitor whose home studio's table this iPad doesn't read are all Unknown.
- **Total** is `client.sessionCount` (the prior-history arithmetic's stored result, with `totalSessions` adding the prior record when the count has not taken it in yet), shown **only when `canQuoteSessionNumber`** — the Hub card's gate. A migrating client is never "new", "#1" or a low Journey count.
- **Client since** only from a date that proves it (`resolveClientSince` with her coverage); "In Journey since" sorts with Not on file.
- **Age** only with a birth year (`ageAndBirthday`); a decade birthday within the week says "Turns 80 Thursday".
- Names are never truncated (`First "Nickname" Last`, wrapping); rows are 64px or more; nothing tappable under 40px; no red anywhere on the screen; tokens only.

## Search

Tiers, best first: exact (first, nickname, last) → start of first name or nickname → start of last name → nickname alias (both ways: judy ↔ judith) → close match (edit distance 1 for five letters or fewer, 2 for longer — only when nothing else matched, and labelled "No exact match. Close matches:"). "nancy b" is a first name AND a last-name start, in either order; spaces and punctuation don't count ("mc donald", "obrien"). In the directory the **sort** orders the results, not the tier ("search narrows, sort orders"); `compareTier` is there for a quick-find that ranks.

The alias table is `NICKNAME_GROUPS` in `search.ts` — curated, not transitive ("nan" finds Nancy; "nancy" also finds Anne; "nan" does not find Anne). Add a pair there.

## Reads

None per client, ever. The rows ride on what AppContent already streams — the studio roster (`useStudioRoster`), the held bookings, the last day's sessions, the trainers and the studios — plus **one small document**: the studio's package table (`useRenewalSettings`, `studios/{s}/config/renewals`), the same read the profile makes, so Left says the profile's number. "All my studios" keeps the old screen's query path exactly: the two name-prefix queries scoped by `queryStudioIds`, only when a name is typed. The old unordered `limit(100)` Last Session query is gone.

## Deliberately out of scope (and why)

- **Note marks** (a dot for an open note you haven't marked off). Doing it honestly for 300 rows needs a roll-up on the client document (`openThreads`) — a Firestore structure change that needs AJ's OK. The seam is the `marks` prop (a map of client id → `DirectoryMark`); it defaults to none and the gutter column is not even drawn. **Do not add a per-client query to fill it.**
- **Every-studio search** (and Admin → Clients folded in): needs `searchPrefixes` on the client document (structure change) and per-studio queries.
- **The header quick-find popover** and retiring the Hub's search cards: next round, on this engine (`searchNames`, `compareTier`).
- **Save view**, **"Find clients like…"**, Last-in / Next / Left / trainer tokens, the A–Z scrub strip, the landscape detail pane, collapsing the header while the keyboard is up.
- **Mindbody id search** and searching `mindbody_name`: not in the first version.
- **The sort following the trainer across iPads** needs the trainer document (a structure change); it is local storage per trainer, which a sign-out clears (`features/sign-out`), so it lasts while they are signed in on that iPad.

## Known limits

- The other-studios query is the old one: Firestore's prefix is case-sensitive on the stored name, so "mcd" is asked as "Mcd" and misses "McDonald" at another studio; nickname aliases do not widen it (typing "bob" asks for "Bob…", not "Rob…"). This studio's search has neither limit — it is all on the iPad.
- "Mine" is Relay's rule (`isMyClient`: the nightly record's coachIds — 60 days — or any session logged in Journey, or her top trainer), plus the nightly `primaryTrainerId` (90 days), anyone booked with you in the held bookings, and your Kaizen Roster. The research asked for "the last 90 days"; the data can say 60, or ever in Journey — the line under the chip says exactly what it is.
- A typed `client.age` is not used: it goes stale by a year every year. Only a date of birth gives an age.
- `src/lib/directory-row.ts` has no reader since this round (it read `renewal.sessionsLeft`, which counts extras and disagreed with the profile). Delete it, or fold its membership label into a Package column, when a Package column is wanted.
