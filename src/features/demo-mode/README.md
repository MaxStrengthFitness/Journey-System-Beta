# Demo Mode

**A real studio that everybody can enter, full of people who do not exist.**

Demo Mode is how a trainer learns the app without touching a client's record,
how a studio leader rehearses a Monday, and — tomorrow — how AJ shows the app to
his boss on the live Render URL without opening a real client's history in front
of him.

Round: **Demo Mode, Sep 20 2026** (branch `claude-experiment`). The design is
carried over from the retired `demo-mode-foundation` branch (Sep 6, tag
`archive/demo-mode-foundation`), which proved it and then fell 259 commits
behind. This is a rebuild against current `master`, not a merge.

---

## The one decision everything else follows from

**The demo studio is a real studio document, and demo data lives in the ordinary
collections.**

The alternative — a parallel set of `demo*` collections, or a client-side
fixture layer — was rejected on the earlier branch and is rejected again, for
the same reason: every screen in this app reads real collections scoped by a
studio id. A parallel store means a second code path through every screen, and a
second code path is a second thing to keep true. Within a month the demo would
be showing a version of the app that no longer exists.

So `studios/demo-studio` is a studio like Solon is a studio. The Journey grid,
the renewal pipeline, the attendance watch, Machine fit, Operations — all of it
works inside Demo Mode because none of it knows it is in Demo Mode.

What keeps it separate is not a wall around the data. It is three things:

1. **The id.** `demo-studio`, fixed, never generated. A fixed id makes the
   seeder idempotent (re-running updates the same documents rather than
   creating a second demo studio), lets every environment agree on what "the
   demo studio" means, and lets the Firestore rules name it as a literal
   without spending a document read on a lookup.
2. **`guards.ts`,** which blocks the two crossings in opposite directions.
3. **The Firestore rules,** which are the boundary that cannot be bypassed.
   `guards.ts` is the boundary that produces a readable English sentence
   instead of `PERMISSION_DENIED`.

## The two crossings, and why they fail differently

| Crossing | Example | What it costs | How it fails |
| --- | --- | --- | --- |
| Real data reached **from** Demo Mode | A trainer practising deletes a client, and it is a real one | Destroys something | **Throws** (`DemoBoundaryError`) |
| Demo data reaching **real** systems | Practice sessions in a studio's numbers; a demo client pushed to Mindbody | The numbers quietly stop being true | **Skips** (`skipsForDemo`) |

The second one is the more dangerous of the two in practice, because nobody
notices. It skips rather than throwing because a nightly job that threw on the
demo studio would take the real studios queued behind it down with it.

`isDemoRecord` checks **four** field names, not one — `studioId`,
`homeStudioId`, `hostedAtStudioId`, `clientHomeStudioId` — because the app
genuinely spells "the studio this belongs to" four different ways on documents,
and a guard that checked one of them would leak. A cross-train session names the
studio twice; either half makes it demo.

## The files

| File | What it is |
| --- | --- |
| `constants.ts` | The id, the name, the seed version, the email domain |
| `is-demo.ts` | Recognising demo: the four scope fields, `excludeDemo` / `onlyDemo` for the point where data leaves the app, `withDemoFlag` for the write |
| `guards.ts` | The two crossings above |
| `roster.ts` | Six clients and three trainers, each there to teach something |
| `demo-mode.test.ts` | 26 tests over all of it |

## The roster earns its place

A demo studio full of interchangeable people proves nothing. Between them these
six cover the whole app:

| Client | | Teaches |
| --- | --- | --- |
| Elanor Gardner | 72, 42 sessions | A long clean journey — the grid at its best |
| Hal Underhill | 58, rough sets | Mixed rep quality, the red kaizen mark, the machine note |
| Rosie Cotton | 68, **3 left** | The renewal conversation, and the pipeline |
| Milo Burrows | 45, 2 sessions | Brand new — first set-up, honest empty states |
| Esme Bolger | 81, **304 before Journey** | The migration: her profile must read 312, not "new" |
| Andy Roper | 54, **43 days away** | The attendance anomaly a leader catches on a Monday |

Esme is the most important client in the demo. She is
`docs/business/migration-and-prior-history.md` on one screen, and the answer to
"did we lose twelve years of records".

**Demo trainers get their own records** (AJ, Sep 20) rather than demo sessions
being coached by the real team. `trainers` is shared across studios and is not
studio-scoped, so a demo session coached by a real trainer would land on that
person's real career totals — with demo trainers, the rollups write to demo
trainer documents and the leak closes itself, with no Cloud Functions change.
It also means the studio-leader half of the app (Team, Staff & Roles, the
Overview's team panel) has somebody on it, which is exactly the half a studio
leader is being shown.

**The names** are a Lord of the Rings nod, and AJ's refinement (Sep 20) is that
it has to be *subtle*. Tolkien built the Shire's surnames out of real English
rural naming, so many of them are ordinary surnames: Cotton, Bolger, Burrows,
Gardner, Underhill, Roper, Hayward, Appledore, Fairbairn. Paired with plain
first names they read as normal clients to a stranger, while a reader quietly
notices. No Fellowship, nothing comic — a test enforces it.

Every email is `@demo.invalid`, a reserved TLD (RFC 2606) that can never route
anywhere. The app contacts nobody by design; this is the second lock on that
door.
