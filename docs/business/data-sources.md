# Where each kind of data lives

Journey is one of four places client information lives. This page says which system owns each kind of data, how it reaches Journey, and which one wins when they disagree. Status as of Sep 11 2026 (the Renewals round).

| Data | Owned by | How it reaches Journey | Stored in Journey as |
| --- | --- | --- | --- |
| People — name, contact, status | Mindbody | `client.*` webhooks (registered for Solon's site only today) and the schedule pull-sync | `clients/{mindbodyClientId}` |
| Bookings and attendance | Mindbody | `appointmentBooking.*` webhooks and the per-studio schedule pull-sync | `schedules` |
| Contracts and memberships — package, dates, autopay, scheduled charges | Mindbody | The **Sync** button on one client, and the nightly renewals job for the clients who most need it (about 300 a night, near a renewal first). Webhook handlers exist but aren't subscribed yet | `client.mindbodyContracts` (merged on each pull), `client.mindbodyMemberships` |
| Pricing options — sessions bought and sessions left | Mindbody | Same as contracts | `client.mindbodyServices`, **replaced whole** on each pull |
| Sessions remaining | Mindbody | Worked out from the above: sessions on hand plus 8 for each payment still to come (see [packages-and-pricing.md](packages-and-pricing.md)) | `client.renewal.sessionsLeft`. The older `remainingSessions` is a fallback in `features/client-profile/client-package.ts` |
| Declined cards | Mindbody | **Not tracked** (AJ, Sep 11 2026). Only Mindbody's autopay status is shown | — |
| The renewal snapshot — situation, both clocks, flags, proof | Journey (worked out from the rows above) | The nightly renewals job (`server/renewals-job.ts`). Single-client screens also work it out live | `client.renewal` — **only the job writes it** |
| Renewal conversations, stage, lead, outcome | Journey | Trainers and leaders in the app; outcomes also recorded by the nightly job | `studios/{id}/renewals/{cycle}`, conversations in `.../touches` |
| Workouts — sets, weight, reps, time under tension, rep quality | Journey | Entered on the iPad during the session | `sessions`, `exerciseLogs`; running totals in `client.machineStats` |
| Machine settings per client | Journey | Entered by trainers | `clientMachineSettings` |
| Coaching notes and focuses | Journey | Journal composer, in-session notes | `journalEntries` (Mindbody's own notes arrive read-only as `mindbodyNotes`) |
| Check-ins and how the client felt | Journey | Pre-session briefing, post-session screen | Fields on `sessions` |
| 90-day progress report | Journey | Progress report editor | `progressReports`, summary on `client.subjectiveSnapshot` |
| InBody body composition | InBody (LookinBody) | Typed in from the printout: Profile → Details → Medical → Body composition | `clients/{id}/inbodyScans`; the first-to-latest change on `client.inbodySummary` |
| History before Journey | FileMaker | The legacy CSV importer now; a full import after beta launch | `sessions`, `exerciseLogs` |
| Package prices, renewal timing, Mindbody names | Each studio | Operations → Renewals → Settings (leaders) | `studios/{id}/config/renewals` |
| Training method | MSF Academy | `docs/msf-academy/`, the Learning tab | Bundled content |

## Which source wins

- **Mindbody wins** for identity, bookings, contracts, payments and anything commercial.
- **Journey wins** for coaching: workouts, settings, notes, check-ins, reports.
- **Never invent a Mindbody-owned date.** If Journey has to estimate one, it is stored with a marker saying it is an estimate, and the screen says so (the "In Journey since" rule).
- A Mindbody client document's id **is** their Mindbody client id. Journey never matches people by name.

## Coverage right now

From the Sep 9 2026 dry run against production: 627 clients, 203 sessions (all belonging to 8 clients), and at most 16 clients with any contract or membership on file. Journey is only starting to collect workouts, and most history is still in FileMaker.

## FileMaker

AJ, Sep 10 2026: the import happens once beta fully launches; the data is still being obtained from the previous developers. Some clients have years of history. The likely limit is 1–2 years back — older history "would be fun to look at" but isn't needed.

## InBody

AJ, Sep 10 2026: results live in InBody's system and are slow to reach clients, so storing them in the app would help. Since Sep 11 2026 trainers type the numbers in from the printout (`src/features/inbody/README.md`). **Each studio has its own LookinBody Web account** (AJ, Sep 11 2026), so a later automatic import needs one API key per studio, kept on the server. The studio uses the **InBody 270S**. Its printout reports weight, skeletal muscle mass, body fat mass, percent body fat, BMI, total body water, dry lean mass, fat-free mass, basal metabolic rate, SMI, whole-body phase angle and segmental lean mass for each arm, each leg and the trunk (in pounds and as a percentage of ideal), plus a history of recent scans. InBody offers a Web API for LookinBody Web accounts.
