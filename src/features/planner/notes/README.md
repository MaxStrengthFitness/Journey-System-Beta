# features/planner/notes — the Planner's Notes tab

Round: Learning + Planner, Sep 2026. AJ asked for:

> "an area where trainers can store notes in folders and link clients to those notes to build plans and plan routine changes or additions or retention strategies or injury plans, just personal notes"

For sharing, he chose **private, with a Share button**. Only the author reads a note. Sharing puts it where anyone who can open the linked client can read it.

## What a trainer sees

- **The Notes tab.** Two panes on a landscape iPad: the list, and the open note beside it. In portrait the note opens over the list, and Back returns to it.
- **Folder chips.** All, Pinned, Shared and Unfiled come first, then the trainer's own folders, then **+ Folder**. With a folder open, a bar offers **Rename** and **Delete folder**. Deleting a folder moves its notes to Unfiled; no note is deleted.
- **Filters.** Search matches every word against the title, the body, the kind and the linked clients' names. A kind filter sits beside it.
- **A note.** It has a title (optional: with none, the first line of the body becomes the title), a kind, a folder, a pin, the clients it is about, the body, and a **Share** switch. It saves explicitly, with Save at the top so the iPad keyboard never covers it.
- **In a client's profile**, under **Goals → Plans from the team**, are the notes shared onto that client.
  - **Write a plan** opens the Planner with a new plan about the client already started.
  - The author gets **Edit in your Planner**.
  - The studio's leaders get **Take off the record**.

The kinds are Note, Plan, Routine change, Retention and Injury plan. They are a coloured dot beside the name, so the colour is never the only cue.

## Where it lives

| Path | What | Who |
| --- | --- | --- |
| `trainers/{uid}/notes/{noteId}` | the note | the author only (uid in the path) |
| `trainers/{uid}/noteFolders/{folderId}` | the folders | the author only |
| `clients/{clientId}/sharedNotes/{noteId}` | a shared note's copy | read: whoever can open the client (like InBody). Write: the author, if they can edit the client. Delete: the author, the studio's leaders, administrators |

`uid` is the Firebase Auth uid (`auth.currentUser.uid`), never the trainer document's id, which differs on older accounts. The rules are in `firestore.rules`: `trainerNoteValid`, `noteFolderValid`, `sharedNoteValid`, and the `sharedNotes` match. They are tested in `tests/firestore.rules.test.ts`.

**Nothing new to deploy but the rules.** There are no new indexes: every query is a single-field order on one collection. The client search reuses the directory's two queries and their indexes.

## Decisions

- **Private by path, not by a field.** This follows the personal task lists (`TaskScope` in `features/studio-tasks/types.ts`). A note can name a client and describe an injury. With a `visibility` field, privacy would rest on every future query remembering to filter on it. Here it cannot be forgotten: not even a studio owner can read another trainer's notes.
- **Sharing copies the note onto the client's record.** Opening the author's own tree to others was the alternative. With a copy:
  - the note is read the way InBody scans are, by exactly the people who can open that client;
  - it outlives the author's account;
  - it carries nothing about any other client.
- **A shared note is about exactly one client.** A shared copy is visible at that client's studio. A note about two clients would show each client's name to the other's team. The editor and the rules both enforce this (`trainerNoteValid` requires `clientIds == [sharedWith]`). While a note is shared, its client is locked: switch Share off to change it.
- **One batch per save.** The note and its copy are written, rewritten or removed together (`sharePlan` in `notes.ts`), so a note can never say "shared" while the copy is missing or stale. The copy is overwritten whole on every save, never merged. That is why it has no `createdAt`, and why the rules can check its full shape each time.
- **A leader can take a copy off; only its author puts it back.** The author's note still says "shared" afterwards. When they next open it, the editor checks with the server (`useSharedCopy`, which ignores cache-only answers) and offers **Put it back** or switching Share off.
  - Deleting or unsharing never fails because the copy is already gone: the delete rule allows `resource == null`.
- **Explicit Save, nothing lost.** A plan should reach a client's record when its author says it is ready, not half-typed. Every change waits in a session stash (`draft-stash.ts`) until it is saved or discarded. That survives switching tabs, opening another note, or visiting a profile.
  - The list marks those notes **Unsaved changes**, or **Draft** for a note never saved.
  - The stash is module state, keyed by uid, and never touches `localStorage`: studio iPads are shared.
  - An unsaved edit to a saved note reopens only once the notes have loaded. Saving it before the saved version is known would lose what the save compares against — whether it was shared, and with whom — and could leave a copy on a client's record after Share was switched off (review fix).
- **A folder that's gone doesn't lose its notes.** Deleting a folder moves the notes in it, read fresh from the database rather than from the screen's list (which holds the newest 500, and may still hold a note deleted on another iPad). A note that still points at a deleted folder — saved from a draft that was open when the folder went — shows under **Unfiled** (`inAFolder` in `notes.ts`). Until the folders have loaded nothing is moved between chips, and a folder is never called gone.
- **Notes follow the trainer, not the studio.** The same list shows at every location. Personal tasks, by contrast, belong to the studio they were added at.
- **Linking a client.** Today's roster comes first (the Planner already has it), then a name search at the studio the trainer is standing in. That search runs the directory's queries under the same tenancy rules (`src/lib/tenancy.ts`).
  - It searches by the first word's letters ("Al Smith" searches "Al"), and the other words narrow the results.
  - A search that fails says so; it never reads as "No client by that name".
  - A lone linked client the Planner does not hold is read once (`useClientDoc`), so Share can check their studio honestly.
  - Sharing needs the same access as recording an InBody scan: working at, or leading, the client's home studio.

## Files

| File | What |
| --- | --- |
| `types.ts` | Shapes, kinds, limits (mirrored in the rules) |
| `notes.ts` + test | Every rule: validation, titles, the share plan, sorting, search, labels, parsing |
| `draft-stash.ts` | Unsaved drafts, for the session |
| `access.ts` + test | Who may share onto, or take off, a client's record (mirrors the rules) |
| `mutations.ts` | Every write |
| `hooks.ts` | Listeners, the copy check, the client search |
| `NotesPanel.tsx` | The tab: folders, filters, list, and the two-pane layout |
| `NoteEditor.tsx` | One open note, and the client linker |
| `SharedNotesCard.tsx` | Goals → Plans from the team, in the client profile |
| `notes.css` | On the Studio Hub's `--st-*` tokens |
| `../intent.ts` | The profile's request to open the Planner at a note |
