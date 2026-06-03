# WealthTrack

WealthTrack is a manual-only personal wealth tracking web app. It uses a React TypeScript frontend, a Node/Express TypeScript backend, and SQLite storage for a single seeded user.

## Local Development

```bash
npm install
npm run dev:server
npm run dev:client
```

Set `SEED_USER_EMAIL` and `SEED_USER_PASSWORD` for the single production user. Local fallback credentials are non-production demo values only.

## Production Contract

- Firebase Hosting project: set with `FIREBASE_PROJECT_ID`
- Frontend URL: set with `FRONTEND_URL`
- Backend default port: `4001`
- VM app directory: `/opt/wealthtrack`
- VM service: `wealthtrack`
- VM runtime user: `wealthtrack`
- SQLite path: `/var/lib/wealthtrack/wealthtrack.db`

Production deploys are manual only through `.github/workflows/deploy-production.yml` or `scripts/deploy-prod.sh`.

## Scope

WealthTrack stores manually entered account values, goals, monthly reviews, imports, and exports. Liabilities are stored as positive owed balances and subtracted from net worth. It intentionally excludes online financial data integrations, market lookups, Open Banking, budgeting, tax advice, and native mobile work.
