# Database Health

Lightweight health checks for the SnipForge SQLite database. The goal is preventive maintenance — catch issues early and keep the DB lean, especially as library reindex/sync churn generates derived-row cleanup.

## Motivation

During the remote-library and working-copy migration work, sync bugs left orphaned rows in the database (commands referencing deleted libraries, stale metadata). A manual VACUUM on a 1-command database reclaimed 89% of space (438KB → 48KB). As users add and resync multiple large libraries, this churn will compound.

## Scope

<!-- Deepness: TBD — need to decide how much to automate vs. keep manual. Options range from a startup integrity check to a full background maintenance routine. -->

Light and non-intrusive. This is not a database management framework — it's a small set of checks that run at sensible times.

## DB Test Recovery

### Issue #27: restore runnable DB tests after Node ABI/native module drift

Plan:
- make `pnpm test:db` self-contained so native rebuilds do not depend on a writable global npm cache
- keep the rebuild and SQLite suite behind one repeatable recovery command
- document the expected toolchain prerequisites explicitly instead of leaving contributors to infer them from `node-gyp` output

When `tests/database.test.ts` stops loading after a Node upgrade or ABI drift, rebuild the native module and rerun the DB suite:

```bash
pnpm test:db
```

That command prepares the Electron binary without launching it (avoiding parallel Vitest download races), provisions a temporary writable npm cache, rebuilds and probes `better-sqlite3` for the invoking **Node** runtime, then runs `tests/database.test.ts`. For the whole suite use `pnpm test`, which performs the same preparation. Before starting Electron after Node tests, run `pnpm native:electron` (or `pnpm dev`, which invokes it); avoid concurrent test and app builds in the same checkout.

Machine prerequisites:

- `pnpm install`
- Xcode Command Line Tools on macOS so `node-gyp` can compile `better-sqlite3` when a prebuilt binary is unavailable
- Python 3 available to `node-gyp`

If the rebuild still fails, run `pnpm rebuild better-sqlite3` directly to inspect the compiler error. The common failure mode is missing local build tooling, not an app-level test problem.

Final notes:
- `scripts/test-db.mjs` now injects a temp npm cache before rebuilding `better-sqlite3`, which avoids relying on `~/.npm` being writable during recovery runs
- the recovery path stays as one command, but the doc now makes its toolchain assumptions explicit

## Proposed health checks (not yet automated)

The checks below are a design backlog, not startup checks the app currently runs. The DB test recovery commands above are implemented.

### 1. Integrity Check

`PRAGMA integrity_check` on startup. If it fails, surface a warning to the user.

### 2. Orphan Detection

Identify rows that shouldn't exist:

- **Orphaned commands** — library-backed indexed rows (`source='remote'`) with `library_id` not in `libraries` table
- **Ghost libraries** — libraries with no commands and no valid `github_repo` / folder path
- **Dangling metadata** — `remote_path` set on local commands (should be NULL)

### 3. VACUUM

Reclaim space after bulk operations (remove library, sync with many deletions). SQLite doesn't auto-reclaim — deleted rows leave empty pages.

### 4. Index Health

Verify expected indices exist. If a migration failed silently, queries degrade without obvious errors.

## Open Questions

- When should checks run? Startup only? After sync? On a schedule?
- Should orphans be auto-cleaned or flagged for user action?
- Is VACUUM worth running automatically? It locks the DB and rewrites the file — fine for small DBs, but could cause a pause on large ones.
- Should we expose any of this in the UI (e.g., a "Database" section in Settings)?
