# Roles and permissions

Sources: `ROLE_LABELS` in `src/types.ts`, `src/lib/permissions.ts`, `AdminDashboardView.tsx`, `features/planner/leads.ts`, AJ on Sep 10 2026, and AJ's four Operations-audit sittings on Sep 18 2026 (`docs/rounds/2026-09-18-operations-audit-prep.md` §E).

## The vocabulary

The app stores a role code on each trainer document; people see the label. Several codes are legacy names that map to the same label.

| Label people see | Role codes | Who that is |
| --- | --- | --- |
| Life Transformer | `LifeTransformer`, `Trainer` | A trainer on the floor |
| Studio Leader | `StudioLeader`, `HeadTrainer` | Runs a studio. Some studio leaders don't train clients |
| Studio Owner | `StudioOwner` | Owns and runs one studio — the same tier as a studio leader at that studio (AJ, Sep 18 2026: "just make all three have the same"). Labelled Franchise Owner before Sep 18 |
| Franchise Owner | `Owner`, `FranchiseOwner` | Owns several studios |
| Founder / Overseer | `Founder`, `Overseer` | Company leadership |
| System Administrator | `Admin` | Runs the app itself |

"Life Transformer" is what the company calls a trainer. Don't reword role labels on screen.

## The three tiers (agreed Sep 18 2026)

| Tier | Who | Runs |
| --- | --- | --- |
| **Studio** | a head trainer, studio leader or studio owner *at that studio* (home or owned) — or any trainer the studio's leadership has given **the grant** | one studio: **My Studio** (Machines, Team, Studio), and every leader-only write there |
| **Owner** | Owner, Franchise Owner | several studios, from Operations |
| **Company** | Founder / Overseer, System Administrator | the standard: the catalog, the standard set, the company routines, every studio |

**The grant** is `managedStudioIds` on the trainer document — one entry per studio the person helps run, whatever their role. "To allow studios to develop their trainers into leadership we need to allow leadership to be able to give trainers access to these menus" (AJ, Sep 18). It is handed out on My Studio → Team (or Operations → Staff & Roles), never by the person themselves, and only for a studio the giver runs. It opens My Studio's leader sections; it does **not** open the Operations dashboard.

`leadsHere(trainer, studioId)` in `src/features/planner/leads.ts` is the app's one answer to "does this person run this studio", and `trainerLeads` in `firestore.rules` is the same answer for writes.

**What a studio's leaders may hand out** (AJ, Sep 18: "trainer, head trainer, and can manage the studio grant — but never owner and admin"): Life Transformer, Studio Leader, and the grant for their own studio. A franchise owner may also hand out Studio Owner and Owner. Only an administrator hands out Admin, Founder or Overseer. The rules refuse anything above the giver's reach (`mayHandOut`).

**Letting people in.** Anyone who runs a studio can approve an access request from My Studio → Team: that creates the trainer's account with a role, links it to the person's Mindbody staff profile when there is one ("ideally everyone using the app will be a part of Mindbody"), and may include the grant. A request names the studio it is for; one that names another studio is that studio's to answer. Temporary profiles for people not in Mindbody yet are the studio's to make, and to reconcile later.

## Who runs operations

AJ, Sep 10 2026: **studio leaders and head trainers** run each studio's operations. Some studio leaders don't train. Trainers may help, depending on the studio.

## What each role reaches today

- **Operations (admin) mode** — the App Mode switch in the profile menu and the "Go to Operations" button — is available to studio leaders and above. Life Transformers never enter it, so anything a trainer needs has to appear on the screens they already use.
- Inside the dashboard, most tabs are open to everyone who can reach it. Staff & Roles, Catalog, Exports and Announcements need a franchise owner or administrator. Mindbody, Limbo, Bug Reports and System Tools are for system administrators only.
- **My Studio** (the bottom-bar tab, Sep 18) is where a studio is run: Relay for everyone at the studio; Machines for everyone to read and leave notes, leaders to change; Team and Studio for the studio tier. **A studio's own record (`studios/{id}`) is written by its own leaders, franchise owners and administrators** — any trainer's iPad may write only the schedule sync's lease fields. A studio's leaders may also post announcements to their own studio; company-wide notices stay with the Operations tab's people.
- The Firestore rules are the real enforcement; hiding a tab is only a convenience.

## Renewals (agreed Sep 10 2026)

| | Life Transformer | Studio Leader | Franchise Owner / Admin |
| --- | --- | --- | --- |
| See a client's renewal status | ✓ | ✓ | ✓ |
| Log a renewal conversation (how the client feels, what they're unsure about) | ✓ | ✓ | ✓ |
| Read who has talked to a client and what was said | ✓ (clients they can open) | ✓ | ✓ |
| The studio's renewal pipeline | — | ✓ | ✓ |
| Set a renewal's stage, who is leading it, the outcome | — | ✓ | ✓ |
| Per-trainer renewal rates | — | ✓ | ✓ |
| Change the studio's renewal settings and package prices | — | ✓ | ✓ |
| The Renewal Brief, with the package-options table | — | ✓ | ✓ |
| Record or correct an outcome (renewed, upgraded, pay-as-you-go, lost…) | — | ✓ | ✓ |

The nightly job records the outcomes it can see in Mindbody. A leader's outcome always wins, including a leader clearing one.

**What the rules enforce, and what only the screens do.** The rules decide who can *change* each of these. Reading is looser in two places:

- The studio's trainers can read the settings document, including the package prices. They need its thresholds, and the prices are the public website's anyway.
- The trainers can also read the renewal cycles, because they log conversations on them. Per-trainer rates are worked out from those cycles, but only the leader-only Outcomes view works them out and shows them.

## InBody scans (agreed Sep 10 2026)

Body composition is health data, so it is never more visible than the client.

| | Who |
| --- | --- |
| See a client's scans | Anyone who can open the client: trainers and leaders at their studio, cleared cross-trainers, franchise owners, administrators |
| Add a scan, or correct one | Trainers and leaders at the client's home studio, and administrators — the same people who can edit the client |
| Remove a scan | Whoever entered it, the studio's leaders, administrators |

## Studio boundaries

- Every client has a **home studio** (where they are billed and mainly train).
- A client can be approved to **cross-train** at other studios; trainers there can then read the client, but editing stays with the home studio.
- Trainers can have **guest** access to other studios.
- Queries always name the studios they read (`src/lib/tenancy.ts`), and the rules check the same thing.
