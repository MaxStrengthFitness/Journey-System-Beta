# Operations dashboard — audit prep

*Sep 18 2026 · read from `master` at `93fb096` · the numbered inventory the Operations audit works from*

This is the list of everything on the Operations dashboard today, one numbered entry per screen and one per control (`4.9` = screen 4, control 9), with my take on what each is for and, at the bottom, how I suggest we walk them. The **who / why / when** lines under every screen are for AJ; where I have a guess I wrote it as *Expected:* — confirm it or cross it out, a wrong expectation is a finding.

The lens for the whole audit is AJ's own sentence: **admins and owners set the MSF standards (machines, studios, the default template every studio pulls from); each studio can go beyond the template and make its studio its own; every studio has full insight and control over itself.** Section B maps what the code does with that today.

The Sep 13 audit workbook (`docs/ops/Journey Screen Audit.docx`, sheets 30–41) predates two tabs (Delight queue, Machine fit) and still lists "Mindbody / Limbo / Bug Reports / System Tools" as one sheet — treat this document as the replacement for those sheets.

---

## A. The way in

**A.1 Who can open Operations.** The App Mode switch in the profile menu (Trainer ↔ Operations) appears for `isStudioLeader(trainer)`: Studio Leader, Head Trainer, Owner, Studio Owner, Franchise Owner, Founder, Overseer, Admin. A Life Transformer never sees it — so "trainers who have been granted privileges" has no mechanism today short of changing their role. *(Decision for the audit — see D.1.)*

**A.2 The studio picker's "Go to Operations" button** uses the same set **plus a hard-coded e-mail** (`StudioSelectionView.tsx:303`, AJ's own address) — a leftover bootstrap bypass. Fix without asking: remove it once the role gate is confirmed.

**A.3 Two "admin" definitions.** On screen, `isAdmin` = role **Admin or Founder** (`App.tsx:71`). In the rules, `isSuperAdmin()` = Admin, Founder **or Overseer**. An Overseer therefore sees no System Backend tabs even though the rules would let them write. Tiny, but it is exactly the kind of drift the audit should settle: one list of "who is a system administrator".

**A.4 Inside the dashboard** — `isFranchiseOwnerOrAdmin` = `isAdmin` or role `FranchiseOwner` / `Owner`. **Not `StudioOwner`**, although `roles-and-permissions.md` and `ROLE_LABELS` call that role a Franchise Owner too. A Studio Owner therefore cannot see Staff & Roles, Catalog, Exports or Announcements.

**A.5 Sixteen tabs, three groups, always opens on Overview.** The Franchise dashboard is a separate bottom-nav screen in Operations mode (owners and admins).

| # | Tab | Group | Screen gate | The rules actually enforce |
| --- | --- | --- | --- | --- |
| 1 | Overview | Studio Management | everyone in Operations | reads only |
| 2 | Renewals | Studio Management | everyone; the studio list is only studios you lead | leaders of that studio write |
| 3 | Delight queue | Studio Management | everyone | reads only |
| 4 | Studios | Studio Management | everyone (create/delete: admin) | **any signed-in trainer may edit any studio document** (known, open by decision) |
| 5 | Staff & Roles | Studio Management | franchise owner or admin | admin, franchise owner, or that studio's leaders |
| 6 | Clients | Studio Management | everyone | reads only |
| 7 | Catalog | Studio Management | franchise owner or admin | **admin only** (a franchise owner gets a failed-save toast) |
| 8 | Routines | Studio Management | everyone; authoring gated inside | company tier admin; studio tier that studio's leaders |
| 9 | Insights | Studio Management | everyone | reads only |
| 10 | Machine fit | Studio Management | everyone; "All MSF studios" admin | company report admin/founder/overseer |
| 11 | Exports | Studio Management | franchise owner or admin | the legacy importer needs admin in practice (11.5) |
| 12 | Announcements | Communications | franchise owner or admin | admin, founder, overseer, franchise owner, owner, studio owner |
| 13 | Mindbody | System Backend | admin | **any signed-in trainer** may write the studio fields it edits |
| 14 | Limbo | System Backend | admin | admin, founder, overseer |
| 15 | Bug Reports | System Backend | admin | admin, founder, overseer |
| 16 | System Tools | System Backend | admin | (callbacks in AppContent) |
| 17 | Franchise dashboard | bottom nav | owners and admins | see 17 |

---

## B. The standards-vs-studio map — my take

What AJ described is a three-layer model: **MSF standard → the studio's own version → the client**. Here is where each layer lives today, and where the layer is missing.

| Thing | MSF standard (who, where) | The studio's own (who, where) | Gap |
| --- | --- | --- | --- |
| **Machines** | The Catalog — admin only, Operations → Catalog (7) | The floor: "We have this / We don't", custom machine, Local setup, Reorder — that studio's leaders, Operations → Studios → Equipment (4.9–4.11) **and** Learning → Catalog | A studio's custom machine has no "promote into the MSF catalog" control that I could find in these screens (AJ's Sep 11 decision). Check on the iPad. |
| **Machine standard settings** (seat, pad, gap) | "House default" per dial in the catalog form (7.9) | The **Studio setup card** in Learning → Catalog writes `studioMachineSettings` — not in Operations at all | The Active Session still also reads the legacy `studios.machineSettings` that nothing writes (`WorkoutTrackerView.tsx:441`). Whether a studio standard actually reaches a session needs a hardware check. |
| **Routines** | Company Standards — admin, Operations → Routines (8) | Studio Templates — that studio's leaders (8); trainers' own presets can be promoted | The right shape already. Templates use the app-wide machine list, not the studio's floor (ROADMAP). |
| **Renewal timing and packages** | `DEFAULT_RENEWAL_SETTINGS` in code — no screen | Operations → Renewals → Settings — that studio's leaders (2.5); becomes "this studio's own" on first save | No company-level editor: the MSF default can only be changed by a code change. |
| **Shift hours, deep-clean interval** | constants in code | **Relay → Team → Standards** — leaders. Not in Operations | Two places called "standards" (this and 2.5) with nothing linking them. |
| **Studio identity** (name, time zone, Mindbody link, corporate/franchise, colour) | — | Operations → Studios → details (4.4) — every Operations user sees **every** studio | The one screen where "full control over their own studio" and "every studio is listed to everyone" collide. |
| **Journey cutover date** (`journeyCutoverDate`) | — | **no UI anywhere** — every client at every studio reads "unknown" until it is set | CLAUDE.md says Operations is its home. |
| **Owner / head trainer of a studio** | — | `ownerId` set only when a studio is created; `headTrainerId` never set — and Relay's Floor Map signs machine flags with it (`FloorMap.tsx:149`), so every flag carries `null` | Needs an editor or needs deleting. |
| **Staff and roles** | fixed vocabulary (`ROLE_LABELS`) | Staff & Roles (5) — franchise owner/admin; **and** Franchise → Your team (17.4) — owners | Studio leaders cannot manage their own team from Operations, although the roles page says they run "renewals, staff, machines, insights". |
| **Announcements** | Everyone / a network — owners and admins (12) | One studio — owners and admins (12) | A studio leader cannot post to their own studio. |
| **Cleaning and maintenance** | — | Relay tasks + the upkeep log (4.12) | Two entry points (Relay Floor Map, Operations → Equipment → Upkeep) — fine if deliberate. |

**The headline, in one paragraph.** The company layer is mostly there and correctly admin-only (catalog, company routines). The studio layer exists but is scattered across three screens with three different vocabularies (Operations → Studios, Learning → Catalog's Studio setup card, Relay → Team → Standards), and the Studios tab is shaped as a *company registry* (every studio, to everyone) rather than as *my studio*. The client layer is fine and out of scope here. The audit's biggest design decision is whether Operations → Studios becomes two screens — **My studio** (what a leader edits about their own place: details, floor, standards, cutover date, upkeep, temporary profiles) and **All locations** (admins and owners: the registry, franchises, create/delete, Mindbody link) — with the Studio setup card and Relay's Standards folding into "My studio". See D.3.

---

## C. The screens

Each screen: what is on it (numbered), what the code lets happen and what the rules enforce, my take, and the who / why / when lines for AJ.

### 1. Overview — `features/admin/AdminOverviewTab.tsx`

Acts on the active studio only. Read-only except one button.

- 1.1 **Five tiles** — "On the floor now" (live sessions, foot names the trainer and client or "Nothing running"), "Completed" (foot: show rate, or "Nothing resolved yet"), "Missed" (no-shows + cancellations, alert tone when > 0), "Not marked" (slots five minutes past their end with no outcome), "Studio tasks" (done / total, tap → Relay).
- 1.2 **On the floor** — one lane per trainer with anything booked today; live session floats to the top; "With X" / "Next at HH:MM" / "Day complete"; completed-of-total bar. Empty: "Nothing booked today".
- 1.3 **Needs attention** — no-shows, then unresolved, then cancellations, six rows max; "Open" → client profile. Empty: "Nothing to chase".
- 1.4 **Studio tasks** — today's Relay list; "Done" writes `studios/{s}/taskInstances`; "Open" → Relay. "Creating and scheduling tasks lives in Relay."
- 1.5 **The week** — bar chart of bookings per day with the completed share shaded; today highlighted.

**My take.** This is "is my studio running right now", which is what the Hub and Relay's Now Bar already answer for everyone. The architecture doc (§1.5) says the first thing a leader should see is the Monday-morning list: renewals coming up, attendance anomalies, performance discrepancies, pain and incidents. Today's Overview answers none of the four. I would keep the day-at-a-glance somewhere, but the *first* screen of Operations should probably be the Monday page, and Overview's tiles fold into it or into Relay.

*Expected:* who — studio leader · why — glance at today's floor and what fell over · when — during the shift, several times.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 2. Renewals — `features/admin/renewals/`

Studio picker lists only studios the signed-in person leads (`canManageRenewals`); "Renewals are run by each studio's leaders. Your account doesn't lead a studio yet." when none.

- 2.1 **Pipeline · Outcomes · Settings** switcher (Settings shows "· N to match" when Mindbody names are unmatched).
- 2.2 **Pipeline** — tiles "Before the charge" / "Talk now" / "Coming up" / "Missing Mindbody data"; filter row All · Needs a leader · Price · Upgrade · Not talked yet; lanes Before the charge, Talk now, Coming up (by month), Lapsed, Away; each row: name, package chip, latest conversation or "Nobody has talked to them yet", a proof sentence, the next step; tap → the Brief. Footer: "Nothing here contacts anyone." Read-only.
- 2.3 **The Renewal Brief** (dialog) — leader controls: Stage (not started / talking / decided), Leading the conversation, Outcome (renewed / upgraded / downgraded / pay-as-you-go / lost), "Mark the follow-up handled" → `studios/{s}/renewals/{cycle}`. Seven read panels: Journey, Health wins, Strength, Best rhythm, Where they stand, Options (this studio's package-price table), Conversations ("Log a conversation" writes a touch).
- 2.4 **Outcomes** — quarter picker; Kept / Renewed / Upgraded / Lost; by package; by trainer (hidden under five outcomes; "Context, not a verdict"); by studio when leading more than one.
- 2.5 **Settings** — dirty-tracked save bar; "When to talk" (six thresholds, two selects), "Packages" (name, months, sessions, payments, rates, Mindbody names; remove confirms), "Extra sessions", "Names seen in Mindbody" (match to a package). "{studio} is using the standard settings below. Change anything and save to make them this studio's own." Writes only the diff to `studios/{s}/config/renewals`.

**My take.** The best-shaped tab on the dashboard and the model for the others: a company default, a studio copy that becomes its own on first save, leaders-only writes enforced by the rules, sentences with a minimum sample. Two things to ask: whether a Franchise Owner should see the pipeline across their studios (the rules say leaders of the studio; an owner who does not lead a studio sees nothing), and whether the MSF default thresholds need a screen or a code constant is fine while AJ is the only admin.

*Expected:* who — studio leader (including leaders who do not train) · why — get ahead of renewals, know who has talked to whom · when — Monday morning, and before every renewal conversation.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 3. Delight queue — `features/ford/DelightQueue.tsx`

Active studio only. Read-only.

- 3.1 **Grouped list** — This week · This month · Later · "No date — whenever the moment is right", each with a count.
- 3.2 **Each row** — pillar mark, client name (tap → profile), the gesture idea or the raw detail, a quoted original, the "when" chip, status pill Idea / Planned / Done / Declined, and "Needs an owner" or the owner's name.
- 3.3 **States** — "Reading the studio's list…"; "The queue needs its index…" (a collection-group index must be deployed); empty "Nothing on the list yet".
- 3.4 Found in passing: a "Passed" bucket exists in the type and can never show; `includeDone` exists and no control exposes it, so a finished gesture disappears from Operations.

**My take.** A leader's list of the gestures the team promised itself. It belongs next to Renewals as a Monday question, but it is the only Operations tab with no action on it — the owner and the status are set on the client's Life section. Either give it its actions (claim, mark done, from the row) or move it into Relay's Team cockpit as an open-loops lane, where the same leader already looks for unowned work.

*Expected:* who — studio leader · why — see whose gesture is due and whether anyone owns it · when — weekly.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 4. Studios — `features/admin/studios/` (+ equipment, upkeep, provisional)

Lists **every** studio in the company to everyone who can open Operations; opens on the first. The details form has no screen gate; create and delete are admin-only on screen. The rules let any signed-in trainer create or update any studio document (`firestore.rules:1634–1636`, open by decision until Gate C).

- 4.1 **Locations** — each studio with a Mindbody badge and "N active clients" (one server count, not per-row reads). "No studios yet."
- 4.2 **Registry needs attention** — shown when a studio and its franchise disagree about each other; "Repair N".
- 4.3 **Add a location** (admin) — Studio name, Time zone, Mindbody Linked / Offline, Site ID, Location; "Create studio" (sets `ownerId` to the creator).
- 4.4 **Studio details** — dirty-tracked save bar over name, contact e-mail, phone, address, time zone, Mindbody Site ID and Location ID, corporate / franchise, accent colour, Linked / Offline. Writes only the changed keys.
- 4.5 **Franchise** (network picker) — writes `networkId` immediately, outside the save bar; warns when the two sides disagree.
- 4.6 **Team** — read-only list of who reaches this studio (home vs cross-studio; "Mindbody linked" / "No staff ID"). "Roles are set in Staff & Roles, not from this screen."
- 4.7 **Delete this studio** (admin) — confirms; unlinks from every franchise first.
- 4.8 **Franchises** panel (admin) — create (name, state) and delete (unlinks its studios).
- 4.9 **Equipment** — "Add the standard set" (seeds the catalog's standard machines onto this floor), "Add, retire or build a machine" (opens the inventory manager inline), per machine "Local setup" and "Upkeep". "No equipment yet." No screen gate on any of it except Upkeep; the rules allow only that studio's leaders or an admin — a plain Franchise Owner is refused by the rules and finds out from a toast.
- 4.10 **Studio inventory manager** — search; **Reorder** (drag; "MSF standard" resets to the catalog order); a **second** "Add standard set"; **Custom machine** (name, "based on" a catalog machine so it can be compared); per card **We have this / We don't have this**. The same manager opens from Learning → Catalog.
- 4.11 **Local setup** dialog — this studio's name, manufacturer, serial and notes for one machine; anything equal to the catalog value is dropped so the studio keeps inheriting corrections.
- 4.12 **Upkeep** dialog — "Cleans logged" / "Services logged" with Up to date / Never logged / Due / Overdue (clean daily, service every 90 days); "Log some work" (Cleaned / Deep cleaned / Serviced or repaired + note) → `studios/{s}/upkeepLog`; history merged with Relay's tasks, 30 rows.
- 4.13 **Temporary profiles** — mint a temporary client or trainer for the selected studio (duplicate-name guard); a "14 days old" banner with "Reconcile now"; "Nothing temporary here."
- 4.14 **Reconcile** dialog — ranks Mindbody records by e-mail, phone, birthday, name and studio; side-by-side compare; two-step "Merge into this record" → "Yes, merge them"; repoints every collection that named the temporary id; cannot be undone. Found in passing: the merge also rewrites every trainer's Kaizen Roster that named the temporary client, which the rules allow only for an admin — a studio leader's merge would stop part-way (`mergeClient.ts:121–146`). Needs a check before anyone but AJ runs one.

**Fields on a studio with no editor here:** `journeyCutoverDate` (no UI anywhere), `headTrainerId` (never written), `ownerId` (creation only), `shiftHours` and `deepCleanIntervalDays` (Relay → Team → Standards), `autoSyncEnabled` / `syncIntervalMinutes` (Mindbody tab), `machineSettings` (legacy, read by five screens, written by none), `notificationSettings` (read by nothing, written by nothing — delete).

**My take.** This tab is doing two jobs for two different people. The **registry** job (create a location, franchises, the Mindbody link, delete) is an administrator's, done a few times a year. The **my-studio** job (the floor, local setup, upkeep, temporary people, the cutover date, shift hours, machine standards) is a studio leader's, done at setup and whenever a machine arrives or leaves — and it is the job AJ's sentence is about. Today the second is buried behind the first, listed to everyone, and split with Learning → Catalog and Relay → Team. Proposal in D.3.

*Expected:* who — admin for 4.1–4.8; studio leader for 4.9–4.14 · why — set up and maintain the floor, keep the studio's own record straight · when — at setup; when a machine arrives or leaves; when someone new is not in Mindbody yet.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 5. Staff & Roles — `features/admin/staff/AdminStaffTab.tsx`

Franchise owner or admin on screen. Scope select: "{studio} only" / "Everyone in the network".

- 5.1 **Tiles** — Waiting for approval · On the schedule, no account · No Mindbody match · Duplicate accounts.
- 5.2 **People list + search** — Mindbody's staff list, Firestore accounts and pending access requests merged; "Nobody to show" / "No staff at this studio yet."
- 5.3 **Detail panel** — badges Active / No Mindbody match / No app account / Waiting for approval / Temporary / Never signed in.
- 5.4 **Role** (Life Transformer, Studio Leader, Owner, **Admin** — no Head Trainer, Founder or Studio Owner), **Home studio** (any studio in the company), **Initials**, **Show on the calendar**. The Role select is enabled for anyone on this screen while approving a new hire, so a Franchise Owner can approve someone straight in as a System Administrator, and the rules do not cap it (`firestore.rules:967–975`). Fix without asking: cap what a non-admin may hand out.
- 5.5 **"Approve and create the account"** — confirms; creates `trainers/{uid}` keyed on the sign-in id (the Sep 6 random-id bug is closed here).
- 5.6 **"Save access"** — always enabled, no dirty tracking, no confirmation; writes role, home studio, calendar flag, initials.
- 5.7 **"Confirm the Mindbody link"** — writes the staff id.
- 5.8 Found in passing: the heading renders literally as **"Staff &amp; roles"** (`AdminStaffTab.tsx:203`). Fix without asking.

**My take.** The model underneath is right (Mindbody puts people on the schedule; approval mints the account). The open questions are all *who*: the roles page says studio leaders run their studio's staff, but the tab is franchise-owner-and-up; and the Franchise dashboard has a second, older editor for the same fields (17.4). One editor, scoped — a leader sees their studio, an owner their studios, an admin everyone — would close both.

*Expected:* who — studio leader for their own team; owner across their studios; admin · why — approve a new hire, set their role and home studio, link them to Mindbody · when — when someone joins or leaves, rarely otherwise.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 6. Clients — `features/admin/clients/AdminClientsTab.tsx`

Active studio by default; "Every studio (search required)".

- 6.1 **Count badge** (one server count) and a **read budget** ("N read · M left", 200 per visit).
- 6.2 **Search** — "Name, email or Mindbody id", surname range on the server, the rest matched on the fetched page; at least three characters.
- 6.3 **Results** — name, home studio, Mindbody id or "not in Mindbody", Temporary / Active / Inactive; tap → profile; "Load more" (50 a page). "Nobody found".
- 6.4 Found in passing: an "Every studio" search runs with no studio filter, and the rules refuse a whole query when any returned client is outside the reader's studios — for a studio leader that search may fail as a whole with the generic "Could not load clients." Check on the iPad.

**My take.** It is the trainer-side Client directory again with two extras: cross-studio lookup and the Temporary / Inactive badges. If leaders reach clients from the Hub and the directory, this tab is a "find someone who is not on my roster" tool and could be a mode of the directory instead of a tab.

*Expected:* who — studio leader, owner · why — find a client who moved studios, went inactive, or is temporary · when — rarely.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 7. Catalog — `components/machines/AdminMachinesTab.tsx` + `AdminMachineCreator` + `MachineDefinitionForm`

Franchise owner or admin on screen; **admin only** in the rules. No studio picker — one shared catalog. "The shared default set. Every studio inherits these, so a correction here reaches every floor that has not overridden that field."

- 7.1 **Non-admin notice** — "The catalog is shared by every location, so writes are limited to admins…" — informational; nothing below it is disabled for a franchise owner, who can fill the whole form and then get "Could not save. Catalog writes are admin-only."
- 7.2 **Search** and **Show retired**.
- 7.3 **New machine**.
- 7.4 **Machine cards** — name, id, Retired / Draft / "Never to failure" badges, movement · region · cadence.
- 7.5 **Standard set** switch per card — instant write, no confirmation. (This is what "Add the standard set" on a floor copies.)
- 7.6 **Edit**.
- 7.7 **Retire / Restore** — asks with a browser `window.confirm` only when a studio still has the machine; a count of zero, or a failed count (index building), retires with no question.
- 7.8 **The machine form**, eight sections, all open by default: Identity & Kinematics · Target Musculature (body diagram + primary / secondary / synergist) · Universal Baseline (seat, pad, restraints, grip, starting gap) · Body Type Adjustments · Alignment Checkpoints (up to four) · Execution & Cadence (hand-off, load-up, seconds, turnarounds, cues) · Safety (never-to-failure, warnings, contraindications) · **Adjustable Dials** (add / rename / retype / delete a setting field, a "House default" per field, male / female baseline load).

**My take.** This *is* the MSF standard AJ described, and admin-only is right. Two fixes without asking: hide the tab from franchise owners or disable authoring for them (the form pretends), and route Retire through the house confirm. One decision: whether the eight-section form is the admin's editing surface or whether the Learning → Catalog wiki (where the same content is read) should be where an admin edits it, with this tab reduced to the dials and the standard-set switch.

*Expected:* who — admin (AJ, later a head-office role) · why — add or correct a machine every studio inherits · when — when a new model arrives or the method changes.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 8. Routines — `components/routines/AdminRoutineTemplatesTab.tsx`

Everyone in Operations; authoring gated inside (`canAuthorTier`). The studio picker is independent of the active studio.

- 8.1 **Company Standards / Studio Templates** — "Company Standards every studio sees… Studio Templates what ONE location adds for itself".
- 8.2 **New company standard / New studio template** — disabled unless the person may author that tier.
- 8.3 **Studio select** (Studio Templates only).
- 8.4 **Template cards** — name, description, numbered machine sequence with per-machine notes; **Edit**; **Delete** — one tap, **no confirmation** (`:192–204`). Fix without asking.
- 8.5 **"Saved by trainers at this studio"** — trainers' own presets, read-only, with **Promote** ("makes it an official studio template; the trainer's original is left alone").
- 8.6 **The template form** — name, description, machines (needs at least one).

All three tiers live in one `routinePresets` collection with a `tier`; the rules match the tiers (company: admin; studio: that studio's leaders; trainer: anyone).

**My take.** Exactly the three-layer model, already built. The audit questions are about *reach*: can a trainer actually start a client from a studio template on the profile (the Sep 13 workbook asked this and it was never answered), and should the template's machines be the studio's floor rather than the app-wide list.

*Expected:* who — admin for company standards; studio leader for studio templates · why — the starting A/B routines a new client is built from · when — at setup and when the method changes.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 9. Insights — `features/admin/insights/AdminInsightsTab.tsx`

Studio picker lists **every** studio (no permission filter); Window 7 / 30 / 90 days. One query on `sessions`, capped at 1,500 with a notice.

- 9.1 **What stands out** — silent under 20 sessions ("Below 20 the rates swing too much to mean anything"); otherwise sentences: studio completion under 85 %, a trainer with eight-plus sessions under 85 % completion and three unclosed, one trainer over 45 % of the load, narrow machine variety, return rate under 50 % or 80 %-plus, and good news at 97 %+. No note-rate finding, by rule.
- 9.2 **Six tiles** — Sessions · Never closed out · Clients seen (new in the foot) · Typical session · Sessions with a note · Client return rate.
- 9.3 **By trainer** — sessions, share, closed out, clients, machines used, typical; "small sample" under eight; "Volume is a rota fact, not a ranking."
- 9.4 Found in passing: a studio a leader may not read shows the same copy as a quiet studio ("No sessions were recorded…") because a refused read is treated as empty. Fix without asking: list only readable studios, and say "could not be loaded" on a refusal.

**My take.** Sentences-not-scores done properly. The question for the audit is cadence — whether a leader reads this weekly, monthly, or only when something feels off — because that decides whether it stays a tab or becomes lines on the Monday page.

*Expected:* who — studio leader, owner · why — spot a floor that is lopsided, sessions never closed, a return rate slipping · when — weekly or monthly.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 10. Machine fit — `features/admin/machine-fit/AdminMachineFitTab.tsx`

"This studio" (live, active studio) for everyone; "All MSF studios" (weekly, k-anonymous, studios named, clients never) for admins. Read-only. Built Sep 17, not yet seen on an iPad.

- 10.1 **Scope switch** (admin) with the explainer line for each.
- 10.2 **Machine list** — every floor machine with "N set up" / "Nobody set up yet" and a "N to look at" badge; list in landscape, select in portrait.
- 10.3 **Per-machine report** — tiles Set up · With a height on file · Could be compared (needs five similar clients) · Worth a look; **Worth a look** rows name the client and the reason and open Programming → Setup in check mode (the tab's only way out); **What follows what** (in words); **By height**; **By setting** with a value picker and "Other values"; **Set-ups seen together**; **By studio** (company scope; "Counts, not a ranking").
- 10.4 **States** — "Choose a studio…", "Loading machine set-ups…", "No company report yet" with the script to run, "rows left out" for clients not on the current roster.

**My take.** This is the Kaizen report for a head trainer: who is set up unusually for their build, and what the studio's normal is. It is the newest tab and the least proven; the audit should decide whether it is a leader's monthly read or a head trainer's tool that belongs nearer the floor (Learning → Catalog, beside the machine).

*Expected:* who — head trainer · why — find clients whose set-up is unusual for their build; learn the studio's normal · when — monthly, and after a new machine.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 11. Exports — `features/admin-data/AdminDataReportsTab.tsx`

Franchise owner or admin; active studio only. "Data out and data in, on one screen."

- 11.1 **Date range** — start / end, default the last 30 days.
- 11.2 **Trainer & payroll** — completed sessions at this studio in the range, as a CSV.
- 11.3 **Client attendance** — schedule rows in the range, filtered to the studio in memory, as a CSV.
- 11.4 **Notice** — "Progress reports are no longer generated from here…"
- 11.5 **Legacy import** ("Limited") — "Choose a CSV"; creates clients **by exact name**, with **no home studio** (`useLegacyImport.ts:133–143`) — so an imported client is invisible to every studio-scoped screen — plus sessions and logs, with a Firestore query per row; result tiles Clients · Sessions · Logs · Failed. Because the client has no studio, the rules only let an admin run it at all.
- 11.6 **Full historical migration** ("Coming soon") — text only.

**My take.** The payroll export is a real need and probably the reason this tab exists; whose need it is (a studio leader? an owner? head office?) decides its gate. The legacy importer predates the FileMaker migration plan (ROADMAP 5, `scripts/` importer with `parseShorthand`) and cannot produce a usable client; hide it until the real importer replaces it.

*Expected:* who — studio leader or owner for payroll · why — the pay run · when — every pay period.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 12. Announcements — `features/admin/announcements/`

Franchise owner or admin. Not tied to the active studio: the audience is chosen per notice.

- 12.1 **Headline · Short update · Full message** (first two required, 120 characters, live counter).
- 12.2 **Link a Learning page** — a machine, Academy topic or card, or one studio's own page (studio-scoped notices only).
- 12.3 **Who gets it** — Everyone / One network / One studio, with the picker it needs; a live reach sentence ("Everyone at N studios in Y").
- 12.4 **Kind** (News · Shout out · Event · Tip · Holiday) and **Urgency** (Normal · Urgent).
- 12.5 **Comes down after** — 24 hours / 1 week / 1 month.
- 12.6 **Publish** — writes `hub_announcements`; "Published. It is in the alerts bell now." No confirmation.
- 12.7 **Live now** — every active notice from every studio, with **Take down** (immediate, no confirmation; the kit's rule says destructive actions confirm). Reads the whole collection.

**My take.** One composer shared with the Franchise dashboard, which fixed the "network post reached the whole platform" bug. The who question is the interesting one: a studio leader cannot post a notice to their own studio from anywhere, and Relay is where their team already looks. Either studio-scoped posting opens to leaders (one rule line) or announcements stay a head-office tool and the studio's own notices live in Relay.

*Expected:* who — owner, admin · why — company or network news, a holiday, a shout-out · when — occasionally.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 13. Mindbody — `features/admin/mindbody/AdminMindbodyTab.tsx`

Admin. Audits every studio; the manual controls act on a selected studio (starts on the active one, switchable).

- 13.1 **Check now** — asks Mindbody for the selected studio's locations; reports the count or the error.
- 13.2 **Service health** notice from the health record ("No health record has been written yet…" until one exists).
- 13.3 **Tiles** — Studios linked · Missing a Site ID · Sync stalled · Deliberately offline · Parked events (the dead-letter depth).
- 13.4 **Studios** — every studio, worst first, with link and sync badges and a one-line problem.
- 13.5 **Selected studio** — Site ID, Location ID, Last sync, Staff linked to Mindbody — read-only here (edited on Studios 4.4).
- 13.6 **Automatic sync** On / Off and **Every** 5 – 240 minutes — written immediately. These *are* read: `useAutoSync` runs in AppContent on every iPad with a shared lease, so a floor with six iPads syncs once per interval (an earlier prep note calling this "theatre" is out of date).
- 13.7 **Pull from / Pull to** + **Pull the schedule now** — reports added / updated / skipped / errors. (Also the way to restore bookings the old sweep cancelled — hub sync fixes, Sep 16.)
- 13.8 **Send a test event** · **Copy webhook URL**.
- 13.9 **Event log** — the newest 25 events for the selected studio.

**My take.** The right shape for a system screen: service up → which studio → what is it doing → what did it say. The only audit question is whether a studio leader needs a *read-only* slice of it ("is my studio syncing, when did it last sync") on their own screen, because today the answer to "why is this client not on the Hub" lives behind an admin-only tab.

*Expected:* who — admin (AJ) · why — set a studio's link up; find out why a sync stalled · when — at setup and when something breaks.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 14. Limbo — `components/AdminLimboQueue.tsx`

Admin. Company-wide queue of Mindbody events that arrived with no resolvable studio.

- 14.1 **Refresh**.
- 14.2 **Entries** — client or booking, kind badge, "Refresh Schedule" badge when the pull-sync parked it, the raw start time "(studio local, unconverted)", staff, site / location, the reason.
- 14.3 **Dismiss** — confirms ("Dismiss this event?").
- 14.4 **Assign studio** + "Lands at {time, zone}" preview + **Release to schedule** / **Set home studio**.
- 14.5 Empty: "Nothing in Limbo — Every Mindbody event has found its studio."

**My take.** Correct as an admin tool; it exists because two studios share one Mindbody site. Nothing to decide beyond whether the count should surface somewhere a leader sees it when their client is the one parked.

*Expected:* who — admin · why — release a booking that landed without a studio · when — when it happens.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 15. Bug Reports — `features/admin/bugs/AdminBugReportsTab.tsx`

Admin. The newest 100 reports company-wide.

- 15.1 **Reload**; tiles Open · Being looked at · With a stack trace · Loaded.
- 15.2 **Filters** — Status (Open / Looking at it / Fixed / Not doing), Kind (Broken / Feels wrong / Missing), Studio, search.
- 15.3 **Rows** — status, kind, "N errors", time, description, reporter and studio; open-first, then newest.
- 15.4 **Detail** — the diagnostics the feedback drawer captured (screen, client, session, viewport, theme, device, version, URL) and the runtime errors, newest first; **Status** select; **Copy as text**.

**My take.** Fine. During beta this is where "feedback, bug reports and ideas" land, so the audit question is only whether AJ wants a leader to see their own studio's reports.

*Expected:* who — admin · when — as reports arrive.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 16. System Tools — `components/AdminSystemToolsTab.tsx`

Admin. No studio.

- 16.1 **Seed a demo client** · 16.2 **Reorder trainers** · 16.3 **Rebuild trainer rollups** (no confirmation; idempotent) · 16.4 **Restore standard machines** (merges the 20 defaults back) · 16.5 **Wipe and re-initialize** (danger panel; the confirmation phrase is "confirm wipe system").

**My take.** Pre-alpha tools. Gate B already says the wipe and the seeder come off the browser (or go behind an environment guard and a server route). Nothing for the audit except confirming that.

*Expected:* who — admin only · when — almost never after beta.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 17. Franchise dashboard — `components/FranchiseDashboardView.tsx` → `features/admin/franchise/FranchiseHub.tsx`

A separate bottom-nav screen in Operations mode (owners and admins). Scope = the studios the viewer owns or that sit in their network; an admin picks a network.

- 17.1 **Network** picker (only when more than one is visible).
- 17.2 **Tiles** — Waiting to be let in · Studios needing attention · Temporary profiles · Unclaimed profiles · Staff not linked to Mindbody.
- 17.3 **Your locations** — per studio: "Mindbody on" / "Offline by choice" / "No Site ID", "Manual sync" / "Not syncing", staff count.
- 17.4 **Your team** — `FranchiseTeamManagement`: home studio, cross-studio access, role and delete — **a second editor for what Staff & Roles edits**.
- 17.5 **Announcements** — the shared composer limited to "One network" / "One studio" (never Everyone). Its feed reads the whole announcements collection and keeps the viewer's own posts.

**My take.** This is the owner's view, and its question — "is anything wrong at any of my studios" — is a good one. But it duplicates three Operations tabs (Staff & Roles, Announcements, part of Studios) with a second implementation of each, which is how the Sep 6 audit found thirteen settings editable from more than one place. The cleaner shape is one Operations dashboard with a **scope** (my studio · my studios · all MSF) that every tab honours, and the Franchise screen becomes that scope's Overview.

*Expected:* who — franchise owner · why — see across their two or three studios · when — weekly.
AJ — who: ___ · why: ___ · when: ___ · keep / change / cut: ___

### 18. Studio settings that live outside Operations (for completeness)

- 18.1 **Learning → Catalog → Studio setup card** — the studio's standard settings per machine (`studioMachineSettings`), studio leaders. The equipment screens and machine fit read it.
- 18.2 **Relay → Team → Standards** — shift hours and the deep-clean interval, leaders.
- 18.3 **Relay → Floor Map** — machine flags and wipes (`machineCare`), everyone at the studio.
- 18.4 **The gear (trainer settings)** — personal, not studio.
- 18.5 **No UI at all:** `journeyCutoverDate`, `headTrainerId`, `notificationSettings` (dead), `machineSettings` on the studio (legacy).

---

## D. How I suggest we walk it

**D.1 Settle "who" once, before the screens.** Every tab's who-question comes back to five people: the Life Transformer, the Studio Leader / Head Trainer, the Franchise Owner, the Founder / Overseer, the System Administrator. Two things are undefined today and every screen inherits the gap: (a) "a trainer who has been granted privileges" — there is no grant, only a role change; and (b) whether a Franchise Owner is an owner *of their studios* (scoped) or a company-wide role (what the rules say today, Gate B item). If AJ answers those two first, half the per-screen who-lines answer themselves.

**D.2 One sitting per group, not one per tab.** Sixteen tabs times who / why / when is too many sittings. Four sittings, in this order, each 45–60 minutes on the iPad with the real screens open:

1. **The standards sitting** — Studios (4), Catalog (7), Routines (8), plus the two outside screens (18.1, 18.2). This is AJ's stated goal, so it goes first and it is where the big design decision lives (D.3).
2. **The people sitting** — the way in (A), Staff & Roles (5), Franchise dashboard (17), Announcements (12). Who opens Operations, who manages whom, who may say what to whom.
3. **The Monday sitting** — Overview (1), Renewals (2), Delight queue (3), Insights (9), Machine fit (10), Clients (6). What a leader reads, and in what order, on Monday morning and in a shift gap.
4. **The admin sitting** — Exports (11), Mindbody (13), Limbo (14), Bug Reports (15), System Tools (16). Short; mostly confirming "AJ only" and what a leader should be able to *see* of it.

**D.3 The one design question to settle in sitting 1.** Should Operations → Studios become **My studio** (a leader's own place: details they may edit, the floor and its local set-up, machine standards, shift hours, the cutover date, upkeep, temporary profiles) and **All locations** (admins and owners: the registry, franchises, create / delete, Mindbody link) — pulling the Studio setup card and Relay's Standards into "My studio" so a studio's own settings live in one place with one save bar? If yes, the same **scope** idea (my studio · my studios · all MSF) can be the rule for every other tab, and the Franchise dashboard becomes the "my studios" Overview rather than a second dashboard.

**D.4 The four questions per screen, in this order.** Same shape as the earlier audits so the answers compare:

1. **Who opens it** — one primary person; "both" is a finding (the screen is doing two jobs).
2. **Why** — "I open this screen to…", the runner-up, and "on it but serves neither" (demote, fold into a menu, delete).
3. **When** — the moment: Monday morning · a shift gap · when a client asks · when something breaks · once, at set-up. This decides whether it is a tab, a line on another page, or a tool behind a button.
4. **Standard or studio** — which controls on it set an MSF standard, which customise this studio, and who may change each. Only on the screens where that applies.

Then the same three lines as before — what I don't trust, what is inconsistent, the one thing to add and the one thing to delete — and the marked-up screenshots (red = broken, blue = does not match, green = wish it lived here), portrait and landscape.

**D.5 Capture.** Talk-to-type answers by number ("4.9 keep, 4.10 fold into 4.9, 7 admin only, cut 7.1") is the fastest, and it is the format AJ chose on Sep 16 for this overhaul. I can also refresh the audit workbook so sheets 30–41 match this list, if AJ would rather fill sheets on the iPad as before.

**D.6 What I do with each sitting's answers.** The same three piles as the earlier rounds: bugs and consistency fixes done without asking (the "fix without asking" items above are already in that pile), design proposals for a yes / no, and decisions that touch the rules or Mindbody, which wait for an explicit OK. Then one branch, one commit per phase.

**D.7 Already in the fix-without-asking pile from this read:** the hard-coded e-mail on the studio picker (A.2); "Staff &amp; roles" (5.8); a franchise owner able to approve a new hire as Admin (5.4); Routines delete with no confirmation (8.4); Catalog's Retire without the house confirm and the form that pretends for non-admins (7.1, 7.7); Announcements' Take down with no confirmation (12.7); Insights listing studios the reader cannot read (9.4); the legacy importer hidden until the real one exists (11.5); `notificationSettings` deleted (18.5); the Delight queue's unreachable "Passed" bucket (3.4).

---

## E. Decisions so far

**Sitting 1 — standards vs studio (AJ, Sep 18 2026, his words lightly tidied)**

- **Two layers, two owners.** Admins and the owner of the company edit *all locations* and the *standard MSF template*. Once a studio exists and has a studio leader or studio owner, that person **adopts the standard Max Strength template** for the studio and then customises it — adds the machines they have, removes the ones they don't.
- **Relay becomes "My Studio".** The bottom-nav Relay tab is renamed **My Studio**, with Relay (the board) as a section inside it. My Studio is the studio's home; Operations → Studios becomes the company's *All locations* registry. (Which sections My Studio has, and who sees each, is the next group of questions.)
- **Who edits a studio's own details** — name, time zone, Mindbody link, accent colour "and so forth": **head trainer, studio leader, studio owner.**
- **Custom machines flow upward.** A studio leader or studio owner can **submit a custom machine to corporate** to be published in the MSF catalog so other studios can use it; an admin accepts.
- **Packages and renewal settings stay the studio's own.** Studios adjust "any package stuff" themselves; no company-level editor is needed for now — the code default plus the studio's copy stands.

**What follows from these (Claude, thinking ahead)**

- The open rules hole "any trainer can edit any `studios/{id}` document" now has its policy: leaders of *that* studio, franchise owners of that studio, and admins — plus the two auto-sync fields every iPad writes (`lastScheduleSyncAt`, `scheduleSyncFailures`). I will treat this answer as the OK to close it in the build round; say so if not.
- Letting a leader edit the Mindbody Site ID needs a guard: a wrong id parks every booking in Limbo and makes the studio's trainers blind. Save it only after the location lookup (13.1 "Check now") answers, and show what the id resolves to before it commits.
- The submission needs somewhere to live (a `catalogSubmissions` collection, or a flag on the roster entry) and a queue in Operations → Catalog — a Firestore structure change, so it gets its own explicit OK when proposed.
- If My Studio is the leader's home, Operations mode becomes the *multi-studio* mode. The Monday tabs — Renewals, Delight queue, Insights, Machine fit — then need a side to live on (a leader's My Studio, or the owner's Operations, or both with scope). That is sitting 3's question; flagged now so nobody is surprised.
- The rename touches labels and the shell only; the sections are a round of their own ("the My Studio round"), built after the sittings so the whole leader side is designed once.

**Who sees what inside My Studio (AJ, Sep 18 2026)**

- **Trainers** get Relay, and on the Machines side they **view the floor, the standard settings and the first-time set-up material, and contribute notes to the machines on their floor**. Editing the floor and the settings is the leader's.
- **Head trainer, studio leader and studio owner are one level** — all three can do everything in My Studio.
- **Leaders can grant a trainer access to these menus** — "to allow studios to develop their trainers into leadership". A per-person grant set by that studio's leadership, not a role change.
- **Studios under one ownership are run alike but stay individual studios.** A franchise owner sees and runs each of their studios as its own studio; nothing is forced down from the network.

**What follows from these (Claude)**

- Three tiers, stated plainly: the **studio tier** (head trainer, studio leader, studio owner, and any trainer granted access — always *at that studio*); the **owner tier** (Owner / Franchise Owner, scoped to the studios they own — Gate B's partition, now with its policy); the **company tier** (Founder, Overseer, Admin). Every gate on the leader side reduces to "studio tier at this studio or above".
- The grant is a field on the trainer document (say `managedStudioIds`, per studio) that only that studio's leaders and admins may write — it joins the `writesAccessFields()` list so a trainer cannot grant themselves — and the rules' "leads this studio" helper reads it beside the role. Never a `studioId` claim on the token (cost round, Sep 16).
- `ROLE_LABELS` shows a `StudioOwner` as "Franchise Owner". With the studio owner now a studio-tier role, that label should read "Studio Owner"; the multi-studio owner keeps "Franchise Owner".
- The Franchise dashboard becomes the owner's Operations: the same dashboard, scoped to "my studios", each studio opened and edited on its own. No network-level settings screen is needed.
- Trainer notes on machines already exist (Learning → Catalog, `writesForStudio`) — the Machines section in My Studio reuses them rather than adding a second notes path.

**The template — Catalog and Routines (AJ, Sep 18 2026)**

- **"Adopt the MSF standard" is one step.** A new studio adopts the standard set Max Strength recommends — usually the standard 20 machines, which the owner of Max Strength may adjust — **and with it the company routines and the catalog's house-default settings**, all in one adopt step. "We really want to operate as one unit as a company." A studio that adopted the standard can always add or remove machines afterwards.
- **A studio moves to a newer standard on its own timeline.** It will not always update immediately; over time it adopts machines the standard added and removes ones it no longer has. It can create entirely new machines or adopt existing ones from the catalog.
- **A published custom machine replaces the studio's own.** When corporate publishes a studio's submission, the creating studio is moved onto the published version, so it is the same across the board and a good starting point for everyone else.
- **Machine editing lives in the Catalog, on the Operations dashboard**, and from the Catalog corporate composes **the standard set** new studios adopt.

**What follows from these (Claude)**

- Two different update rules, on purpose: **machines** (the set) are *adopted* — a studio sees "new in the MSF standard" and takes each one when ready; **fields, settings and routines** are *inherited* — a corrected house default or company routine reaches every studio that has not overridden it, which is what already happens for catalog fields (Local setup drops values equal to the catalog's). One unit, without forcing a machine onto a floor that does not have it.
- "New in the standard" needs no versioning: standard machines missing from the floor are the list, and floor machines the standard dropped are marked "no longer standard" but stay usable. Nothing is written until the leader taps Adopt.
- The standard set becomes a first-class thing in Operations → Catalog — the machines in it, their order (today the order is a code map, `machine-display-order.ts`; it moves onto the catalog documents so the founder can reorder without a release), the house defaults — and the queue of studio submissions sits beside it.
- Publishing a submission is an **id migration**, not a copy: every record at the creating studio that names the custom id (client settings, sets, sessions, routines, `machineStats`, tasks) has to be repointed to the catalog id — exactly what `scripts/migrate-machine-id.ts` already does. That is too many writes for a browser tap under the rules, so "Publish" is a Cloud Function (admin-only) or a script the admin runs — a Cloud Functions change, so it gets its own explicit OK when proposed.
- "Adapt the company routines" reads as a **Make a studio copy** action on a company standard (like Promote on a trainer's preset, in the other direction): the studio gets its own editable template and the company one stays untouched.
- My Studio → Machines therefore has five parts: the floor (in service / retired / order), **New in the MSF standard** (adopt), **All MSF machines** (adopt an existing catalog machine — today under Learning), **Custom machine** (create; "Submit to MSF"), and per machine Local setup, standard settings, upkeep and notes.

**People — sitting 2, first two answers (AJ, Sep 18 2026)**

- **Operations stays open to head trainers and above, for now.** "We may further restrict head trainers from Operations, but for now head trainers and above have Operations access." So My Studio and Operations coexist for a studio leader.
- **What a studio leader may hand out:** trainer, head trainer, and the "can manage this studio" grant — **never owner or admin.** *(Whether "studio leader" itself is in their gift was not said; assumed yes, since the three studio-tier roles are one level — say so if not.)*
- **Letting someone in:** whenever a person requests to log in, a leader should be able to grant them access **and link them to an existing Mindbody staff profile if there is one**. Ideally everyone using the app is in Mindbody, except perhaps some administrative staff.

**What follows from these (Claude)**

- With both screens open to a leader, the split has to be *by job*, not by role: **My Studio is where you run the studio** (the board, the floor, the team, the settings); **Operations is where you look at it** — the Monday tools for one studio, and for owners and the company, across studios. Every Operations tab then carries a scope (this studio · my studios · all MSF) rather than listing every studio to everyone. Sitting 3 confirms which Monday tools a leader wants where.
- The grant opens My Studio's leader sections only — not Operations — unless AJ says otherwise. It is the lighter thing: "help run this studio", not "read its numbers".
- The approval flow moves to **My Studio → Team**: the "Waiting for approval" list, role and home studio, and the Mindbody link offered from the staff list (a match by name or e-mail suggested, never assumed). No staff id is required — that is the administrative-staff case.
- The rules today cap what a non-admin may hand out only on *update* (never Founder / Admin / Overseer) and not on *create* (the approval path); the build closes both, and adds the owner roles to the studio tier's exclusions.

**People — sitting 2, closing answers (AJ, Sep 18 2026)**

- **Two announcement channels.** My Studio gets its own announcements, for that studio, posted by its leaders. Operations keeps announcements for **owners and admins only** (company-wide and network).
- **Temporary profiles** (a client or trainer not in Mindbody yet) are something **a studio can do, as well as admins** — creating them and, by the same token, merging them into the real Mindbody record later.
- **The permission stance for now:** "anyone head trainer and above is going to have pretty much all access to everything. We'll restrict more later as the app goes further into development. Let's worry more about features than permission restrictions."

**What follows from these (Claude)**

- One gate on the whole leader side: **head trainer and above** (plus the grant for My Studio). No role matrix now; the only stated exclusions stay because they are cheap — a studio leader never hands out owner or admin, and only corporate edits the catalog and the standard set.
- Sitting 2 is complete. The remaining rules work for this round is therefore small: scope the `studios/{id}` write to the studio tier at that studio (plus the auto-sync fields), add the grant field, cap the hand-out. Everything else waits for the later restriction pass AJ described.
- Studio announcements reuse `hub_announcements` with a studio scope and the same bell; the composer already knows "One studio" — My Studio's version simply fixes the audience to this studio.

**The Monday page — sitting 3 (AJ, Sep 18 2026)**

- **The order is the architecture doc's:** renewals and conversation status · attendance anomalies (long breaks, erratic frequency) · performance discrepancies (a client who dropped from ten reps to five) · pain and incidents.
- **The Monday page replaces Overview as the first screen of Operations.** Today's floor snapshot is demoted, not kept as a screen of its own.
- **The Delight queue: Claude's call.** Decided — it keeps its tab and gains row actions (take it / set the owner, mark done or declined), because "Needs an owner" with no way to give it one is the friction; the Monday page carries one line ("3 gestures due this week, 1 without an owner") that opens it.
- **Insights and Machine fit are read a few times a month** — enough to stay full tabs. The Monday page carries one line from each (Insights' top "what stands out" sentence; Machine fit's "N clients worth a look") that opens the tab.

**Sitting 4, folded.** With head trainer and above seeing everything, the admin sitting reduces to three calls, made here: the legacy CSV importer is hidden until the real FileMaker importer exists (ROADMAP 5); a one-line sync status ("Mindbody: last synced 12 minutes ago" or "Not syncing — tell an admin") goes on My Studio → Studio so a leader can answer "why isn't this client on the Hub" without an admin; System Tools stays admin-only and comes off the browser at Gate B as already planned. One question stays open: who runs the payroll export and how often (asked in chat).

**What follows from the Monday page (Claude)**

- Only the first of the four questions has a screen today. The other three are **new sentences with named minimum samples**, and every one of them has to respect the migration rules in `docs/business/migration-and-prior-history.md`: a client whose Journey history starts last month is not "erratic", and nothing is said about a client until the studio's `journeyCutoverDate` is set and `historyCoverage` is complete or partial. Proposed definitions, to be tuned on real data: *attendance* — an active client with a booking rhythm of at least six sessions whose gap since the last completed session is over twice their usual gap, or whose last six gaps vary wildly; *performance* — on one machine, performed sets only, same weight, reps down by a third or more against the median of the last five, with at least five prior performed sets; *pain and incidents* — open `clinicalIncidents`, critical journal entries still in their window, and pain on the Dial from the last seven days. Each shows the sentence, the client, and the proof, or "not enough data yet".
- The Monday page is the *only* screen of the four that is new work of substance; everything else in this round is moving, scoping and fixing what exists.

---

## F. The build — two rounds, one branch each, one commit per phase

Not pushed to master until beta prep ends (AJ's rule, Sep 17). Round A first — it is the stated goal and the structural change; Round B branches off it.

**Round A — the My Studio round (the studio side)**

1. **The shell.** Relay's bottom-nav tab becomes **My Studio** with four sections — Relay (the board, untouched) · Machines · Team · Studio; trainers see Relay and a read-plus-notes Machines; the other sections are head trainer and above, or the grant. `ROLE_LABELS`: Studio Owner. The grant field on the trainer document and the `leadsHere` helper reading it.
2. **Studio.** Details with a dirty-tracked save bar (name, contact, time zone, corporate / franchise, accent colour); the Mindbody link saved only after the location lookup answers; the **Journey cutover date** (its first UI); shift hours and the deep-clean interval moved in from Relay → Team → Standards; the renewal settings and packages moved in from Operations → Renewals → Settings; the studio's own announcements; the sync status line.
3. **Machines.** The floor (the inventory manager, one implementation of "Add the standard set"), **New in the MSF standard** with per-machine Adopt, **All MSF machines** (adopt an existing catalog machine, moved from Learning), **Custom machine** with **Submit to MSF**, and per machine: Local setup, the studio's standard settings (the Studio setup card moved in), upkeep, notes. "Adopt the MSF standard" as the one first-run step for a new floor.
4. **Team.** The Team cockpit as it is, plus this studio's staff: waiting for approval (grant access, role up to studio leader or the grant, home studio, a suggested Mindbody match), Mindbody link, temporary profiles and reconcile.
5. **Rules.** `studios/{id}` writes scoped to the studio tier at that studio plus the two auto-sync fields; the grant field in `writesAccessFields()`; the hand-out cap on create and update; `catalogSubmissions` (**needs AJ's OK — a new collection**). `npm run test:rules` on AJ's PC is the run that counts.
6. **Docs.** Round doc, CLAUDE.md traps, the architecture decision log, roles-and-permissions.md, the testing checklist.

**Round B — the Operations round (the look-at side)**

1. **The Monday page** replaces Overview: the four questions in order, each a sentence with its proof or "not enough data yet"; the floor snapshot as a strip at the top; one line each for the Delight queue, Insights and Machine fit.
2. **Scope on every tab** — this studio · my studios · all MSF — replacing "every studio to everyone": Studios becomes **All locations** (the registry: create, delete, franchises, the Mindbody audit); Staff & Roles becomes the cross-studio view for owners and admins; Clients, Insights and Machine fit list only readable studios; the Franchise dashboard folds into the "my studios" scope and its second team editor is deleted.
3. **Catalog.** The standard set as a first-class view (membership, order on the catalog documents, house defaults) and the **Submitted by studios** queue with Publish. Publish is an id migration at the creating studio — **needs AJ's OK as a Cloud Function**, or runs as a script from the PC until then.
4. **Delight queue** row actions.
5. **The fix-without-asking pile** (D.7), plus: Renewals' Settings moves to My Studio (Pipeline, Brief and Outcomes stay), Announcements becomes owners-and-admins only, the legacy importer hidden.
6. **Docs**, as above.

**Open before Round A starts:** the OK for `catalogSubmissions`; the OK (or "script for now") for Publish; who runs the payroll export.

## G. Questions for AJ, grouped — one group per sitting

**Group 2 — standards vs studio: answered Sep 18, see E.** **Group 1 — who: answered Sep 18 through the My Studio questions, see E** (a per-person grant for trainers; owners scoped to their studios; the studio tier manages its own studio — staff included, pending the Team section's design). **The template — Catalog and Routines: answered Sep 18, see E.** All four sittings are complete (see E). The build is in F; three items are open before it starts.

**Group 2 — standards vs studio (sitting 1)**
- Is "My studio / All locations" the right split for the Studios tab (D.3)? Should the Studio setup card and Relay's Standards move into it?
- Who may change a studio's own details (name, time zone, Mindbody link, colour): its leader, or only an admin?
- A studio's custom machine — should its leader be able to *offer* it to the catalog, with an admin accepting? Where should that button live?
- The MSF default renewal thresholds and packages: a screen, or a code constant is fine while you are the only admin?

**Group 3 — the Monday page (sitting 3)**
- When you open Operations on a Monday, what do you want to read first — and is it renewals, attendance anomalies, performance discrepancies, incidents, in that order (§1.5)?
- Does the Delight queue need actions on it, or does it belong in Relay?
- How often would a leader actually read Insights and Machine fit — weekly, monthly, or only when something feels off?

**Group 4 — the admin tier (sitting 4)**
- Who runs the payroll export, and how often?
- Should a studio leader see a read-only "is my studio syncing" line, and their own studio's bug reports?
