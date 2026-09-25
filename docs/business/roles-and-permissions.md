# Roles and permissions

Sources: `ROLE_LABELS` in `src/types.ts`, `src/lib/permissions.ts`, `AdminDashboardView.tsx`, `features/relay/leads.ts`, AJ on Sep 10 2026, and AJ's four Operations-audit sittings on Sep 18 2026 (`docs/rounds/2026-09-18-operations-audit-prep.md` §E).

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

`leadsHere(trainer, studioId)` in `src/features/relay/leads.ts` is the app's one answer to "does this person run this studio", and `trainerLeads` in `firestore.rules` is the same answer for writes.

**What a studio's leaders may hand out** (AJ, Sep 18: "trainer, head trainer, and can manage the studio grant — but never owner and admin"): Life Transformer, Studio Leader, and the grant for their own studio. A franchise owner may also hand out Studio Owner and Owner. Only an administrator hands out Admin, Founder or Overseer. The rules refuse anything above the giver's reach (`mayHandOut`).

**Letting people in.** Anyone who runs a studio can approve an access request from My Studio → Team: that creates the trainer's account with a role, links it to the person's Mindbody staff profile when there is one ("ideally everyone using the app will be a part of Mindbody"), and may include the grant. A request names the studio it is for; one that names another studio is that studio's to answer. Someone who already has an account can ask for another studio from the studio picker (Request Access). That request is listed, with their name, at the studio they asked for, but it cannot be approved yet: letting an existing account into another studio is not built (Sep 24 2026). Temporary profiles for people not in Mindbody yet are the studio's to make, and to reconcile later.

## Who runs operations

AJ, Sep 10 2026: **studio leaders and head trainers** run each studio's operations. Some studio leaders don't train. Trainers may help, depending on the studio.

## What each role reaches today

- **Operations (admin) mode** — the App Mode switch in the profile menu and the "Go to Operations" button — is available to studio leaders and above (head trainer and above, AJ, Sep 18). Life Transformers never enter it, so anything a trainer needs has to appear on the screens they already use. Inside Demo Mode everyone may open it (AJ, Sep 20). **The screen enforces this, not just the menu (Sep 24 2026):** the menu, the route and the Operations screen ask the same question (`mayOpenOperations`, `src/features/admin/operations-access.ts`), and the route asks again whenever the person or the studio changes — a trainer who opened Operations in Demo Mode and then chooses a real studio is sent to the Hub.
- **A shared iPad changes hands at sign-out (Sep 24 2026).** The next person to sign in starts on the Hub, in trainer mode, with no client open, in the iPad's pinned studio if they may enter it (otherwise the studio picker). Nothing of the last person's screen, studio, app mode or half-finished handoffs carries over; a note started mid-session and not saved stays with the session. **Switch Trainer** in the profile menu now does the same as Log Out Facility — it signs out so the next person can sign in as themselves, and the sign-in screen always asks which Google or Microsoft account. What it was for (a facility sign-in shared by trainers who switched with a PIN) went with the PINs. See `src/features/sign-out/README.md`.
- **Operations is split in two (the Operations overhaul, Sep 19 2026).** Operations is the studio-management area — nine tabs (Overview · Renewals · Delight queue · Floor · Staff & Roles · Insights · Announcements · Mindbody · Data), always one studio — and every tab is open to whoever can open it ("let's worry more about features than permission restrictions"). Mindbody shows a leader their own studio only; Announcements offers a studio's leader "One studio", an owner the network too, an administrator everyone. The **Admins dashboard** (the third position on the app-mode switch: Trainer · Operations · Admin) is for **administrators and the founder only** — All locations, the Catalog, the Standard template, Limbo, System tools, Bug reports, the company's Data. Who admins are (AJ, Sep 19): corporate staff of Max Strength — people assisting studios with start-up or supporting existing studios; they may not be trainers and are not studio owners (franchisees); admins sit above them, with full, unscoped, untimed access; admins can promote other admins; an admin sets up a brand-new studio (the Mindbody id and the machines) before handing it to its leader. Third-party or external people are not expected to have admin access. Admin grants are to be tracked — who granted, who received, when (not yet built).
- **How far Operations sees** (the Operations round, Sep 19 2026): one control — **Looking at: this studio · All my studios** — that every tab reads. "This studio" is the studio the app is in. "All my studios" is the reader's list: the company tier every studio; the owner tier the studios they own or whose network they own; the studio tier the studios they run (the grant counts here, too). Hours (inside Insights) and Staff & Roles span the list, and the Overview becomes the network view; Renewals, Delight, the Floor, Insights, Mindbody and Data read one studio at a time and offer the list. A studio's own settings — its details, its day, its renewal settings, its notices — are edited on My Studio → Studio only; Operations shows and points, it does not edit them twice.
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
| Change the studio's renewal settings and package prices (My Studio → Studio → Renewals since Sep 19) | — | ✓ | ✓ |
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

## A client's Notes & Profile (the client codex, Sep 24 2026)

The record tab is seven pages (Overview, Notes, FORD, Body & Pulse, Goals & Focus, Story, Account). The screens offer only what the database rules would allow, and say why when they hold something back.

| | Who |
| --- | --- |
| Read the record (every page but FORD's own text) | Anyone who can open the client: trainers and leaders at their home studio, cleared cross-trainers, franchise owners, administrators |
| Change the record (the Save bar) | Trainers and leaders at the client's home studio (the grant counts), and administrators. Everyone else gets the pages read only: "Read only here · {home studio} keeps this record. Notes you write still save." |
| Write a note | Any trainer who can open the client, as themselves — a cross-trainer too |
| Read FORD (Family, Occupation, Recreation, Dreams, and In one line) | Trainers and leaders at the client's home studio, franchise owners, administrators — **never a cross-train studio**, which is told whose FORD it is and shown none of it |
| Add to FORD (a new detail, an idea, the first In one line, Save to FORD from a note) | Only people who train at or lead the client's home studio (the grant counts). An administrator or franchise owner who works elsewhere can read FORD but not add to it — the app says so rather than offering an Add that would be refused |
| Change what FORD holds (edit a detail, file a capture, take a gesture, rewrite In one line) | People who may change the record (above). The database would also let a franchise owner; the app does not offer it to one who does not work at the studio |
| Follow up next time (the question on a FORD detail) | Whoever may change that detail; "Asked it" clears it |

## The InBody normal variation (Sep 24 2026)

How big an InBody change must be before any screen calls it a change — each studio's own, with Max Strength's defaults (3.5 lb skeletal muscle, 5.3 lb body fat mass, 2.7 points body fat %) until it sets one. A client is always judged by their HOME studio's numbers.

| | Who |
| --- | --- |
| See it, and have it applied | Everyone: every InBody sentence, the Renewal Brief, the pipeline and the progress report read it |
| Set it, or go back to Max Strength's defaults (My Studio → Studio) | The studio's leaders (head trainer, studio leader, studio owner there, or the grant), franchise owners, administrators |

## Studio boundaries

- Every client has a **home studio** (where they are billed and mainly train).
- A client can be approved to **cross-train** at other studios; trainers there can then read the client, but editing stays with the home studio.
- Trainers can have **guest** access to other studios.
- Queries always name the studios they read (`src/lib/tenancy.ts`), and the rules check the same thing.
