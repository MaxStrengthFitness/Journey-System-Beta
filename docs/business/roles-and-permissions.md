# Roles and permissions

Sources: `ROLE_LABELS` in `src/types.ts`, `src/lib/permissions.ts`, `AdminDashboardView.tsx`, `features/relay/leads.ts`, AJ on Sep 10 2026, and AJ's four Operations-audit sittings on Sep 18 2026 (`docs/rounds/2026-09-18-operations-audit-prep.md` §E).

## The vocabulary

The app stores a role code on each trainer document; people see the label. Several codes are legacy names that map to the same label.

| Label people see | Role codes | Who that is |
| --- | --- | --- |
| Life Transformer | `LifeTransformer`, `Trainer` | A trainer on the floor |
| Head Trainer | `HeadTrainer` | Runs a studio's floor and team; the same tier as a studio leader. Its own label since Sep 27 2026 (AJ: "Trainer, Head trainer, Studio Leader/Owner"); it read "Studio Leader" before, so the role picker showed Studio Leader twice |
| Studio Leader | `StudioLeader` | Runs a studio. Some studio leaders don't train clients |
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

**The grant** is `managedStudioIds` on the trainer document — one entry per studio the person helps run, whatever their role. "To allow studios to develop their trainers into leadership we need to allow leadership to be able to give trainers access to these menus" (AJ, Sep 18). It is handed out on My Studio → Team (Operations → Staff & Roles does not offer it — checked in the code, Sep 27 2026), never by the person themselves, and only for a studio the giver runs. It opens My Studio's leader sections; it does **not** open the Operations dashboard. The editor's hint says so: "Opens Team and Studio at {studio}, and lets them change its machines" (Sep 27 2026).

`leadsHere(trainer, studioId)` in `src/features/relay/leads.ts` is the app's one answer to "does this person run this studio", and `trainerLeads` in `firestore.rules` is the same answer for writes.

**What a studio's leaders may hand out** (AJ, Sep 18: "trainer, head trainer, and can manage the studio grant — but never owner and admin"): Life Transformer, Head Trainer, Studio Leader, and the grant for their own studio (the picker has offered Head Trainer by name since Sep 27 2026). A franchise owner may also hand out Studio Owner and Franchise Owner (`Owner`). Only an administrator hands out Admin, Founder or Overseer. The rules refuse anything above the giver's reach (`mayHandOut`).

**Letting people in.** Anyone who runs a studio can approve an access request from My Studio → Team: that creates the trainer's account with a role, links it to the person's Mindbody staff profile when there is one ("ideally everyone using the app will be a part of Mindbody"), and may include the grant. A request names the studio it is for; one that names another studio is that studio's to answer. Someone who already has an account can ask for another studio from the studio picker (Request Access). That request is listed, with their name, at the studio they asked for, but it cannot be approved yet: letting an existing account into another studio is not built (Sep 24 2026). Temporary profiles for people not in Mindbody yet are the studio's to make, and to reconcile later.

## Who runs operations

AJ, Sep 10 2026: **studio leaders and head trainers** run each studio's operations. Some studio leaders don't train. Trainers may help, depending on the studio.

## What each role reaches today

- **Operations (admin) mode** — the App Mode switch in the profile menu and the "Go to Operations" button — is available to studio leaders and above (head trainer and above, AJ, Sep 18). Life Transformers never enter it, so anything a trainer needs has to appear on the screens they already use. Inside Demo Mode everyone may open it (AJ, Sep 20). **The screen enforces this, not just the menu (Sep 24 2026):** the menu, the route and the Operations screen ask the same question (`mayOpenOperations`, `src/features/admin/operations-access.ts`), and the route asks again whenever the person or the studio changes — a trainer who opened Operations in Demo Mode and then chooses a real studio is sent to the Hub.
- **A shared iPad changes hands at sign-out (Sep 24 2026).** The next person to sign in starts on the Hub, in trainer mode, with no client open, in the iPad's pinned studio if they may enter it (otherwise the studio picker). Nothing of the last person's screen, studio, app mode or half-finished handoffs carries over; a note started mid-session and not saved stays with the session. **Switch Trainer** in the profile menu now does the same as Log Out Facility — it signs out so the next person can sign in as themselves, and the sign-in screen always asks which Google or Microsoft account. What it was for (a facility sign-in shared by trainers who switched with a PIN) went with the PINs. See `src/features/sign-out/README.md`.
- **Operations is split in two (the Operations overhaul, Sep 19 2026).** Operations is the studio-management area — nine tabs (Overview · Renewals · Delight queue · Floor · Staff & Roles · Insights · Announcements · Mindbody · Data), always one studio — and every tab is open to whoever can open it ("let's worry more about features than permission restrictions"). Mindbody shows a leader their own studio only; Announcements offers a studio's leader "One studio", an owner the network too, an administrator everyone. The **Admins dashboard** (the third position on the app-mode switch: Trainer · Operations · Admin) is for **administrators and the founder only** — All locations, the Catalog, the Standard template, Limbo, System tools, Bug reports, the company's Data. Who admins are (AJ, Sep 19): corporate staff of Max Strength — people assisting studios with start-up or supporting existing studios; they may not be trainers and are not studio owners (franchisees); admins sit above them, with full, unscoped, untimed access; admins can promote other admins; an admin sets up a brand-new studio (the Mindbody id and the machines) before handing it to its leader. Third-party or external people are not expected to have admin access. Admin grants are to be tracked — who granted, who received, when (not yet built).
- **Operations → Staff & Roles is read-only for the studio tier** (voice review follow-up, Sep 27 2026; AJ: "yes" — nothing on Operations is a second editor of what My Studio runs). The studio tier (head trainers, studio leaders, studio owners, and anyone inside Demo Mode) sees the list read-only, with a button, "Open My Studio → Team", where they let people in; franchise owners, administrators, the founder and the overseer keep the editor there. Changing an existing person's role on Operations is still administrators only (`canChangeRole={isAdmin}`, the Sep 2026 audit's decision), while My Studio → Team lets a studio's leaders do it within the studio tier; that difference is left for AJ. Under "All my studios" the list is the reader's own studios, never the company (an account with no studio in the reader's list is found in Limbo, on the Admins dashboard). The Mindbody staff match is per studio, so an account reads "Has an account" until its studio's Mindbody list has been read, and "No Mindbody match" only after.
- **Who may set a network's focus and launch an initiative at every studio**: franchise owners (`Owner`, `FranchiseOwner`) and the company (`Admin`, `Founder`, `Overseer`), through `mayActForNetwork` in `src/features/admin/network/network-actions.ts`; studio-tier leaders never, even with All my studios. Since the voice review follow-up (AJ, Sep 27 2026) an owner, like the company, is offered every network that holds a studio in their scope, whether or not the network names them, which is what Relay allowed; the rules (`networks` update: `isSuperAdmin() || isFranchiseOwner()`) let any franchise owner update any network. Inside Demo Mode no real network is offered, and a launch from the practice studio's own Overview posts there only.
- **How far Operations sees** (the Operations round, Sep 19 2026): one control — **Looking at: this studio · All my studios** — that every tab reads. "This studio" is the studio the app is in. "All my studios" is the reader's list: the company tier every studio; the owner tier the studios they own or whose network they own; the studio tier the studios they run (the grant counts here, too). Hours (inside Insights) and Staff & Roles span the list, and the Overview becomes the network view; Renewals, Delight, the Floor, Insights, Mindbody and Data read one studio at a time and offer the list. A studio's own settings — its details, its day, its renewal settings, its notices — are edited on My Studio → Studio only; Operations shows and points, it does not edit them twice.
- **My Studio** (the bottom-bar tab, Sep 18) is where a studio is run: Relay for everyone at the studio; Openings (since Sep 27 2026) for everyone who may read the studio's standing weeks; Machines for everyone to read and leave notes, leaders to change; Team and Studio for the studio tier. **A studio's own record (`studios/{id}`) is written by its own leaders, franchise owners and administrators** — any trainer's iPad may write only the schedule sync's lease fields. A studio's leaders may also post announcements to their own studio; company-wide notices stay with the Operations tab's people.
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

## The standing week (Sep 27 2026)

Each trainer's usual week at a studio — when they take clients (up to three blocks a day since the Openings round) and their regulars — and the coming week's bookings checked against it. Nothing is written to Mindbody.

| | Who |
| --- | --- |
| See the studio's standing weeks | Everyone who works at the studio, the studio's leaders, franchise owners, administrators. A colleague sees another trainer's AGREED week and their days away that haven't ended, read only (Sep 27 2026; AJ: "schedules are open to all"): on My Studio → Openings → Who's usually in, since another trainer's profile (and its Standing week card) can't be opened; the proposal waiting on a leader and its note are not shown |
| Propose your own week (My Profile) | Any trainer, for themselves, at a studio they work at. A proposal never agrees itself |
| Agree, change or remove a week (My Studio → Team; its line counts the week's free slots, which Openings lists for everyone since Sep 27 2026) | The studio's leaders (head trainer, studio leader, studio owner there, or the grant), franchise owners, administrators |
| Set a trainer's days away (Sep 27 2026) | The trainer, on their own week at a studio they work at, even with nothing proposed; the studio's leaders (the grant counts), franchise owners and administrators, on anyone's. No agreement is needed. At most six ranges still to come |
| Change which trainer a week's bookings are matched to (`trainerId`) | Not the trainer, once the week exists (Sep 27 2026); a leader sets it from the roster as they agree |

## Openings, Your week and My clients (Sep 27 2026)

AJ, on who sees what for the beta: "im not too concerned for permission at this stage of the beta, just keep it relaxed and we will tighten up later". So Openings shows everyone who works at the studio the same thing, other trainers' names included, and client names wait for a tap as a courtesy to the client standing at the iPad, not as a lock. The rules apply to whole documents, and everyone at the studio can already read its bookings and agreed weeks.

| | Who |
| --- | --- |
| My Studio → Openings (The usual week, Next 7 days, A new regular time, Who's usually in) | Everyone who may read the studio's standing weeks (`mayReadWeeks`: the people who work there, franchise owners, administrators, and everyone inside Demo Mode). The section asks the same question itself, since a menu is not a gate. Trainers' names for all of them; client names after a tap |
| Set, change, keep or remove a mark on a time (Always full · Usually has room) | Anyone who works at the studio (home, also works at, a guest, the grant), franchise owners and administrators, always as themselves: the rules pin the mark to the signed-in person and the server's time. Changing a colleague's mark signs it as the person changing it |
| Team's line and door ("3 free slots in the next 7 days · See them on Openings.") | The studio tier, on My Studio → Team, as before |
| The Operations Overview's Openings line and door | Whoever opens the Overview and may read the studio's standing weeks |
| The Wrap-up's **Times with room** | The trainer running the Wrap-up. The sheet shows times only, never a name, so it is safe to turn to the client |
| **Your week** and **My clients** (My Profile) | The trainer themselves, on their own profile only. Another trainer's profile can't be opened in the app today, so no leader view is built; leaders see clients and training hours on Operations → Insights → Hours. Your week's read names the studio, which is what the existing sessions rule allows (works at, leads, franchise owner, administrator) |
| The weekly summary (`studios/{s}/watch/openings`) | Read by the studio's people; written by the Sunday job only, never from the app |

## Studio boundaries

- Every client has a **home studio** (where they are billed and mainly train).
- A client can be approved to **cross-train** at other studios; trainers there can then read the client, but editing stays with the home studio. The one exception is a session: a trainer at a studio the client is approved at can run and finish her session there, and Journey updates her session count, last session and starting weights (Sep 24 2026). Her name, her home studio, her approvals, her medical history and her package stay with the home studio.
- Trainers can have **guest** access to other studios.
- Queries always name the studios they read (`src/lib/tenancy.ts`), and the rules check the same thing.
