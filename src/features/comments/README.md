# features/comments — comments on Learning pages, with @tags

Round: Learning + Planner, Sep 2026. AJ asked for this:

> "each area can have comments and people should be able to tag people in the comments maybe?"

He chose **own studio, with tagging**:

- Each studio sees only its own comments on a page.
- A comment can tag trainers at that studio.
- A tagged trainer hears about it in their bell, and nowhere else.

## Where comments appear

At the foot of every Learning page that is a page:

- a machine, on the studio's floor and in All MSF machines — one thread, because both pages are the same ref;
- a studio's own page;
- an Academy topic, quick card, spoken script and deep dive.

Indexes, the phrasebook and the glossary have none; they are lists, not subjects.

## How it works

| | |
| --- | --- |
| Stored at | `studios/{studioId}/comments/{commentId}` |
| A page's thread | `where("targetKey", "==", learningRefKey(page))`, `orderBy("createdAt")`. Composite index in `firestore.indexes.json` |
| Fields | `studioId`, `targetKey`, `target` (the page as a stored Learning ref, so the bell can open it), `body` (≤ 2,000), `authorId` (the Auth uid), `authorName`, `mentions` (`[{ id, name }]`, ≤ 10), `createdAt`, and `editedAt` once edited |
| Read and post | Anyone who works at or runs the studio, administrators, franchise owners (`writesForStudio`). Unlike the older studio blocks, this one checks the studio on reads too |
| Edit | The author only. The words and the tags change; nothing else does |
| Delete | The author, the studio's leaders, administrators |

## Tagging

- **Type @ and a name.** A list of people at the studio who can sign in appears under the box; tap one (or use arrows and Enter). `@Their Name` goes into the text.
- **Only the tags still in the text count.** A tag deleted from the text before posting is not a tag: `mentions` names only people the words still name (`mentionsIn`).
- **Posting rings each tagged person's bell** — "Alex tagged you on Leg Press", with the start of the comment. It uses the new `comment-mention` kind, and the link carries the page, so tapping it opens that exact page.
- **An edit rings the bell only for people it newly tags.**
- **Nobody is tagged who can't hear it.** An unclaimed placeholder profile, or one a claim has replaced, can't sign in, so it is left out of the list.

## Privacy

Comments stay on the page for everyone at the studio, so the composer asks people to keep client names out. There is no client field for one to go in (`hasOnly` in the rule), the same guard the playbook and wiki use.

## Files

| File | What |
| --- | --- |
| `comments.ts` + test | Who can be tagged, typing and inserting a tag, which tags count, drawing tags, parsing |
| `hooks.ts` | One listener per open page |
| `mutations.ts` | Post, edit and delete, and the bell |
| `CommentsContext.tsx` | Studio, author, people, leader flag — provided once by `LearningView` |
| `CommentsPanel.tsx` | The thread and the composer |
| `comments.css` | On the wiki's `--wk-*` tokens |
