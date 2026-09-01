# Project State

## Current cycle

- Extended authenticated session JWTs and login cookies from 12 hours to 365 days.
- Added persistence coverage for the one-year JWT and cookie expiry.
- Added repository workflow instructions in `AGENTS.md`.
- Added `gh.sh` to stage, commit, and push this cycle's changes.

## Verification

- `npm test` from `server/` was attempted on 2026-09-01.
- The database-backed test suites are blocked before execution because the installed `better-sqlite3` native module was compiled for Node ABI 127, while the active Node runtime requires ABI 141. Rebuild dependencies (for example, `npm rebuild better-sqlite3`) before rerunning.
