# Database Schema

Single source of truth for the SnipForge persisted data model. When a feature adds or modifies columns/tables, update this file in the same commit.

**Engine:** SQLite via better-sqlite3 (synchronous, WAL mode)
**Location:** `{userData}/snipforge.db` (Electron `app.getPath('userData')`)
**Implementation:** `electron/main/database.ts`
**Shared types:** `shared/types.ts`

---

## Current Architecture Summary

SnipForge is now **library-first**:

- command content is canonical in library files on disk
- SQLite stores a derived command index/cache plus app metadata
- libraries may be local-only or origin-backed, but both are represented as local working copies in the app model
- legacy DB-only command rows still exist only as upgrade compatibility until they are migrated out

`docs/library-working-copies.md` is the product/workflow source of truth.
`docs/library-first-command-storage.md` is the storage/migration source of truth.
`docs/remote-libraries.md` is archived legacy history.

---

## Tables

### commands

Derived command index/cache.

Every searchable command is projected into this table, but it is **not** the canonical source of truth for library-backed commands.

- initialized libraries own command truth on disk
- this table stores indexed projections for search/listing
- legacy DB-only commands may still exist here temporarily during upgrade compatibility
- rebuilding SQLite must not delete commands that still exist in libraries

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER | PK, auto | SQLite row id for the indexed projection |
| `title` | TEXT | NOT NULL | Command title shown in the list |
| `body` | TEXT | NOT NULL | Command/snippet body |
| `description` | TEXT | `''` | Optional description |
| `tags` | TEXT | `'[]'` | JSON array of strings |
| `language` | TEXT | `'plaintext'` | Editor/rendering language |
| `source` | TEXT | `'local'` | `'local'` = legacy DB-only row, `'remote'` = indexed library-backed row |
| `library_id` | INTEGER | NULL | FK → `libraries.id` with `ON DELETE CASCADE`; set for library-backed rows |
| `remote_path` | TEXT | NULL | Relative command file path inside the owning library |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp from command data |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp from command data |

**Indexes**
- `idx_commands_title` on `title`
- `idx_commands_updated_at` on `updated_at DESC`
- `idx_commands_library_id` on `library_id`
- `idx_commands_source` on `source`

**Behavior notes**
- writable local-library commands are created, edited, and deleted on disk first, then reindexed here
- library-backed rows are reconciled by `(library_id, remote_path)` style identity, not by treating SQLite as the owner
- read-only indexed library commands are never the canonical write target
- deleting a library removes its indexed command rows through cascade semantics

### libraries

Library registry plus sync/origin metadata.

This table tracks both local-only libraries and origin-backed libraries. The old `github_repo` column name remains for compatibility, but its meaning is broader now:

- for GitHub/origin-backed libraries it stores the persisted repo/subpath identifier
- for local libraries it stores the absolute folder path

Current behavior is derived further into the shared `Library` contract with:

- `local_path`
- `origin`
- `working_copy`
- `working_tree`

Those derived fields are assembled in application code rather than stored as raw table columns.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER | PK, auto | Library row id |
| `github_repo` | TEXT | NOT NULL, UNIQUE | Persisted library locator: repo/subpath for GitHub entries, absolute path for local entries |
| `name` | TEXT | NOT NULL | Display name, usually from `.snipforge.json` |
| `description` | TEXT | `''` | Library description |
| `last_synced_at` | TEXT | NULL | Last successful sync/reindex time |
| `last_synced_sha` | TEXT | NULL | Last successful sync marker/content hash |
| `origin_url` | TEXT | NULL | Canonical Git origin URL when known |
| `origin_ref` | TEXT | NULL | Preferred/default origin branch/ref when known |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `manifest_path` | TEXT | NULL | Path to `.snipforge.json`; NULL means uninitialized/not yet materialized |
| `type` | TEXT | `'github'` | `'github'` or `'local'` legacy storage discriminator |
| `auto_sync` | INTEGER | `0` | Per-library auto-sync toggle |
| `permission` | TEXT | `'consumer'` | `'owner'`, `'curator'`, or `'consumer'` |

**Behavior notes**
- `type = 'github'` no longer implies a subscription-only remote library UX; origin-backed libraries are still local working copies in the shipped model
- `manifest_path IS NULL` means the library is linked but not initialized/materialized yet
- `origin_url` and `origin_ref` hold origin metadata; they do not change command-row behavior directly
- local-path and working-tree details are resolved from this stored metadata plus filesystem/git inspection

### auth

GitHub token storage. `electron/main/github.ts` uses Electron `safeStorage` when encryption is available and base64-encodes the result for SQLite. If encryption is unavailable, it stores **base64 only**, which is not encryption. On Linux, the `basic_text` safeStorage backend is also not secure storage; do not assume tokens are protected at rest on every installation.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `key` | TEXT | PK | Token identifier, e.g. `github_token` |
| `value` | TEXT | NOT NULL | Base64-encoded token value (encrypted only when a secure `safeStorage` backend is available) |

### settings

Key-value application settings.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `key` | TEXT | PK | Setting identifier |
| `value` | TEXT | NOT NULL | JSON-encoded or plain-string setting value |

---

## Migrations

Migrations are inline in `database.ts:initializeDatabase()` using `ALTER TABLE ... ADD COLUMN` wrapped in try/catch. If a column already exists, SQLite throws and the migration is ignored.

### Migration history

1. `commands.description`
2. `commands.language`
3. `commands.source`, `commands.library_id`, `commands.remote_path`; `libraries` table; `auth` table
4. `libraries.manifest_path`
5. `libraries.type`
6. `libraries.origin_url`, `libraries.origin_ref`
7. `libraries.auto_sync`
8. `libraries.permission`
9. `settings` table

When adding new persisted fields, append them in `initializeDatabase()` and update this doc in the same change.

---

## Shared Type Contracts

The stored schema is projected into types in `shared/types.ts`.

| Type | Role |
|------|------|
| `Command` | Indexed command row from SQLite |
| `CommandWithTags` | Renderer-ready command with parsed tag helpers |
| `CommandSource` | `'local' | 'remote'` compatibility discriminator for indexed rows |
| `Library` | Derived app-level library contract used by renderer and IPC |
| `LibraryOrigin` | Optional origin metadata on a library |
| `LibraryWorkingCopyState` | Local working-copy materialization view |
| `LibraryWorkingTreeStatus` | Library-level git/working-tree summary |
| `LibraryCommand` | Canonical command file shape |
| `RemoteCommand` | Legacy alias of `LibraryCommand`, retained for compatibility |
| `LibraryManifest` | `.snipforge.json` manifest shape |
| `SyncResult` | Sync/reindex result payload |
| `GitHubUser` | Authenticated GitHub user info |
| `AuthStatus` | Connector auth state |
| `DeviceFlowResponse` | GitHub device-flow start response |

---

## Notes For Future Cleanup

These names are intentionally not perfectly clean yet because compatibility still matters:

- `github_repo` should be read as a persisted library locator, not literally only a GitHub repo name
- `source = 'remote'` should be read as a library-backed indexed row, not as proof of the old remote-command product model
- `RemoteCommand` is a legacy alias; prefer `LibraryCommand` in new code/docs

Once the remaining migration/compatibility surface is removed, these names can be simplified in code and schema together.
