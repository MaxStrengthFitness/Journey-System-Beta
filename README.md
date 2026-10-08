# The Journey System

Client tracking for Max Strength Fitness. Trainers run 1-1 sessions from an
iPad on the gym floor; head trainers and studio leaders read what those
sessions produced. Clients are not users of the app.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first** — what Journey is
for, every screen, every Firestore collection, how the code is organised, and
the roadmap. [`CLAUDE.md`](CLAUDE.md) is the shorter working reference: where
things live, the commands, the deploy order, and the known traps.

## Stack

React + TypeScript + Vite, on Firebase (Firestore, Auth, Cloud Functions), with
Mindbody as the external source of client and schedule data. Served in
production by the Express server in `server.ts`, deployed on Render.

## Run locally

**Prerequisites:** Node.js 22.

```bash
npm ci        # NOT npm install — see the dependency-tree trap in CLAUDE.md
npm run dev   # tsx server.ts, with Vite mounted as middleware
```

`npm run dev` needs `firebase-applet-config.json`, which is gitignored. On a
fresh checkout, generate it first:

```bash
node scripts/setup-firebase-config.cjs
```

Local dev points at the production Firebase project by design, so UI work can
be checked against real studio and schedule data. Writes hit real records —
see CLAUDE.md before running anything that writes.

## The first screen's size budget

What an iPad downloads and parses before Journey can draw anything is held to
a budget (the speed round, Oct 5 2026). After a production build:

```bash
npx vite build          # in a shell where NODE_ENV is unset or "production"
npm run check:bundle    # scripts/check-bundle-budget.mjs dist
```

It sums the files the built `index.html` names (the module script, every
modulepreload and stylesheet), raw and gzipped, and fails above
`BUDGET_GZIP_KB` (480 KB gzip; 456.9 KB when it was set), when charts, drag
and drop or motion reach the first screen, or when the build used React's
development files. CI runs it after its build, and a ship script's prepare can
run it after its own. When it fails, find what joined the first screen (a
stylesheet imported from `main.tsx`, a helper imported from a big module, a
vendor group in `vite.config.ts`) before raising the number.

## The rest

| | |
|---|---|
| `docs/START-HERE.md` | The project in fifteen minutes, written for someone who does not code |
| `docs/business/` | The studio's rules: packages and pricing, renewals, roles, data sources, glossary, what a session is, prior history, running costs |
| `docs/rounds/` | What each round of work changed, and why |
| `scripts/` | Migrations, diagnostics and the ship scripts |
| `functions/` | Cloud Functions, including the Mindbody webhook pipeline |
