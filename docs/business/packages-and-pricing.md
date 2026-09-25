# Packages and pricing

Sources: the Max Strength Fitness package page (maxstrengthfitness.com/package-information/, as shown on Sep 10 2026), AJ on Sep 10 2026, and two Mindbody screenshots AJ sent on Sep 11 2026. **Pricing can vary by location** — the app keeps a price table per studio rather than hard-coding these numbers.

## The three packages

Clients commit to 6, 12 or 18 months. Session counts assume training twice a week, which is what the studio recommends for results.

| Package | Commitment | Sessions | Rate per session | Payment every 4 weeks | Prepay rate per session |
| --- | --- | --- | --- | --- | --- |
| The Trial | 6 months | 48 | $70 | $560 | $67 |
| Committed | 12 months | 96 | $60 | $480 | $57 |
| Life Transformed | 18 months | 144 | $54 | $432 | $51 |

The website marks Committed "most popular". The app never does: nothing it holds can back the claim, and the packages screen shows the trainer's own recommendation instead (below).

- **Billed every 4 weeks.** Clients can pay monthly or prepay the whole package at the lower prepay rate. **Auto-renewal is not everywhere** (AJ, Sep 24 2026: "auto renew isn't on everywhere but some studios do have it"): each studio says, per package, whether it renews by itself when the payments finish (My Studio → Studio → Renewals, "When the payments finish"). The website's "auto-renewal upon completion" is one studio's answer, not the company's.
- Every package is advertised with **"Get 2 free workouts!"**
- **"Double Transformation Guarantee"**:
  1. A 30-day satisfaction guarantee: no questions asked, 100% money back. **It covers monthly payers too** (AJ, Sep 24 2026), though the website still marks it as a prepay benefit.
  2. If a client shows up consistently twice a week, gives 100% effort and is not 100% happy with their progress, the studio buys them 6 months at any other gym. **It does not cover monthly payers** (AJ, Sep 24 2026: "does not guarantee monthly payers"); the packages screen says "when you pay in full".
- **Upgrading:** within the first 30 days, or at renewal, a client can upgrade to any other package, however they pay (AJ, Sep 24 2026; the Academy's consultation script). The contract change, and any credit, is done in Mindbody.
- **What uses a session:** coming in, or cancelling with less than 24 hours' notice (AJ, Sep 24 2026: "You only lose a session if you cancel within 24 hours"). Time away does not.

## What the numbers imply

Worked out from the table above — confirm against the contract templates in Mindbody before building on them:

| Package | Payments | Billing runs | Sessions per payment | Total, monthly | Total, prepaid |
| --- | --- | --- | --- | --- | --- |
| The Trial | 6 | 24 weeks | 8 | $3,360 | $3,216 |
| Committed | 12 | 48 weeks | 8 | $5,760 | $5,472 |
| Life Transformed | 18 | 72 weeks | 8 | $7,776 | $7,344 |

A "12-month" package bills for 48 weeks, roughly 11 calendar months, when the client keeps the twice-a-week pace.

## Sessions never expire

AJ, Sep 10 2026: unused sessions are never lost. A client who takes a month off for surgery keeps that month's sessions, even on a month-to-month payment. **Confirmed for every studio on Sep 24 2026** ("sessions don't expire"). The Academy's consultation script still says 30, 60 or 90 days to use leftover sessions and "we no longer bill you or auto renew you"; both lines are out of date, and AJ decided on Sep 24 to leave the Academy as it is. This page and the packages screen carry the current rules. This is generous and it creates the studio's biggest renewal headache:

- A client who averages 1.5 visits a week takes about 64 weeks — nearly 15 months — to use a Committed package that bills for 48.
- Where a contract auto-renews, it renews when the **payments** finish, not when the **sessions** do, so the client is charged for a new package while still holding sessions from the old one.
- Cards also decline, which interrupts billing. **Out of scope for now** (AJ, Sep 11 2026): the app shows Mindbody's autopay status and nothing more.

See [renewals.md](renewals.md) for how the studio wants to get ahead of this.

## Savings when a client moves up

The talking points for "the more you commit, the more you save":

| Move | Per session | Every 4 weeks | Over the longer package |
| --- | --- | --- | --- |
| The Trial → Committed | $10 less | $80 less ($560 → $480) | $960 less over 96 sessions |
| Committed → Life Transformed | $6 less | $48 less ($480 → $432) | $864 less over 144 sessions |
| The Trial → Life Transformed | $16 less | $128 less ($560 → $432) | $2,304 less over 144 sessions |

Prepaying Life Transformed ($7,344) costs $1,296 less than 144 sessions at the Committed monthly rate ($8,640).

The second column matters most: **a longer commitment lowers every payment.** Price is the number-one reason clients give for leaving, so that is the line that answers "can I afford this."

## How a package looks in Mindbody

From AJ's screenshots, Sep 11 2026:

| Client | What their Mindbody account shows |
| --- | --- |
| Paid in full | One **pricing option** named for the package, such as "144 PIF": a count (144), a remaining number (for example 109 of 144 left), and an expiry date |
| Paying monthly | A contract that bills every 4 weeks, plus a new pricing option with **each payment**: "48 Sessions - 2X Week", **8 sessions each** |
| Complimentary sessions | Their own pricing option, "Session Comp" (2 sessions). They count toward sessions left, but they aren't a package |

So **sessions left = the sessions on hand (pricing options) + 8 for each payment still to come.** That is how the renewals engine counts them (`src/features/renewals/engine.ts`).

Names differ by location. Each studio matches its own Mindbody names to its packages in **My Studio → Studio → Renewals** (Operations → Renewals says how many names are waiting and points there); the nightly job lists every name it met there, with a count of clients. Until a name is matched, those sessions aren't counted, and the client shows up under "Missing Mindbody data".

Still open: whether a "12-month" package really bills 12 times. The settings default to 6 / 12 / 18 payments, and each studio can change them.

## The packages screen (Sep 24 2026)

The screen a trainer turns toward someone who hasn't chosen a package (`src/features/packages/`, its README has the detail). Packages are not decided in the consultation, so it opens from the **post-session screen** for a client with no package on file, and later from the consultation's own packages step. What AJ decided for it:

- **The recommendation** is the trainer's own ("Sam's recommendation"), starts on the 12-month package (the Academy's middle option) and can be moved or cleared in the trainer notes. Never "most popular". Nothing is saved: the consultation record, when it exists, will hold it.
- **Money fallbacks are trainer notes**, never on the client's view, in this order: the guarantee (the big one), the lowest rate on the shortest commitment (on the standard table, $54 a session on The Trial, 6 payments of $432), once a week (only when the studio's table has a once-a-week package, which is any row with 4 sessions a payment), then a few more sessions (extra free workouts before deciding, or bonus sessions added to a package; in Mindbody, the "Session Comp" pricing option).
- **After the last payment:** sessions never expire; the package renews automatically only where the studio said so, and otherwise "your studio will explain what happens when your payments finish"; the trainer talks with the client about what comes next before the last payment.
- **Prices are each studio's own table.** A studio that hasn't saved one shows "Max Strength's standard prices" (this page's table). A table the screen can't stand behind (payments that don't multiply out, a package with no price) is flagged in the trainer notes and the figure is left off, never guessed.
