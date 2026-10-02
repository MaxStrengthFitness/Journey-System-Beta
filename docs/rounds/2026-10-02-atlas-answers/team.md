# The Atlas answers — the team branch (`oct2/team`, Oct 2 2026)

Thirteen of AJ's answers about Mine, the Calendar, profiles, Operations, Relay and notices. One commit per item on master's `7875a993`. The decisions page is `docs/rounds/2026-10-02-atlas-answers.md` (committed by another branch).

## What AJ must do before or with this branch

1. **Indexes first** (`firebase deploy --only firestore:indexes`), two new:
   - `ford` collection group: `studioId` + `followUpAt` (item 6, Get to know's follow-up questions).
   - `sessions`: `status` asc + `createdAt` desc (item 13, the Admins dashboard's sessions left open).
   Until they are built the Enterprise database answers by scanning: nothing fails, it costs more.
2. **Rules tests, then rules** (`npm run test:rules`, then `firebase deploy --only firestore:rules`). Four small changes, each in its own block, each with tests in their own `describe` ("oct2 team: …") at the end of `tests/firestore.rules.test.ts`:
   - `taskTemplates` writes and the `taskInstances` assignment fields ask `teamJobLeaderAllowed` (item 8).
   - A new `match /hub_announcements/{announcementId}/acks/{uid}` block (item 9).
   - `'team'` joins the Journal's `noteType` list (item 11).
   - No change for item 6's read: the follow-up branch is inside the studio like the other three; a test holds it.
   The `oct2 team` blocks were run on the emulator here (7 passed); AJ's full run is the one that counts.
3. Then the app (`git push origin master`). Every change is additive, so the running app is unaffected by the rules going first. Before the rules are deployed: Mark all read still answers each person's own notice (the count just doesn't get their answer), a franchise owner's Assign is refused as before, and a Team member note won't save.

## Per item

**1. One "Mine" everywhere — done.** `src/lib/mine.ts` (tested) is the rule: booked with you, or coached by you in the last 60 days (the nightly record's `coachIds`, under every id you go by). Asked by the Client Directory's view (now **My clients**), the Hub's Opportunities (**My clients**), My Profile's **My clients** (the count is yours by the rule; others you trained stay below as "Trained with you before") and Relay's follow-ups (**My follow-ups**, under every id, not only the trainer document's). Labels: the Hub's Focus "Me" is **My day**; Relay's "Mine" door is **My work**, the shift strip's toggle **My work** / "My shift today". Kaizen, the top trainer and an old tally no longer make a client yours (Kaizen keeps its own chip). Left as is: a session finished today joins `coachIds` tonight; My Profile and Relay hold no bookings, so there it is the coached half only.

**2. The Calendar — done.** Everyone sees the whole team: it opens on Entire team and anyone may pick any trainer (`isAdmin` no longer narrows anything). Month's Events are clients' FORD dates (`features/calendar/ford-events.ts`, tested): every client's Mindbody birthday every year with her name ("Ruth Avery's birthday"), one-off dated details, annual details, and window details (a vacation, `effectiveFrom`–`effectiveUntil`) across their days, from the Hub's own FORD query asked about the month on screen (`useCalendarFord`: no new index, no rule change, read once per studio and month, forgotten at sign-out). The frozen `client.events` list is no longer read. Titles wrap (a name is never cut), "+N more" past two. Not done: a window detail with no `eventDate` is only found if the read brings it (the query asks for annual and dated details); a vacation saved only as a window and noted long ago won't show. Week and Day views show sessions only, as before.

**3. A trainer's own Edit profile — done.** The form no longer offers or writes full name, email, Mindbody Linked or the Staff ID (bio, certifications, start date, nickname, photo, initials and colour stay); a line says leaders keep them on My Studio → Team. The staff editor behind My Studio → Team (and Operations → Staff & Roles) gains Full name, Email and Mindbody Staff ID; a save writes only what changed, a Staff ID sets `mindbodyLinked`, a name change refreshes `searchTokens`. No rule change (trainerLeads already lets a leader write them). Not done: the rules still let a trainer write those fields on their own document (AJ: permissions later).

**4. A colleague's profile from Team — done.** Each person's card on My Studio → Team has "{Name}'s profile" (or "Your profile"). What a colleague sees is `trainer-profile/visibility.ts`'s, unchanged: no contact details or Mindbody link for a peer, no Edit, and the agreed week read-only.

**5. The top left inside Operations — done.** In Operations and the Admins dashboard the studio name and the logo go back to the Hub in trainer mode (`AppHeader`'s `studioClickGoesHome`); trainer mode still opens the picker. 'Looking at' stays the only switch in there.

**6. Get to know — done.** A dated FORD detail whose day was in the week before the booking (an annual one too) offers "Ask how it went"; a detail with a Follow up next time question offers the question in the trainer's words. One per client: a day coming up, then a follow-up, then one that just happened, then news. Both say a small **Note** tag (Note loudness) in the Opportunities row and the peek. The Hub's one FORD read reaches a week further back and gains a fourth branch, `followUpAt` in the last 60 days (new index above).

**7. Relay asks — done.** A question's Answer only opens it; the panel offers Take it to anyone who opened it to read. The card's Take it / I can, the panel's Take it and the asks lane's Take it (it said Claim) are the only claims; a claim still puts a line on the asker's bell, in-app.

**8. Franchise owners on a studio's shift — done (rules).** See the rules list. The app already offered them Assign (`leadsHere`); `docs/KNOWN-TRAPS.md` updated.

**9. Notices — done (rules).** Mark all read (Since you were in, and the bell) also says I've read it on every notice that asks. The bell's announcement cards offer I've read it. A reader's answer is also written to `hub_announcements/{id}/acks/{uid}` (`{ at, name }`, server time, by the reader alone) in a separate caught write. The poster, the studio's leaders, franchise owners and administrators see "9 of 12 have read it" (`admin/announcements/read-count.ts`: the people the notice reaches, the poster left out; unknown, never zero, while unread); anyone else sees nothing and opens no read. Nobody is pinged. Answers given before this ships are only in each person's private record, so the count starts from the deploy.

**10. A leader naming someone on a team job — done.** `namedBy.{personId}` = `{ byId, byName, at }` on post and on adding people (removed with them); the sheet and the card say "Put on it by Sam 10:05 AM". No rule change.

**11. Leaders' notes about trainers — done (rules: one word).** A seventh Journal type, **Team member** (Who · What happened · What I'll do), offered to `leadsHere`, with a Team shelf; Who is picked from the studio's team in name order. An ordinary private note at `trainers/{uid}/notes`: no new collection, never shared.

**12. Trends and Hours — done.** Trainers in name order on both (and in Today's brief, which reads the same list); the observations that named one trainer (sessions left open, most of the floor, few machines) are gone; the studio-wide lines stay.

**13. Unfinished sessions — done.** Operations → Today's Needs you lists sessions left open (`admin/overview/left-open.ts`, the Hub's `isSessionValid`) from the 14 days the page already reads, with whose, who started it, last active and machines logged, and **Open the session** (that client's session in trainer mode, where the Active Session finishes it or starts again; oct2/floor's "Finish it as it was" lands there). It counts in Needs you. The Today list is as of when the page opened (that read is one-shot). The Admins dashboard's Home adds one bounded query (new index above) and one item, "3 sessions were left open: Solon (1) and Westlake (2)", or "couldn't check". Not done: discarding a session from Operations (it deletes sets and touches the client's totals; left to the Active Session's own flow).

## Typecheck, tests, build

Typecheck 2 (the baseline). `TZ=America/New_York npx vitest run --dir src`: 8,624 passing in 619 files. `npx vite build` builds. `git ls-files | tr A-Z a-z | sort | uniq -d` prints nothing.
