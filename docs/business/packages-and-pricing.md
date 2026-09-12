# Packages and pricing

Sources: the Max Strength Fitness package page (maxstrengthfitness.com/package-information/, as shown on Sep 10 2026), AJ on Sep 10 2026, and two Mindbody screenshots AJ sent on Sep 11 2026. **Pricing can vary by location** — the app keeps a price table per studio rather than hard-coding these numbers.

## The three packages

Clients commit to 6, 12 or 18 months. Session counts assume training twice a week, which is what the studio recommends for results.

| Package | Commitment | Sessions | Rate per session | Payment every 4 weeks | Prepay rate per session |
| --- | --- | --- | --- | --- | --- |
| The Trial | 6 months | 48 | $70 | $560 | $67 |
| Committed (most popular) | 12 months | 96 | $60 | $480 | $57 |
| Life Transformed | 18 months | 144 | $54 | $432 | $51 |

- **Billed every 4 weeks, with auto-renewal on completion.** Clients can pay monthly or prepay the whole package at the lower prepay rate.
- Every package is advertised with **"Get 2 free workouts!"**
- **"Double Transformation Guarantee"** (marked on the page as a prepay benefit — confirm whether it also covers monthly payers):
  1. A 30-day satisfaction guarantee: no questions asked, 100% money back.
  2. If a client shows up consistently twice a week, gives 100% effort and is not 100% happy with their progress, the studio buys them 6 months at any other gym.

## What the numbers imply

Worked out from the table above — confirm against the contract templates in Mindbody before building on them:

| Package | Payments | Billing runs | Sessions per payment | Total, monthly | Total, prepaid |
| --- | --- | --- | --- | --- | --- |
| The Trial | 6 | 24 weeks | 8 | $3,360 | $3,216 |
| Committed | 12 | 48 weeks | 8 | $5,760 | $5,472 |
| Life Transformed | 18 | 72 weeks | 8 | $7,776 | $7,344 |

A "12-month" package bills for 48 weeks, roughly 11 calendar months, when the client keeps the twice-a-week pace.

## Sessions never expire

AJ, Sep 10 2026: unused sessions are never lost. A client who takes a month off for surgery keeps that month's sessions, even on a month-to-month payment. This is generous and it creates the studio's biggest renewal headache:

- A client who averages 1.5 visits a week takes about 64 weeks — nearly 15 months — to use a Committed package that bills for 48.
- The contract auto-renews when the **payments** finish, not when the **sessions** do, so the client is charged for a new package while still holding sessions from the old one.
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

Names differ by location. Each studio matches its own Mindbody names to its packages in **Operations → Renewals → Settings**; the nightly job lists every name it met there, with a count of clients. Until a name is matched, those sessions aren't counted, and the client shows up under "Missing Mindbody data".

Still open: whether a "12-month" package really bills 12 times. The settings default to 6 / 12 / 18 payments, and each studio can change them.
