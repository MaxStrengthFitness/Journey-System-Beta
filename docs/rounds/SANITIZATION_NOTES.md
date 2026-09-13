# Sanitization notes (read me)

This copy of the project has had **secrets, account identifiers, and the business domain
replaced with placeholders** so it can be shared for code review. It is **not runnable as-is** —
you'll need to supply your own values for a test environment. Nothing else in the code was changed.

## Placeholders you must fill in to run it

**`firebase-applet-config.json`** — point this at *your own* (ideally a throwaway test) Firebase project:
- `YOUR_FIREBASE_PROJECT_ID`, `YOUR_FIREBASE_APP_ID`, `YOUR_FIREBASE_API_KEY`,
  `YOUR_FIRESTORE_DATABASE_ID`, `YOUR_MESSAGING_SENDER_ID`, `YOUR_MEASUREMENT_ID`
  (the `authDomain` / `storageBucket` derive from the project id).

**`.env` (copy from `.env.example`)**
- `GEMINI_API_KEY` — your Gemini key
- `APP_URL` — your hosted URL
- `SYNC_SECRET` — `YOUR_SYNC_SECRET` placeholder; set a real value for the sync worker
- `MINDBODY_API_KEY` — your Mindbody key (the real one is loaded from a secret, not committed)
- `VITE_MICROSOFT_TENANT_ID` — your tenant id (only if using MS OAuth)

**`firestore.rules`** — the super-admin checks were redacted:
- `admin@example.com` and `YOUR_ADMIN_UID` (line ~49) — replace with the real admin email / UID
- `.*@example\.com` (line ~194) — the domain-based access regex; replace `example` with the real domain

**`src/hooks/useAuthInitialization.ts`** (line ~51) — `admin@example.com` is a placeholder for the
super-admin email check.

**Business domain** — `example.com` / `api.example.com` were substituted for the real domain in
`AccessRequestView.tsx` and `IntegrationsHubView.tsx` (the Mindbody webhook URL).

## Also removed
- The bundled Java runtimes (`jre/`, `jre21/`) were deleted — they aren't part of this app.

## Reminder for the engagement
Please work against a **separate test Firebase project + the Mindbody sandbox (Site ID -99)**, not
production — this app stores clinical/health data, so real client records should never be exposed
during development.
