# Teams in Journey — proposal

*Oct 3 2026. Status: proposed, for AJ to take to Jeff. Nothing is built.*
*The version with mock screens is a private Claude artifact (link in AJ's
session); this file is the record.*

## The ask

Max Strength already runs on Microsoft 365: everyone has a
`@maxstrengthfitness.com` account and uses Teams every day. Journey has grown
its own bits of messaging (Relay's Ask the team and its replies, comments
with @tags on Learning, note shares, kudos, announcements), but none of them
is a real chat. AJ, Oct 3 2026: "i think it might be smart to replace our
chat with teams integration, it just would allow trainers to see chats and
manage everything all in one app".

The proposal: **Teams carries the conversation; Journey keeps anything about
a client.**

## What already makes this easy

- Journey's sign-in already offers **Sign in with Microsoft**, locked to
  `@maxstrengthfitness.com` (`AppContent.tsx`, `MICROSOFT_ALLOWED_DOMAIN`).
  One sign-in can carry both Journey and Teams.
- The licences are already paid.
- Microsoft stopped metering the Teams APIs on **Aug 25 2025**
  (learn.microsoft.com/graph/metered-api-list): reading and sending messages
  and the change notifications cost nothing beyond throttling limits.

## Phases

**Phase 1 — links into Teams (about a day).**
"Message in Teams" beside a person's name (Team, Relay, the Hub's columns)
and "Discuss in Teams" on an ask. Each opens the Teams app at that chat
(a `teams.microsoft.com/l/chat/...` deep link). Journey is added as a tab in
each studio's Teams team so leaders can open it there. No new sign-in, no
server work, no data leaves Journey.

**Phase 2 — a Teams panel inside Journey (one round, 1–2 weeks).**
A Chat button in the top bar with an unread count opens a side panel: the
studio's channel and your own chats, read and reply. Built on Microsoft
Graph with the trainer's own (delegated) permission, through the same
Microsoft sign-in. New messages arrive through Graph change notifications to
the Render server, renewed every 30 minutes (Microsoft's rule: chat
subscriptions expire after 60 minutes, with no warning). Not shown on the
Active Session.

**Phase 3 — decide what of Relay retires (after a few weeks of use).**
Likely to move to Teams: Ask the team's free-text questions and replies,
team-wide note shares, @tag comments, kudos (or post into the channel).
Likely to stay in Journey as jobs that link to a Teams thread: cover asks,
hand-offs, team jobs, announcements that ask "I've read it".
Stays in Journey regardless: the question trail and note threads about a
client.

## Guardrails

1. **No client details in Teams.** Journey never puts a client's name or
   health detail into a Teams message. A card says "Question about a client ·
   Open in Journey"; the detail stays behind Journey's own rules. Teams is
   outside `firestore.rules`, under the company's retention policy.
2. **Notifications.** "Not building" says no outreach to trainers. Teams
   notifies people because that is what Teams does; Journey itself still
   sends nothing. This is a deliberate change to a recorded decision and
   should be written down as one once agreed.
3. **Shared iPads.** Signing out of Journey drops the Microsoft token too
   (`features/sign-out`, `forgetOnSignOut`), so the next trainer can't read
   the last one's chats.
4. **The floor.** No chat panel on the Active Session; a quiet line after
   Finish at most.

## Cost

| | |
| --- | --- |
| Microsoft licences | $0 extra — already paid |
| Graph API calls | $0 — the Teams APIs are not metered since Aug 25 2025 |
| Server | the existing Render web service; one renewal job every 30 min |
| Firestore | none new in Phase 1; Phase 2 caches nothing in Firestore |
| Build | Phase 1 about a day; Phase 2 one round; Phase 3 mostly removal |

## Open questions

1. Will franchise studios' trainers get `@maxstrengthfitness.com` accounts,
   or run their own Microsoft tenant, or none?
2. Who is the Microsoft 365 admin who approves Journey's access once for the
   company (Entra ID app registration and admin consent)?
3. Which Teams structure: one team per studio with channels, or one company
   team? The panel follows whatever the company already uses.
4. Timing against beta (Nov 1 2026, corporate) and franchises (Jan 1 2027):
   suggested Phase 1 before beta, Phase 2 after it.
