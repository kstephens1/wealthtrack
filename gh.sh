#!/usr/bin/env bash
set -euo pipefail

git add AGENTS.md PROJECT_STATE.md gh.sh server/src/app.ts server/tests/persistence.test.ts
git commit -m "Extend login sessions to one year"
git push origin main
