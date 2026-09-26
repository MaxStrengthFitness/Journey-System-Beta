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

and, right after (word for word):

> i got confirmation, the corporate studios do not have auto renewal on but franchise studio do. i believe studios will have the ability to turn auto renewals off if they want but its auto default on

**Confirmed:** the corporate studios do not auto-renew; the franchise studios
do. **AJ's belief, not yet confirmed:** every studio can turn auto-renewal off
if it wants, and it is on by default. So auto-renewal is treated as a **studio
policy, on by default**, which a studio (a corporate one) turns off; a package
may say otherwise; and a trainer can mark one client on the profile.

## The order — decided in one place

`src/features/renewals/auto-renew.ts`, `decideAutoRenew`. The first that
answers wins:

1. **Nothing running or coming** (paid in full, banked sessions, no package),
   or **a coach's lock on the profile that says paid in full or banked
   sessions** (`client.contractTierOverride`): no answer. Nothing bills, so
   nothing renews. The lock beats even Mindbody's flag: it is there because
   Mindbody's reading is wrong for her.
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
| `autoRenewMark` `{ renews, contractId, setAt, setById, setByName }` | `clients/{id}`, top level — never inside `renewal` | the codex record form only (Account → the package → **On auto-renewal**), with the Auth uid; `null` from "Remove this mark". No sync names it | the renewal engine (nightly and live), `renewalOf`, the package card |
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
  2026."; "Remove this mark" clears it, and before Save says where that goes
  back to ("Back to the package's answer", "the studio's answer", "the
  standard answer", or "no answer"). Where Journey can't tell (Mindbody
  hasn't said and the package isn't matched), the box is a pair, "On
  auto-renewal" and "Not on auto-renewal", neither pressed until one is
  picked. Under it: "This tells Journey's renewal screens what Mindbody is set
  to. It doesn't change her billing: auto-renewal itself is changed in
  Mindbody." A reader who may not change the record (a cross-train studio)
  gets the answer in words. No box for paid in full, banked sessions, or a
  paid-in-full or banked-sessions lock (staged or saved), and under such a
  lock no screen says "Auto-renews".
- **"Payments finish"** now survives only for an unmatched package, under a
  coach's paid-in-full or banked-sessions lock over a contract Mindbody still
  shows running, and for a snapshot from before the first nightly run. At a
  studio left ON (and every
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
| Suite | 5,584 passing in 349 files after the review's fixes, 5,575 before them (`TZ=America/New_York npx vitest run --dir src`, on AJ's PC) — 5,494 in 344 on `loose-ends-sep26` before |
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
   panel itself flag a studio that hasn't answered. `ship-lean-sync.ps1
   golive` does not ask for this; it prints it as its last line, after the
   push.
3. Until the first nightly run, the box says "Auto-renewal can be marked here
   after tonight's renewal run" on every client.
4. The first nightly run rewrites every client's snapshot once (version 2).
   Outcomes are untouched.
5. The next morning, spot-check one franchise client and one corporate client
   on the Renewal card and on the package card.

## The review's fixes (round 1)

- **A paid-in-full or banked-sessions lock claims no renewal.** The box hid
  under such a lock, but the decision ignored it, so the card, the header
  chip and post-session said "Auto-renews" under "paid in full" with nothing
  to untick. The lock is now step 1 of the order (`lockSaysNothingBills`), in
  the engine, in `renewalOf` and in the package card with the form's lock, so
  a lock staged to come off shows the answer it will have. The answer without
  the lock is still stored (`autoRenewsInherited`), so taking a lock off shows
  the right answer at once.
- **"Remove this mark"**, not "Use the studio's answer": the answer a cleared
  mark goes back to may be the package's, the standard, or none. The staged
  sentence names it in the Brief's words.
- **Where Journey can't tell, two answers, not one unticked box.** An
  unticked box read as "no" (and announced "not pressed") while saving
  nothing. Now "On auto-renewal" and "Not on auto-renewal" sit side by side,
  neither pressed until one is picked.
- **"Out of sessions around Oct 3, 6 weeks before it renews"**: the
  will-run-out sentence follows the decided answer ("before billing ends",
  "before the payments finish"), so it never says "billing ends" under
  "Auto-renews".
- A test pins today's Mindbody flag over last night's Mindbody answer.
- AJ's second message is quoted word for word, and the business docs keep
  "confirmed" apart from "AJ believes". The lean-sync round points up to its
  shipping step, and `golive` prints it.

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
   "Remove this mark" clears it. OK?
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
11. The words: "On auto-renewal"; "Not on auto-renewal"; "Remove this
    mark"; "Packages at {studio} renew automatically"; "the standard answer
    (the studio hasn't set one)"; "It doesn't change her billing:
    auto-renewal itself is changed in Mindbody."
12. Can every studio really turn auto-renewal off in Mindbody? You said you
    believe so; the round assumes it (a studio's answer is Yes or No).
13. A coach's paid-in-full or banked-sessions lock now means "no answer",
    even where Mindbody's contract says it auto-renews (the lock is there
    because Mindbody's reading is wrong for her). The before-the-charge
    warning it had before this round stays on. OK, or should the lock also
    turn that warning off?
