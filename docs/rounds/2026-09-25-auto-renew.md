# Auto-renewal: the studio's answer and the box on the profile — Sep 25 2026

Branch `auto-renew-checkbox`, off `lean-sync` at `1ccb5d7`. One commit per
phase, each typechecked on its own so it can be reverted alone. Not pushed;
not deployed.

## What AJ said

On `lean-sync`, the renewal screens say "Auto-renews" only where Mindbody's own
per-contract flag says so, and "payments finish" (with the before-the-charge
warning still on) where it hasn't said. Asked whether that gap should fall back
to the studio's per-package answer, AJ answered:

> just allow trainers to mark a check box on a profile if the client is on auto renewal

and, right after:

> the corporate studios do not have auto renewal on but franchise studios do. Studios will have the ability to turn auto renewals off if they want, but it's default on

So auto-renewal is a **studio policy, on by default**, which a studio (a
corporate one) turns off; a package may say otherwise; and a trainer can mark
one client on the profile.

## The order — decided in one place

`src/features/renewals/auto-renew.ts`, `decideAutoRenew`. The first that
answers wins:

1. **Nothing running or coming** (paid in full, banked sessions, no package):
   no answer. Nothing bills, so nothing renews.
2. **Mindbody's own flag on the contract** (`isAutoRenewing`, written only by
   the webhook). Mindbody owns contracts.
3. **A trainer's mark on the client's profile, for THIS contract**
   (`client.autoRenewMark`).
4. **The contract isn't matched** to a package in Renewal settings: no answer.
5. **The package's answer** (`renewsAutomatically` on the package row).
6. **The studio's answer** (`packagesRenewAutomatically`, My Studio → Studio →
   Renewals).
7. **The standard: ON** (`STUDIO_AUTO_RENEW_DEFAULT`), for a studio that never
   answered.

The nightly job, the live Renewal card and Brief, the profile, the packages
screen and every single-client screen go through it, so they cannot disagree.

**Why a mark is bound to its contract.** Auto-renew belongs to a contract. A
mark carried onto her next contract would silently switch off that contract's
"before the charge" warning. On a new contract the box goes back to the
inherited answer and says "AJ's mark was for the contract before this one".

**Why an unmatched package gets no default.** "Packages at {studio} renew" is a
claim about the studio's OWN packages. A contract the table doesn't recognise
could be anything; a confident wrong answer is worse than a missing one. It
keeps saying "payments finish" until it is matched in Renewal settings, or
someone marks it.

**Why Mindbody still wins.** Mindbody owns contracts. Where it has said, the
profile shows its answer in a line ("Change it in Mindbody") and no box.

## The three new fields, and who writes them

| Field | Where | Written by | Read by |
| --- | --- | --- | --- |
| `autoRenewMark` `{ renews, contractId, setAt, setById, setByName }` | `clients/{id}`, top level — never inside `renewal` | the codex record form only (Account → the package → **On auto-renewal**), with the Auth uid; `null` from "Use the studio's answer". No sync names it | the renewal engine (nightly and live), `renewalOf`, the package card |
| `packagesRenewAutomatically` (boolean; absent = not answered = ON) | `studios/{s}/config/renewals` | My Studio → Studio → Renewals, the studio's leaders | the engine, the packages screen, the settings panel, Operations → Renewals |
| `autoRenews` (now the decided answer), `autoRenewsFrom`, `autoRenewsInherited` | `clients/{id}.renewal`, engine version 2 | the nightly job only | every renewal screen; the box shows `autoRenewsInherited` until someone marks her |

`autoRenewMark` is an **object**, not a boolean: the record form counts `false`
as "nothing", so an untick over an empty field would never be saved
(KNOWN-TRAPS → The client profile).

## What changes on screen

- **My Studio → Studio → Renewals** gains a first panel, **Auto-renewal**:
  "Packages at {studio} renew automatically" — Yes / No, and "Yes — the
  standard, not confirmed yet" only while the studio hasn't answered. While
  unanswered it warns: "{studio} hasn't answered yet, so its packages read as
  renewing automatically. The corporate studios don't auto-renew: if {studio}
  is one of them, choose No and save." Switching to No explains what it does.
  Each package's blank option now reads "Same as the studio (renews)" or
  "(doesn't renew)".
- **Operations → Renewals** turns its settings notice into a warning while the
  studio hasn't answered, and its "Open My Studio" button is the way there. It
  is a door, not a second editor.
- **The profile's package card** (Notes & Profile → Account): the **On
  auto-renewal** box. It starts on the inherited answer and says where it came
  from ("Westlake's packages renew automatically, so this starts ticked. Untick
  if she isn't on auto-renewal."; "Westlake hasn't said whether its packages
  renew by themselves. The standard is yes, …"). A tap is staged on the Save
  bar ("Account · Membership"); a saved mark reads "Marked by AJ · Sep 25,
  2026."; "Use the studio's answer" clears it. Under it: "This tells Journey's
  renewal screens what Mindbody is set to. It doesn't change her billing:
  auto-renewal itself is changed in Mindbody." A reader who may not change the
  record (a cross-train studio) gets the answer in words. No box for paid in
  full, banked sessions, or a staged paid-in-full lock.
- **"Payments finish"** now survives only for an unmatched package and for a
  snapshot from before the first nightly run. At a studio left ON (and every
  studio until it answers), screens that said "payments finish" say
  "auto-renews".
- **The package card says "Auto-renews"**, not "Renews", like every other
  screen.
- **At a studio switched OFF**, a contract Mindbody hasn't flagged loses
  "Before the charge": its sessions still bank, and the renewal conversation
  comes at the usual sessions-left point.
- **The packages screen** tells a prospect the same answer — the package's,
  else the studio's, else yes — and the paid-once view never says a package
  renews.
- **The Brief and the Renewal card** name the source beside the charge date
  ("Nov 14 · the studio's answer", "marked on the profile", "the standard
  answer (the studio hasn't set one)").
- **The directory** says "Auto-renews" for an unknown count only on Mindbody's
  answer or a trainer's mark, never on a default.

## Live, and what catches up tonight

**Live at once** (they read `renewalOf(client)`, or work the renewal out live):
the box and the package card, the profile header's chip and its dot, the
post-session prompt, the briefing and its renewal line, the Hub card's
"Renewal due", the progress-report cue, the Overview's Account slot, the
Renewal card and the Brief, the packages screen.

**Tonight** (they read the stored snapshot): the Operations pipeline and
Overview, Relay's cohorts, My renewals, the renewals lane and the directory.

Known lags:

- The box's inherited answer is last night's; the Renewal card is live. After
  a studio changes its answer, the box says the old one until tonight.
- `renewalOf` only ever turns a warning OFF. Turning one ON needs the studio's
  warning window, which the snapshot doesn't carry, so it waits for the night.
- A box ticked on a duplicate record is not carried across by
  `scripts/merge-duplicate-client-records.ts`.
- Suspended autopay stays a flag; it doesn't change the answer (open question).

## Measured

| | |
| --- | --- |
| Typecheck | 4 (baseline) |
| Suite | 5,575 passing in 349 files (`TZ=America/New_York npx vitest run --dir src`, on AJ's PC) — 5,494 in 344 on `loose-ends-sep26` before |
| Rules tests | 168 passing on the local emulator (162 before); AJ's `npm run test:rules` is the one that counts |
| Build | green; the nightly renewals job bundles with the new engine |
| Case duplicates | none |

`ClientProfileView` and `ClinicalHistoryTab` have no render test. Their change
is one pure call (`renewalOf`), covered by `auto-renew.test.ts`.

## Shipping notes, in order

1. **The rules deploy first.** `renewalSettingsValid` checks the whole merged
   document: under the old rules the first save of the studio's answer is
   refused, and once it is stored every later renewal-settings save at that
   studio would be. `lean-sync`'s `golive` stage already deploys the rules
   before the push.
2. **The same day, right after the push and before that night's renewals
   run**, a leader or an administrator opens **My Studio → Studio → Renewals**
   at each **corporate** studio (AJ names which), sets "Packages at {studio}
   renew automatically" to **No**, and saves. Operations → Renewals and the
   panel itself flag a studio that hasn't answered.
3. Until the first nightly run, the box says "Auto-renewal can be marked here
   after tonight's renewal run" on every client.
4. The first nightly run rewrites every client's snapshot once (version 2).
   Outcomes are untouched.
5. The next morning, spot-check one franchise client and one corporate client
   on the Renewal card and on the package card.

## Undo

Rolling back the app alone is safe: the app before this round drops the
studio's key when it reads the settings, and ignores `autoRenewMark`. **Do not
roll `firestore.rules` back** to before this round while any studio has
`packagesRenewAutomatically` stored — its renewal settings could no longer be
saved — or first delete the key from each `studios/{s}/config/renewals`.

## Open questions for AJ

1. Which of the four studios (Westlake, Strongsville, Willoughby, Solon) are
   the corporate ones? Each is switched to No on go-live day.
2. A mark belongs to the contract it was made on; on her next contract the box
   goes back to the studio's answer. OK?
3. Every tick or untick is kept for that client, even when it matches the
   studio's answer, so a later change of the studio's answer won't move her.
   "Use the studio's answer" clears it. OK?
4. Mindbody's own answer beats a trainer's mark, and the profile then shows a
   line instead of a box. Agreed?
5. Paid in full never renews by itself. The paid-once view on the packages
   screen still says "Payments end · week 48" (from before this round). Own
   wording for paid in full?
6. At a studio switched off, a contract Mindbody hasn't flagged no longer gets
   "Before the charge"; at a studio left on, "payments finish" becomes
   "auto-renews"; an unmatched package keeps "payments finish". OK?
7. Suspended autopay: count it as "not renewing", or keep it a flag?
8. Franchise owners can already change any studio's renewal settings,
   including a corporate studio's new answer (an existing rule). Keep that?
9. This adds two stored fields and one key to a Firestore rule (CLAUDE.md asks
   for an explicit OK on a Firestore structure change). OK to ship?
10. Ship it with `lean-sync`, or as its own release after it?
11. The words: "On auto-renewal"; "Packages at {studio} renew automatically";
    "the standard answer (the studio hasn't set one)"; "It doesn't change her
    billing: auto-renewal itself is changed in Mindbody."
