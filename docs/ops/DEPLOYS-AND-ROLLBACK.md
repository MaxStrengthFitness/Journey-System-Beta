# Deploys and rollback, once trainers are on Journey

*Written Oct 10 2026, before the three corporate studios launch. It replaces
nothing: the ship scripts in `scripts/ship/` still do the steps, and
`docs/ops/RENDER-DEPLOYMENT.md` still explains Render's services. This page is
the routine and the way back.*

## What a deploy is today

- **A push to `master` deploys nothing.** Render can't see the repo. Every
  deploy is three presses on Render: **Manual Deploy** on the web service
  (MaxStrength App-Beta) and **Manual Build** on both cron jobs
  (`journey-cron-renewals`, `journey-cron-leaderboards`). A cron left out keeps
  running its old commit.
- **The database deploys separately**, with the Firebase CLI: indexes, rules
  and Cloud Functions.
- Once the GitHub repo moves into an organization and Render's GitHub app is
  installed on it, a push deploys all three again. Change this page then.

## When to deploy

- **After the studios close** (evenings or Sunday). A session in progress is
  safe (its sets go straight to the database, and an iPad only picks up a new
  version on the Hub), but the server's Mindbody and photo-scan calls pause for
  the few seconds the web service restarts.
- **Not between 2:20 and 3:00 AM Eastern**: the renewals job runs at 2:30 AM
  every night, and the machine-trends job at 3:00 AM on Sundays.
- **At most once a week** once trainers are on it, unless something is broken.

## The order, every time

1. **Indexes** (`firebase deploy --only firestore:indexes`). Wait until they
   say READY: `npx tsx scripts/check-live-rules.ts --key service-account.json
   --project gen-lang-client-0731527386 --database
   ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --index "<the new one>"`.
2. **Rules tests** (`npm run test:rules`). If anything is red, stop.
3. **Rules** (`firebase deploy --only firestore:rules`). New rules must still
   accept what the OLD app writes: iPads move to the new version only on the
   Hub, so for a while both versions write.
4. **Cloud Functions, only when the round changed one**, named one at a time
   (`firebase deploy --only functions:mindbodyWebhook`). Never a plain
   `--only functions`: it would also deploy the staff-photo scheduler, which
   calls Mindbody on a timer.
5. **A restore tag, then the push** (`git tag restore/<date>-before-<topic>`,
   push the tag, push `master`).
6. **Render**: the three presses above.
7. **Check**: `https://maxstrength-app-beta.onrender.com/version.json` shows
   the new commit; each cron's page says "Last successfully deployed commit"
   is the same; open Operations → Today once.

The round's ship script (`scripts/ship/ship-<round>.ps1 -Stage prepare`, then
`-Stage golive`) does steps 1 to 5 in this order and stops on the first
failure.

## Rolling back

Undo the smallest thing that fixes it. Every ship leaves a restore tag:
`git tag -l "restore/*"` lists them, newest last.

### The app (the web service and the crons)

- **Fastest:** on Render, open the web service → **Events**, find the last
  deploy that was good, and use its **Rollback**. Then do the same on each cron
  job's **Builds** list if the round changed a job. (Not yet tried on this
  service; if the button isn't there, use the next way.)
- **The git way:** `git push --force origin restore/<tag>:master`, then the
  three Render presses. This is also how master gets back in step with what's
  live after a Render rollback, before anyone ships again.

### The rules

The rules are live for every iPad the moment they deploy, so a wrong rule shows
up at once as "Missing or insufficient permissions" or a screen that never
loads. To put the previous rules back:

```powershell
git worktree add ..\rules-rollback restore/<tag>
```

```powershell
cd ..\rules-rollback; npx firebase deploy --only firestore:rules --project gen-lang-client-0731527386
```

Then check them with `scripts/check-live-rules.ts --rules ..\rules-rollback\firestore.rules`
(from the project folder), and remove the folder with `git worktree remove
..\rules-rollback`. The Firebase console also keeps each published version
(Firestore → the named database → Rules → its history).

### Indexes

Don't roll an index back. An extra index only costs a little on each write; a
missing one makes a query scan the whole collection (slower, billed by the
byte) but nothing fails. Delete an unused one later, on purpose.

### A Cloud Function

Deploy that one function from the restore tag's folder (as for the rules):
`npx firebase deploy --only functions:<name> --project gen-lang-client-0731527386`.

**The Mindbody webhook, if it misbehaves:** `node
scripts/mindbody/deactivate-webhook.js --yes-affect-production` switches the
subscription off. Bookings still arrive through the iPads' 30-minute pull;
client and sale changes wait until it is switched back on.

### Data

- **The pre-launch reset** keeps a full backup of what it deleted or cleared,
  and puts it back with its own restore mode (`docs/ops/RESET-BEFORE-LAUNCH.md`).
- **Firestore point-in-time recovery** keeps 7 days. It can export the whole
  database as it was at a given minute, from Google Cloud; it's the last net,
  slow and done with Google's instructions, so note the exact time before any
  big data change.

## Every morning after a deploy

- Operations → Today: anything "not logged" that was in fact logged.
- Render: both crons' last runs are green (failure emails are on).
- Admins → Machinery → Mindbody sync and Limbo: nothing new and stuck.
