# Roles and permissions

Sources: `ROLE_LABELS` in `src/types.ts`, `src/lib/permissions.ts`, `AdminDashboardView.tsx`, and AJ, Sep 10 2026.

## The vocabulary

The app stores a role code on each trainer document; people see the label. Several codes are legacy names that map to the same label.

| Label people see | Role codes | Who that is |
| --- | --- | --- |
| Life Transformer | `LifeTransformer`, `Trainer` | A trainer on the floor |
| Studio Leader | `StudioLeader`, `HeadTrainer` | Runs a studio. Some studio leaders don't train clients |
| Franchise Owner | `Owner`, `StudioOwner`, `FranchiseOwner` | Owns one or more studios |
| Founder / Overseer | `Founder`, `Overseer` | Company leadership |
| System Administrator | `Admin` | Runs the app itself |

"Life Transformer" is what the company calls a trainer. Don't reword role labels on screen.

## Who runs operations

AJ, Sep 10 2026: **studio leaders and head trainers** run each studio's operations. Some studio leaders don't train. Trainers may help, depending on the studio.

## What each role reaches today

- **Operations (admin) mode** — the App Mode switch in the profile menu and the "Go to Operations" button — is available to studio leaders and above. Life Transformers never enter it, so anything a trainer needs has to appear on the screens they already use.
- Inside the dashboard, most tabs are open to everyone who can reach it. Staff & Roles, Catalog, Exports and Announcements need a franchise owner or administrator. Mindbody, Limbo, Bug Reports and System Tools are for system administrators only.
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
