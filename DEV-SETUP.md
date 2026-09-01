# Local Test Build — Setup Guide (Windows)

This gets the Journey System running on your PC against a **throwaway test Firebase project**, so nothing you do touches live data. The only things that decide what this app talks to are `firebase-applet-config.json` and `.env` — as long as those point at a test project (or placeholders), you cannot affect production.

> Verified in a clean environment on 2026-08-27: `npm ci` (~20s), `npm run build` passes, `npm run lint` (tsc) passes with 0 errors, and `npm run dev` boots and serves the app at http://localhost:3000 with no secrets configured at all.

> **Easy mode:** there is now a `Start-Journey-App.bat` in this folder. Double-click it and it does steps 2 and 3 for you (checks Node, installs libraries, starts the app, opens your browser). The steps below teach the manual way — worth learning, no rush.

---

## 1. Prerequisites

- **Node.js 20 LTS or 22** — check with `node -v`. (Verified on Node 22.) Get it from https://nodejs.org if needed.
- A Google account you'll use to sign in to the app.

## 2. Install dependencies

Open PowerShell in `J:\MSF\Journey-System-Beta-master` and run:

```powershell
npm ci
```

(`npm ci` installs exactly what's in the lockfile — more reproducible than `npm install`.)

## 3. Quick smoke test (no Firebase needed)

```powershell
node scripts/setup-firebase-config.cjs   # generates a dummy firebase-applet-config.json
npm run dev
```

Open **http://localhost:3000**. The app shell will render, but sign-in won't work yet — the config is fake. That's expected; it proves the toolchain works. Stop the server with `Ctrl+C`.

To use a different port: `$env:PORT=3001; npm run dev`

## 4. Create a free test Firebase project (one time, ~5 minutes)

1. Go to https://console.firebase.google.com → **Add project** → name it something like `journey-test`. (Skip Analytics.)
2. **Build → Authentication → Get started → Sign-in method** → enable **Google**.
3. **Build → Firestore Database → Create database** → choose **Start in test mode** (fine here — this project will only ever hold fake data; it also lets the seed scripts write without auth).
4. Project settings (gear icon) → **Your apps → Add app → Web** (`</>`), name it anything, register. Copy the config values it shows.

## 5. Point the app at your test project

Delete the dummy `firebase-applet-config.json` from step 3, copy `firebase-applet-config.example.json` to `firebase-applet-config.json`, and fill in the values from step 4:

- `projectId`, `appId`, `apiKey`, `authDomain`, `messagingSenderId`, `measurementId` — straight from the Firebase console
- `firestoreDatabaseId` — use `(default)`
- `storageBucket` — `<projectId>.appspot.com` (or as shown in the console)

This file is gitignored, so your values stay local.

## 6. Make yourself the admin

The codebase came back with the contractor's personal Gmail hardcoded as the auto-provisioned super-admin. Replace `developertesting336@gmail.com` with **the Gmail you'll sign in with** in these two files:

- `src/hooks/useAuthInitialization.ts` (line ~83) — this is the check that auto-creates a "System Admin" profile on first sign-in
- `src/components/StudioSelectionView.tsx` (line ~62)

(There's a third occurrence in `scripts/purge-database.ts` line ~34 — see the warning below before touching that script.)

## 7. First run with real sign-in

```powershell
npm run dev
```

Open http://localhost:3000, sign in with the Google account from step 6. Your admin profile is created automatically. Then seed a couple of studios so the app has something to show:

```powershell
npx tsx scripts/seed-studios.ts
```

Refresh the browser — you should be able to pick a studio and start creating test clients/machines through the UI.

## 8. Optional extras

| What | How | Needed for |
|---|---|---|
| Gemini AI features (chart OCR, guides) | put `GEMINI_API_KEY` in `.env` (copy `.env.example`) | AI features only |
| Live MindBody calls in the Integrations Hub | `MINDBODY_API_KEY`, `MINDBODY_SOURCE_NAME`, `MINDBODY_SOURCE_PASSWORD` in `.env` — **use MindBody sandbox credentials (Site ID -99) only** | Integrations Hub sync buttons |
| Realistic data | export `firestore_backup.json` from live, then `npx tsx scripts/import-backup.ts` | demo/testing with real-shaped data — note this is real client health data, keep it local and consider purging the test project after |
| Real security-rule behavior | paste the contents of `firestore.rules` into Firestore → Rules in the console (test mode is wide open until you do) | permissions testing |
| A "Healthy" webhook status card | the Integrations Hub health card reads `system/health` from Firestore; it shows Offline until a webhook or script writes it. Fine to ignore locally. | cosmetics |

## 9. Things that intentionally do NOT run locally

- The **MindBody webhook Cloud Function** (`functions/`) — real-time MindBody pushes need a deployed function. Local UI work doesn't need it.
- Scheduled analytics functions — same.

## ⚠️ Warnings

- **Do not run the root-level utility scripts** (`reset-health.js`, `register-webhook.js`, `deactivate-webhook.js`, `send-test-webhook.js`) or `scripts/purge-database.ts` from a machine that has Google Cloud credentials: several of them still hardcode the **live** project ID (`gen-lang-client-…`), and `purge-database.ts` is destructive.
- `npm run clean` uses `rm -rf`, which fails on Windows — just delete the `dist` folder manually if you ever need to.
- Never paste your **production** Firebase config into this copy. Test project only.
