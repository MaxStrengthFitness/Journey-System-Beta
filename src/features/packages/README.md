# Packages — the screen a trainer turns toward the client

*Consultation round, build step 1 (Sep 24 2026). The proposal and mockup: "From a phone call to a commitment" (https://claude.ai/artifact/XBviGmcyLqzwiS1W5LjTbV); AJ's answers are in its comments and in `docs/business/packages-and-pricing.md`.*

Packages are not decided in the consultation. A prospect tries their free workouts first, and a long-standing client may have no package on file. So the packages screen opens from the **post-session screen** for anyone with no package on file, and later from the consultation's packages step. It reads the studio's own package table and adds no prices of its own.

## The files

| File | What it is |
| --- | --- |
| `package-table.ts` | The table read for a person deciding: per session, a week, each payment; paid in full as ONE payment; totals (the same sums as the Renewal Brief); "a longer commitment lowers every payment" only when this table shows it; once-a-week rows kept aside; the recommendation's starting length; the Academy's lowest-rate offer for the trainer notes; life happens in weeks; the dots. Pure. |
| `package-copy.ts` | Every sentence the screen says, with its source. Pure, and tested for what each sentence claims. |
| `package-standing.ts` | Should the post-session screen offer the packages, and what may it say about this client's package: has / away / ended / none / unknown. Pure; reads the client's Mindbody records with the engine's own `pickContracts` / `sessionBalance`. |
| `prices-state.ts` | Whether prices may be shown yet: never the defaults a refused read left behind, never the last studio's table after a switch. |
| `packages-view.ts` | The trainer's taps as a pure reducer (selection, recommendation, how the price is shown, how they pay, weeks away, days, the trainer-notes switch). |
| `booked-days.ts` | The weekdays of the client's coming bookings, in studio time. |
| `usePackagesDoor.ts` | What the post-session card shows, and whose table it reads. |
| `PackagesPanel.tsx` | The client's view, no dialog, so the consultation can mount it. |
| `PackagesTrainerNotes.tsx` | The trainer's view, never on screen with the client's. |
| `PackagesSheet.tsx` | The full-screen dialog the post-session screen opens. |
| `packages.css` | Codex kit tokens and scale only. |

## The decisions, and why

- **Nothing a trainer reads for themselves is on the client's view.** The trainer notes are a separate view behind a head button; the two are never on screen together (a render test checks the notes' words are absent until opened). The Academy's sales lines and the money fallbacks live there.
- **A price is shown only when it is this studio's.** `pricesState` checks no studio, a failed read, loading and "the table is for another studio" before anything with a dollar sign is drawn. A studio with no table of its own says "Max Strength's standard prices" (`hasOwnPackageTable`: a document that saved only a threshold still shows the standard prices).
- **Paying in full is one payment.** The third "Show the price as" pick becomes "Paid once"; "a week" in full is what the whole works out to, said as such; the every-4-weeks steps are hidden when paying in full.
- **Only claim what this table shows.** "A longer commitment lowers every payment" is checked (`lowersEveryPayment`): at least two lengths, all priced, all adding up, all the same visits a week, each longer one strictly cheaper every 4 weeks. The steps are drawn from the data regardless.
- **How often is worked out, never stored:** sessions per payment ÷ 4. Twice a week leads; a once-a-week row is the Academy's last option when money is the problem and waits in the trainer notes until the trainer puts it on the client's screen. A table with no twice-a-week package shows every row and says nothing about how often.
- **Weeks, not months.** The Trial is "6 months" and bills for 24 weeks; turning weeks back into months would print "5½ months" beside it. The package's own months is the only months figure.
- **Sessions never expire; auto-renew only where the studio said so** (AJ, Sep 24). `PackageTier.renewsAutomatically` is stored inside the package row (the rules don't inspect rows) only once a studio answers; the settings editor asks it per package.
- **The recommendation starts on 12 months** (AJ: "allow the trainer to recommend one but auto default to 12"), is the trainer's own ("Sam's recommendation"), never "most popular", and is held on screen only.
- **The guarantee:** the money-back covers monthly payers (AJ); the six-months-at-another-gym half does not (AJ, Sep 24: "does not guarantee monthly payers"), so it says "when you pay in full"; "upgrade", never "move" (a downgrade is a refund question nobody has answered).
- **Who is offered the packages** (`package-standing.ts` header): only "none" says there is no package, and it says when Mindbody was checked. Prices appear on the post-session screen itself only for a client whose whole story Journey holds (coverage complete) or a temporary profile; everyone else gets the door and the prices wait in the sheet. A long-standing client is never shown a price list because a record looks empty.
- **Whose table:** the client's home studio (the nightly job prices them against it), falling back to where the session was hosted.

## Not done yet

- **The Academy's script** still says "we no longer bill you or auto renew you" and 30/60/90 days for leftover sessions. AJ decided on Sep 24 that the Academy stays as it is; the packages screen and the business docs carry the current rules.
- **Per-studio money-fallback notes** ("set per studio" in AJ's answer): today the notes are the company's words plus the studio's own numbers. A studio-written list would be a new top-level field in `config/renewals`, which the rules allow only after a rules change.
- **The recommendation is not saved.** It will live on the consultation record (`studios/{s}/consultations/{id}`, build step 2, which needs AJ's Firestore OK).
- **Outcomes and the Brief compare packages by months only** (`outcomes.ts` renewalKind, `options.ts` upgradeVerdict), so a once-a-week row would read as "upgraded" from a shorter twice-a-week one. The packages screen never asks a leader to add one; if a studio does, those two want a frequency check.
