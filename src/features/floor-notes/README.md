# The floor's notes on a machine

What a studio knows about the unit in **its** building — "the pin sticks at 7", "ours sits two notches lower than the card", "seat replaced March 2026" — as **one dated list per machine, with a history**. Notes round, Oct 3 2026; AJ's answer **2A**: "merge the three places into one list per machine, with dates and a history, the way client notes became threads."

## Why

Until this round a studio's machine knowledge lived in three boxes that asked for the same thing:

| Old box | Where it was stored | What was wrong |
| --- | --- | --- |
| **Studio notes** (Catalog page, folded at the foot; My Studio → Machines door) | `studios/{s}/machineNotes/{machineId}.notes` | One text, overwritten on every save; deleting a line deleted it for everyone, with no date and no history |
| **The studio's note** on the Catalog page, under Execution | `studios/{s}/wiki/machine__{id}` (an overlay) | The only one that could be offered to every MSF studio; one block of text, no history |
| **Notes about this unit** in Local set-up | `studios/{s}/roster/{id}.studioNotes` | Leaders only; shown on the Catalog only when the first box was empty |

## What it is now

`studios/{s}/floorNotes/{noteId}` — a note is a **thread**, like a client note:

- A note of its own has `threadId: null`; an **update** carries its root's id. Updates hang off the note, oldest first, so "pin sticks" → "maintenance booked" → closed "pin replaced" is one story.
- **Close** moves a note to the history (Closed · N, folded); anyone at the studio may close or **open it again**. Closing can carry what happened, written as a last update.
- **Change the words**: the note's author or a leader. **Take off the list** (archive, never delete): the author or a leader, for a note that should never have been written; its updates go with it, and a copy taken off the list still answers for the old note it came from, so that never comes back. "A leader" is the rules' `isStudioOwnerOrHeadTrainer` (`leadsStudioPerRules`), never the wider `leadsHere`, which also answers for administrators and franchise owners the rule refuses.
- Every note is signed by the Auth uid that wrote it (`authorId`), with the writer's name and the day.
- A note may carry `machineName` (for the review page) and `copiedFrom` (which old box it was copied from).

`firestore.rules` holds all of this (the words and taking it off the list for the author or a leader; "closed by" naming the person closing): read and write by the people who work there (`writesForStudio`), the machine, thread, author and day fixed for the note's life, no delete. A new note is never already offered; offering is an update (this also keeps the create rule under Firestore's 1,000-expression budget).

## Nothing old is rewritten

The three old boxes are read as they are and shown under the list as **Earlier notes**, read-only, with who and when where they say it, and a **Copy into the list** button. A copy says where it came from (`copiedFrom`), so the earlier one stops showing however the copy is changed afterwards; words already on the list are not shown twice either. The old Catalog note keeps its **Offer to all MSF studios** switch while it is shared or offered, so a studio can always take it back. Nothing here writes the old stores. Local set-up shows its old note only while one exists, so a leader can clear it once it is copied; otherwise it says notes go here.

## Sharing

A note of its own can be **offered to every MSF studio** by its author or a leader (`setFloorNoteOffer`, `features/machine-db`), and an administrator decides on Admins → Standard → **Waiting for review** (kind `floor`, "A floor note on a machine"). Shared, still-open notes appear on other studios' Catalog pages under "From other MSF studios", read through the collection-group index (`shared`, `sharedKeys`). Never from Demo Mode.

## Where it is drawn

- **Learning → Catalog → a machine** — "{Studio}'s notes", on the page and never folded, where the studio's note was (`CatalogWikiView`).
- **My Studio → Machines → a machine's door** — "The floor's notes" (`MachinesSection`; Operations → Floor mounts the same door).
- **The session's machine sheet** — read-only, under the watch-outs: the Relay flag, then the open notes with their latest word (at most four; the rest are on the Catalog), then the old Studio notes while nobody has copied them (`equipment/FloorNoteCard.tsx`, one query on `machineId` over this studio's floor notes. It has no index of its own: the database's Enterprise edition refused a single-field index setting at deploy, Oct 3 2026, and the query reads through one studio's notes, which are few).

## Files

| File | What it is |
| --- | --- |
| `floor-notes.ts` | The pure half: reading a note, threads per machine, the earlier notes, the session's lines, dates. `floor-notes.test.ts` |
| `store.ts` | Every write: add, update, close (with words), reopen, change the words, take off the list |
| `useFloorNotes.ts` | One listener for the studio's notes, mounted by the screen; a failed read is "couldn't load", never "no notes" |
| `useFloorNoteSwitches.tsx` | Who may offer what, the same on both screens |
| `FloorNotes.tsx` + `floor-notes.css` | The list. Every box that holds typing joins the unsaved-changes registry, and the list is keyed by studio and machine so a draft never follows a trainer to the next one. An update or close box's words are held by the list, not the note: a note closed on another iPad mid-sentence opens the closed list with the words still in it (they go on as an update), and one taken off the list leaves them in a card that saves them as a new note. A refused write says it isn't yours to change, never that the connection failed. `FloorNotes.render.test.tsx`; the stylesheet is held by `my-studio/look.test.ts` |
