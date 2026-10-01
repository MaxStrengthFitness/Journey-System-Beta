# Renewals and retention

Source: AJ, Sep 10 2026. The build plan that implements this is `OPERATIONS-RENEWALS-PROPOSAL.md` in the repo root.

## Why it matters

The studio wants clients to see that every session is worth what they pay, because the studio is committed to their data and progress. The goal is to stop reacting to cancellations and get ahead of renewals.

## How renewals happen today

- Trainers try to start the renewal conversation **about 10 sessions before the end**. It isn't systematic yet.
- **Trainers ask.** Head trainers and studio leaders get involved when the client has concerns about **price or progress**.
- Warnings about upcoming renewals come from Mindbody reports, which are hard to use.

## What goes wrong

- **The auto-renew charges before the sessions are used** — at the studios that have auto-renew on: the franchise studios, and by default; the corporate studios have it off (AJ, Sep 24 and 25 2026). Sessions never expire, so breaks, surgery or a 1.5-visits-a-week habit stretch a 12-month commitment to 14 months or more — and the next package is charged while sessions are still banked. AJ: "it's a big issue, so if studio leaders could be ahead of that it would be awesome."
- **Cards decline**, which interrupts billing.

## Why clients leave or hesitate

- **Price** is the biggest concern.
- Most clients are on the 12-month package. Clients resist 18 months because they worry they won't want to keep going, or won't see the progress they want, or they overestimate what the commitment means.
- They "just want to be healthy, not a body builder," so a big commitment feels intimidating — but 18 months is what the studio needs most.

So the renewal conversation should lead with health (InBody, sleep, energy, pain, consistency) and with the math that a longer package **lowers every payment** (see [packages-and-pricing.md](packages-and-pricing.md)).

## What the studio wants from the app

- **Studio leaders get ahead of renewals** — especially clients whose auto-renew will charge while sessions are still banked.
- **Trainers log the client's thinking:** who talked to them, how they feel, what they are on the fence about. A head trainer or studio leader can then open the client and know whether anyone has talked to them and how to react.
- **Each studio customizes its own timing:** when the conversation starts, how early to warn before a charge, and what counts as a lost client (lapsed for how long, whether pay-as-you-go counts, returning snowbirds).
- **Per-trainer renewal rates are for studio leaders only.**
- **No outreach.** The app never contacts a client; it prepares the people who do.

## How the app handles it (built Sep 10–11 2026)

Every client gets a **renewal snapshot** each night: both clocks (billing and sessions) and one situation — on track, will bank, will run out, away, ended, lapsed, or not enough Mindbody data. It shows as a sentence, never a score. Details: `src/features/renewals/README.md`.

- **Trainers** see it on the client's profile, in the pre-session briefing, on the Hub and under "My renewals". The Wrap-up (the post-session screen) asks "Renewal: 9 left. Talk about it today?" when it's time, and a 15-second form logs how the client is leaning and what they're unsure about.
- **Leaders** work from Operations → Renewals:
  - **Pipeline:** before the charge, talk now, coming up by month, lapsed, and away.
  - **Renewal Brief:** one screen per client, health first.
  - **Outcomes:** what happened to the packages that closed each quarter.
  - **Settings** — when to talk, the package table, and name matching — are on **My Studio → Studio → Renewals** (since the Operations round, Sep 19 2026); Operations → Renewals says how many Mindbody names are waiting to be matched and points there.
- **Outcomes** are recorded overnight when Mindbody shows the answer:
  - A newer package means **renewed**, **upgraded** or **downgraded**, judged by commitment length.
  - The studio's lost rule means **lost**.
  - **Pay-as-you-go** is recorded by a leader in the Brief.
  - A leader's outcome is never overwritten.
  - A renewal already signed in Mindbody counts the night it appears, and the client stops being prompted.
- **Per-trainer rates** show only in Outcomes, only to leaders, only from 5 outcomes, and are labeled context, not a verdict.
- **Whether a contract auto-renews is decided in one order** (Sep 25 2026; AJ, word for word: "i got confirmation, the corporate studios do not have auto renewal on but franchise studio do. i believe studios will have the ability to turn auto renewals off if they want but its auto default on", and "allow trainers to mark a check box on a profile if the client is on auto renewal". Confirmed: the corporate studios are off and the franchise studios on. AJ's belief, not yet confirmed: every studio can turn it off). The first that answers wins: **a coach's lock on the profile that says paid in full or banked sessions** means nothing bills, so there is no answer, no screen says "auto-renews" (the contract history included), and there is no "before the charge" warning (the lock exists because Mindbody's reading is wrong for her); else **Mindbody's own flag on the contract** (Mindbody owns contracts); else **a trainer's mark on the client's profile for that contract** (the "On auto-renewal" box on Account → the package); else **the package's answer**; else **the studio's answer** (My Studio → Studio → Renewals, "Packages at {studio} renew automatically"); else **the standard: on**. A contract the studio's package table doesn't recognise gets no studio or package answer — only Mindbody or a mark can answer for it — and says "payments finish" until it is matched or marked. Where the answer is yes, the app warns before the charge and says "auto-renews". Where it is no, the app says "billing ends": the sessions still bank and carry over, nothing is charged on top of them, so there is no "before the charge" warning and the conversation comes at the studio's usual threshold. A mark belongs to one contract: on her next contract the studio's answer applies again until someone marks her again. The corporate studios switch their answer to **No** on go-live day.

## Who does what

| Person | Part in a renewal |
| --- | --- |
| Life Transformer (trainer) | Notices how the client is doing on the floor, asks about renewal, logs what the client said |
| Head trainer / Studio leader | Watches the studio's upcoming renewals, steps in over price or progress, handles the contract in Mindbody |
| Studio leader who doesn't train | Same as above, working from the Operations Dashboard |
