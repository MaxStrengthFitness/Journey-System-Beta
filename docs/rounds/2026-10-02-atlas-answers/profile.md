# The Atlas answers: the profile branch (`oct2/profile`, Oct 2 2026)

One of three branches built from AJ's Atlas answers (the decisions page is `docs/rounds/2026-10-02-atlas-answers.md`, committed by another branch). Built on master's `7875a993`, one commit per item. Typecheck stays at **2** errors (the baseline). Nothing was pushed or deployed.

Measured at the end: `TZ=America/New_York npx vitest run --dir src` **8,614 passing in 618 files**; `npx vite build` clean; the case check prints nothing.

## 1. Add Client is a temporary profile anyone can start — done

- `CreateClientModal` now makes a **temporary profile**: it writes the same marker My Studio → Team's temporary profiles carry (`provisional`, `provisionalSince`, `provisionalBy`, `provisionalReason`; `provisionalStamp` in `features/admin/provisional/provisional.ts`), with a "Why a temporary profile" choice (New client, not in Mindbody yet · Mindbody is down · Something else). She is listed as waiting on My Studio → Team, and the existing merge (`ReconcileDialog` / `mergeClient`) moves her sessions onto her real record once Mindbody has her.
- The **Existing Client** tab and its "Route to Legacy Chart Importer" are gone. The profile's **Migration Hub (OCR)** door (Account → Fine print → Tools) is now offered to administrators only (`isSuperAdminRole`); the importer's code stays, reachable that way.
- **Rules:** no change needed. The clients create rule already lets any trainer create a client at a studio they work at; two new tests in `tests/firestore.rules.test.ts` hold it for a temporary profile (allowed at your studio, refused at another). **AJ: run `npm run test:rules`** — they were not run here.

## 2. The dead screens — done (two commits)

Each was confirmed to have no door first (the Atlas's "Unreachable or dead today" area):

- Commit 1: the **New Clients dialog** and **Machine Info deep dive** (both in `AppContent`), the profile's **full chart** (`WorkoutChartGrid`) with its machine-settings pop-up (`MachineSettingsDashboardModal`), the **delete client** dialog and `handleDeleteClient`, the **all-at-once Pulse form** (`SubjectiveStep`; its five cards stay), and the dead **`mindbody` view id**. Operations stops taking the three props it discarded (`newClientsCount`, `onShowNewClients`, `onUpdateStudio`).
- Commit 2, on its own so it can be dropped if it collides with `oct2/floor`'s tracker work: the Active Session's **performance entry pop-up**, the **first-time set-up prompt** it triggered (`SetupPromptDialog`), the **exercise history pop-up**, and the **no-client picker** (the picker file stays as the open session's Assign picker), with their state and the props that fed them (`showClientPicker`, `setShowClientPicker`, `onOpenInfo`).
- Not deleted: the Hub's client edit form and another trainer's profile (not on this branch's list; a colleague's profile is being opened from Team per the decisions page).
- Typecheck: **2** before and after (the Atlas guessed the deletions might take it to 2; it was already 2).

## 3. A printed Pulse is sentences only — done

`SubjectiveClientCopy` never prints the 0–96 overall or the coloured topic scores, even when an old Pulse's switch asks for them. Each topic that can be compared says which way it moved ("Sleep: better than last time."), the biggest win says "better since {date}", and protein and hydration lose their red and green. Mounted test: `subjective-report/client-copy.render.test.tsx`.

## 4. Notes: an Archived view with Restore — done

Anyone may still archive. The Notes page now ends with **Archived · N**, folded; each archived thread reads in full, read-only, with **Restore** (root and every update back in one batch: `unarchiveThread` → `unarchiveJournalEntries`). The archived threads come from the journal's existing load (`archivedThreads`), so no new read. The journalEntries update rule already allows it.

## 5. Watch-outs save at once, with Undo — done

Clinical flags save as each is picked or taken off; the medical history (and the contraindications box beside it, so one editor never mixes two kinds of save) when the box is left or Done is tapped. Each is one `updateDoc` of that field and `lastUpdatedBy` (`saveFieldNow` on the record form), never the Save bar. "Saved: … · Undo" under the editor writes the value before it back. Typing not yet written registers with the unsaved-changes guard. Left alone: the Intake notes card still stages into the Save bar.

## 6. The profile shows this studio's floor — done

- The **Journey grid**'s rows are the studio's floor (its own machines included, in its order: the same `studioFloorOf` list the codex's Watch-outs use, which follows the roster the Active Session reads), then any machine she has history on that the floor no longer has (`floorWithHistoryMachines` in `lib/floor-machines.ts`).
- **Programming → All Machines, Setup and their counts** read the same floor (`floorMachines` prop). The routines keep the full list so a retired machine keeps its name; the machine window opens a studio's own machine.
- One difference from the Active Session: with an empty roster the profile falls back to the app-wide list (as `studioFloorOf` always did), where the session bridges to the resolved catalog. Both list the catalog's machines.

## 7. "No longer matters" with an optional reason — done

On the 60-day review (Operations → Overview → Notes to review), **No longer** asks "Why it no longer matters (optional, one line, written on the note)". The reason becomes an update on the thread ("No longer matters: she moved to mornings.") before the note closes (`closeThreadNoLongerMatters` in `thread-write.ts`); blank closes it as before. The Notes page's own Close button is unchanged (anyone can already add an update there).

## 8. Demo Mode is its own realm — done

Verified search (the Hub and header both use `queryStudioIds`) and Add Client (`studiosInRealm`), both fixed Oct 1. Closed:

- **Announcements on the reading side**: the bell, Relay's Since you were in and the huddle now pass the iPad's studio to `useHubAnnouncements`; `announcementsInRealm` keeps only Demo Mode's notices inside it and never a Demo-only notice outside it.
- **Shared machines, notes and tips**: `useSharedMachines` and `NetworkNotes` read nothing inside Demo Mode and drop Demo Mode's own outside it (My Studio → Machines, All MSF machines, the Catalog's From other MSF studios, Learning's search).
- **Offers to head office**: no Offer switch inside Demo Mode; `setMachineOffer`/`setNoteOffer`/`setTipOffer` and `buildSubmission` refuse one; both review queues drop anything from Demo Mode.
- App-side only. **No rules change** (AJ, Oct 2: features first). If wanted later, the rules could refuse `shareStatus: "pending"` under `studios/demo-studio/**` and a `catalogSubmissions` doc with `studioId == "demo-studio"`.

## 9. One "Sign out" — done

Switch Trainer and Log Out Facility (which did the same thing since Sep 24) are one **Sign out** at the end of the trainer menu. The iPad stays pinned to its studio (`features/sign-out` keeps the pin). The testing checklist (Round "Signing out") is updated.

## 10. An access request must name a studio — done

"Not sure yet" is gone: the list starts on "Choose your studio" and sending without one says so. If the studio list didn't load, it says that instead of sending. Demo Mode is never offered. App-side only; the `access_requests` rule is unchanged.

## 11. The two machine-notes leftovers — partly

- **Done:** Programming → Setup's bulk Save writes a typed machine note to her journal (kind equipment, with `machineId`) instead of the old `machineNotes` list (`setup-save.ts`).
- **Skipped:** the machine sheet's header alert counting the one list. That is `MachineSheet`, which `oct2/floor` owns for its machine-notes change, so editing it here would collide. The profile grid's alert dot (`ClientProfileView`, still reading `machineNotes.isImportant`) was also left for the same reason.

## For AJ

- **Rules tests:** two new tests (item 1). Run `npm run test:rules`. No rules or index change to deploy.
- **No new composite index, no new Mindbody call, no Cloud Functions touched.**
- **Merging:** the second dead-screens commit ("Delete the Active Session's pop-ups no button opens") touches `WorkoutTrackerView.tsx` and its render test; if it conflicts with `oct2/floor`, it can be dropped on its own.
- **On the iPad:** Add Client (the reason picker; she shows as waiting on Team), a client's Notes (Archived and Restore), Body & Pulse → Watch-outs (Saved · Undo), the Journey grid and All Machines at a studio with its own machines, Operations → Notes to review (No longer → reason), Demo Mode's bell and Catalog (no Offer switch, nothing from other studios), the trainer menu's Sign out, and the access request form.
