# Remote Libraries

## Archive Status

This doc is **archived history**, not the current product reference.

Use these docs instead:
- `docs/library-working-copies.md` — current shipped library behavior and product language
- `docs/library-first-command-storage.md` — storage model and migration status
- `docs/schema.md` — current persisted schema and derived type contract

What this doc still is:
- implementation history for the older subscription-style remote-library model
- migration context for understanding why compatibility names like `subscribe`, `source = 'remote'`, and `RemoteCommand` still exist in parts of the codebase

What this doc is not:
- a description of the current command UX
- the source of truth for current library architecture
- a reliable reference for active IPC/UI surfaces

## Retention / Exit Criteria

Keep this archived doc only while it still provides useful migration context.

Delete or fold it into shorter historical notes once all of the following are true:
- compatibility language around subscription-era workflows is no longer needed for onboarding or maintenance
- remaining code aliases (`subscribe`, `RemoteCommand`, similar legacy naming) are removed or fully documented elsewhere
- no active feature doc still needs this phase-by-phase remote-library history to explain the current architecture

---

The remainder of this file is preserved as legacy implementation history from the older remote-library model. In particular, its token-storage and subscription-flow descriptions are not current security or setup guidance; see `docs/schema.md` and `docs/library-working-copies.md`.

Remote Libraries let teams share command snippets via GitHub repositories. A curator maintains a repo with command files, and team members subscribe to pull those commands into their local SnipForge.

## How It Works

- **One-way sync**: repo → app. Curators publish, members consume.
- **Local commands stay private**. Remote commands are tagged with their source and never mix with local ones.
- **Multi-repo support**. Subscribe to as many libraries as you need (e.g., `k8s-team`, `support-tools`, `dev-builds`).
- **No merge conflicts**. One JSON file per command means clean git diffs and meaningful history.
- **Roles mirror GitHub**. Repo owner = curator, write access = contributor, read access = consumer.

## Usage

### Subscribing to a Library

1. Open Settings (gear icon) > **Libraries** tab
2. Click **Sign in with GitHub** (first time only)
3. Enter the repo in the input field (e.g., `ArtluxDM/k8s-commands` or a full GitHub URL)
4. Click **Subscribe**
5. Commands appear in your main list with their source library

### Syncing

- Click the sync icon on an individual library to pull updates
- Click **Sync All** to update all subscriptions at once
- Manual sync always does a full diff (re-adds locally deleted commands)
- Auto-sync uses SHA-based detection to skip repos that haven't changed

### Unsubscribing

Click the X button on a library. All remote commands from that library are removed. Your local commands are never affected.

---

## Developer Reference

### Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Backend | GitHub repos | Target audience is engineers, no server to run, roles mirror GitHub permissions |
| Auth | GitHub OAuth Device Flow | No client_secret in the app, no proxy server, secure — same UX as `gh` CLI |
| Sync direction | One-way: repo → app | Curators publish, members consume. No merge conflicts ever |
| Repo structure | One JSON file per command | Clean git diffs, meaningful history, no merge conflicts |
| Local commands | Always separate, always private | Remote commands tagged with source, never mixed with local |
| Multi-repo | Yes, subscribe to many | User can pull from k8s-team, support-tools, dev-builds simultaneously |
| Scanning | Scoped to manifest directory | Monorepo safe — only scans JSON files under the `.snipforge.json` location |
| Force sync | Manual = full diff, auto = SHA skip | Manual click should always reconcile; auto shouldn't waste API calls |
| API strategy | GraphQL reads, REST writes | GraphQL fetches entire directories in 1 call (vs N REST calls). REST for auth (no choice) and writes (simple, infrequent) |
| Input format | Full GitHub URLs only | Unambiguous — carries owner, repo, branch, subpath. Drop `owner/repo` shorthand |
| Dependencies | None | Node.js built-in `fetch` (Node 18+), GitHub REST + GraphQL APIs |

### GitHub OAuth Setup

The app uses [GitHub Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) for authentication — the same flow as `gh auth login`. No client secret is embedded in the app.

**Creating the OAuth App:**

1. Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `SnipForge`
   - **Homepage URL**: your repo URL or any valid URL
   - **Authorization callback URL**: `http://localhost` (not used by Device Flow, but required by GitHub)
4. Click **Register application**
5. Copy the **Client ID**
6. Open `electron/main/github.ts` and set the `CLIENT_ID` constant to your Client ID

The `client_id` is public and safe to embed — no secret is needed for Device Flow.

### Auth Hardening

#### Remove dead Device Flow interval state (issue [#17](https://github.com/ArtluxDM/SnipForge/issues/17))

Plan:
- remove the unused module-level `deviceFlowInterval` state from `electron/main/github.ts`
- keep `startDeviceFlow()` as a thin pass-through of GitHub's response payload, including `interval`
- add regression coverage around the Device Flow init response contract so the polling interval cannot silently drift again

Final notes:
- polling cadence is renderer-owned in `SettingsModal.vue`, which already reads `interval` from the `auth:login` response and handles GitHub `slow_down` responses locally
- the backend no longer keeps misleading auth state that is neither read nor authoritative

**Auth flow:**

1. User clicks "Sign in with GitHub"
2. App calls `POST https://github.com/login/device/code` with client_id + scope `repo`
3. GitHub returns a `user_code` and `verification_uri`
4. App shows: "Go to github.com/login/device and enter code: ABCD-1234"
5. Opens browser to the URL automatically
6. App polls `POST https://github.com/login/oauth/access_token` until user authorizes
7. Token received → encrypted with `safeStorage` → stored in auth table

**Scopes:** The app requests `repo` (read/write access to repositories). Needed for private repos. For public-only libraries, `public_repo` would suffice, but `repo` covers both.

**Token storage:** GitHub tokens are encrypted using Electron's `safeStorage` API before being stored in the local SQLite database (`auth` table). On systems where OS-level encryption isn't available, it falls back to base64 encoding.

### Repo Structure (SnipForge Library)

Any GitHub repo can be a SnipForge library. It needs a `.snipforge.json` manifest. Command JSON files live in the same directory as the manifest — the manifest location defines the library root.

**Dedicated library repo:**
```
my-team-commands/
├── .snipforge.json              # Library manifest (required)
├── get-pods.json                # Command files next to the manifest
├── restart-deployment.json
└── check-node-status.json
```

**Subfolder in a monorepo:**
```
my-monorepo/
├── src/
├── snipforge_library/
│   ├── .snipforge.json          # Scan is scoped to this directory
│   ├── get-pods.json
│   └── restart-deployment.json
└── package.json                 # Ignored — outside manifest scope
```

**Manifest** (`.snipforge.json`):
```json
{
  "snipforge": "library",
  "name": "Cloud Platform K8s Commands",
  "description": "Kubernetes maintenance commands for the cloud platform team",
  "format_version": "1.0"
}
```

**Command file** (`get-pods.json`):
```json
{
  "snipforge": "command",
  "title": "Get all pods in namespace",
  "body": "kubectl get pods -n {{namespace}}",
  "description": "Lists all running pods. Use `-o wide` for node info.",
  "tags": ["kubernetes", "pods"],
  "language": "bash",
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-02-20T14:30:00Z"
}
```

**Validation:** A JSON file is recognized as a command if it has `title` (string) and `body` (string) at the top level. All other fields are optional.

### Architecture

#### Database Schema

Two new tables and three new columns on `commands`:

```sql
-- New table: tracks library subscriptions
CREATE TABLE libraries (
    id INTEGER PRIMARY KEY,
    github_repo TEXT NOT NULL UNIQUE,   -- "org/repo-name"
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    manifest_path TEXT,                 -- path to .snipforge.json in repo (NULL = not initialized)
    last_synced_at TEXT,
    last_synced_sha TEXT,               -- commit SHA for change detection
    created_at TEXT NOT NULL
);

-- New table: encrypted token storage
CREATE TABLE auth (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- New columns on commands
ALTER TABLE commands ADD COLUMN source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE commands ADD COLUMN library_id INTEGER REFERENCES libraries(id) ON DELETE CASCADE;
ALTER TABLE commands ADD COLUMN remote_path TEXT;
```

- `source`: `'local'` (user's own) or `'remote'` (from a library)
- `library_id`: which library a remote command belongs to
- `remote_path`: filename in the repo (e.g., `get-pods.json`), used to detect updates/deletions

#### Sync Algorithm

```
1. Fetch repo info via GraphQL (branch, permissions, latest commit SHA) — 1 call
2. If SHA matches last sync → skip (unless force sync from manual click)
3. Fetch manifest directory tree with inline file contents via GraphQL — 1 call
4. Find .snipforge.json manifest(s), scope to subscribed library's directory
5. If stored manifest_path differs from actual location → update it (self-correcting)
6. Parse all JSON files from the tree response, validate each (must have title + body)
7. Diff against local remote commands for this library:
   a. File exists remotely but not locally → ADD
   b. File exists both, remote updated_at > local → UPDATE
   c. File exists locally but not remotely → REMOVE
   d. Unchanged → SKIP
8. Execute all changes in a single SQLite transaction
9. Update library.last_synced_at and library.last_synced_sha
10. Return SyncResult { added, updated, removed, errors }
```

*Total: 2 API calls per sync (or 1 if SHA unchanged), regardless of library size.*

**Force sync**: When a user manually clicks "Sync", the SHA check is bypassed (`force: true`). This ensures locally deleted commands are re-downloaded. Auto-sync (Sync All) still uses SHA optimization.

#### IPC Channels

**Auth:**
| Channel | Purpose |
|---------|---------|
| `auth:login` | Start Device Flow, returns `{ user_code, verification_uri, device_code }` |
| `auth:pollLogin` | Poll for token completion |
| `auth:logout` | Clear stored token |
| `auth:getStatus` | Check if authenticated, return user info |

**Libraries:**
| Channel | Purpose |
|---------|---------|
| `library:subscribe` | Add subscription + initial pull |
| `library:unsubscribe` | Remove library and its remote commands |
| `library:sync` | Pull latest for one library (force sync) |
| `library:syncAll` | Pull latest for all libraries (SHA optimized) |
| `library:getAll` | List all subscriptions |
| `library:browse` | Preview library contents without subscribing |

**Publishing (Phase 3):**
| Channel | Purpose |
|---------|---------|
| `library:init` | Initialize repo as SnipForge library |
| `library:publish` | Push a command to the repo as a JSON file |
| `library:unpublish` | Remove a command from the repo |
| `library:bulkPublish` | Push multiple commands sequentially, with progress events |

**Export (Phase 4):**
| Channel | Purpose |
|---------|---------|
| `library:exportZip` | Export commands as zipped library (manifest + JSON files) |

#### Key Files

| File | Purpose |
|------|---------|
| `electron/main/github.ts` | GitHub API client: auth, repo operations, sync |
| `electron/main/local-library.ts` | Local folder scanning, sync, init, library export |
| `electron/main/database.ts` | DB schema, migrations, library/auth CRUD |
| `electron/main/index.ts` | IPC handlers for auth + libraries |
| `electron/preload/index.ts` | Exposes auth + library channels to renderer |
| `shared/types.ts` | Shared types: Library, RemoteCommand, SyncResult, etc. |
| `src/components/SettingsModal.vue` | Libraries tab UI |
| `src/components/BulkPublishModal.vue` | Bulk publish: command selection, progress, results |

### Development Workflow

Every issue follows this cycle:

1. **Doc first** — update the feature doc (`docs/remote-libraries.md`) with the plan before writing code
2. **Implement** — write the code, referencing the issue number in commits. Use `fixes #N` for bug fixes, rework, and refactor issues. Use `closes #N` for feature issues and chore issues when the todo item is complete and should close automatically.
3. **Update docs** — mark deliverables complete, add implementation notes, record any deviations
4. **Commit** — commit message references the issue; the feature doc is always up to date

The feature doc is the source of truth — for the plan, the roadmap, and the development log. GitHub Issues track work items and discussion. Together they should make it easy for anyone to pick up an issue, understand what's needed, do the work, and leave everything documented.

### Phases

#### Phase 1: Foundation — COMPLETE

Auth + subscribe + pull + sync + unsubscribe. The core flow works end to end.

**Files created/modified:**
- `electron/main/github.ts` — NEW: GitHub API client (Device Flow auth, repo operations, sync)
- `electron/main/database.ts` — Added: libraries table, auth table, command source columns, migrations
- `electron/main/index.ts` — Added: auth + library IPC handlers
- `electron/preload/index.ts` — Added: auth + library bridge methods
- `shared/types.ts` — Added: Library, RemoteCommand, SyncResult, AuthStatus types
- `src/components/SettingsModal.vue` — Replaced "Coming Soon" with Libraries tab (auth + subscriptions)
- `src/App.vue` — Added: `@libraries-changed` handler
- `src/utils/fuzzySearch.ts` — Fixed: imports CommandWithTags from shared types (was duplicate interface)

**Verification:**
1. Click "Sign in with GitHub" → Device Flow completes → user info shown
2. Enter a repo URL → subscribe → commands appear in the list
3. Add a command to the repo manually on GitHub → sync → new command appears
4. Delete a synced command locally → manual sync → command re-appears
5. Unsubscribe → remote commands disappear, local commands untouched
6. Sign out → token cleared, libraries remain (re-auth to sync)

#### Phase 2: Library Management UI — COMPLETE

**Deliverables:**
- [x] Visual distinction between local and remote commands in the main list
- [x] Source indicators on command cards (library name/badge)
- [x] Editing a remote command detaches it — becomes local ("you touched it, it's yours now")
- [x] Sync body-deduplication — skip remote commands that match an existing local command body (see [#1](https://github.com/ArtluxDM/SnipForge/issues/1))
- ~~Filter commands by source/library~~ — existing search + tag filters already cover this
- ~~Exclude remote commands from local export~~ — not needed, exports are from whatever you're working with
- ~~Protect remote commands from edit/delete~~ — replaced by detach-on-edit philosophy

**Implementation notes:**
- Detach-on-edit: `database.ts:updateCommand()` now sets `source = 'local'`, `library_id = NULL`, `remote_path = NULL` on every update. Next sync re-adds the remote original as a separate entry.
- Body dedup: `database.ts:getLocalCommandBodies()` returns a Set of trimmed bodies from local commands. Both `subscribeToLibrary()` and `syncLibrary()` check this Set before adding — if a remote command's trimmed body matches any local command, it's skipped.

**Verification:**
1. Subscribe to 2+ libraries → commands from each show source label
2. Edit a remote command → it becomes local, next sync re-adds the remote original
3. Subscribe to a library when you already have matching commands locally → no duplicates created

#### Phase 3: Publishing (Curator Tools)

**Deliverables:**
- [x] Initialize a GitHub repo as a SnipForge library from the app
- [x] Push individual commands to a library repo
- [x] Remove commands from a library repo
- [x] Bulk publish selected commands

**Init Library (issue [#2](https://github.com/ArtluxDM/SnipForge/issues/2)):**

Flow: subscribe to any repo → if no `.snipforge.json` found, library card shows "Init" button → click Init → modal asks for name + description + optional subdirectory → pushes manifest via GitHub Contents API → auto-syncs.

Key changes:
- `Library` type gains `manifest_path` (nullable). Null = not initialized.
- `subscribeToLibrary()` no longer throws on missing manifest — creates the library record anyway.
- `parseRepoUrl()` now extracts optional subpath from `owner/repo/path/to/dir` format.
- New `initLibrary()` function: checks if manifest exists, pushes `.snipforge.json`, updates library record, auto-syncs.
- UI: library card conditionally shows Init vs Sync based on `manifest_path`.
- Init modal: small dialog with name (pre-filled from repo name), description, subdirectory (pre-filled from subscribe input if provided).

**Verification:**
1. Subscribe to uninitialised repo → library card shows Init button
2. Click Init → modal → create → `.snipforge.json` appears in repo
3. Library card updates to show sync controls
4. Another user subscribes → sees the published command (after commands are added via #3)
5. Re-init an already-initialized repo → warns/skips

**Publish Command (issue [#3](https://github.com/ArtluxDM/SnipForge/issues/3)):**

Flow: click Upload button on a command card → if multiple initialized libraries, pick target from a modal → app creates/updates JSON file in the repo via GitHub Contents API → brief success notification.

Key details:
- Filename derived from command title via slugify (e.g., "Get All Pods" → `get-all-pods.json`)
- File placed under the manifest's parent directory (e.g., `snipforge_library/get-all-pods.json`)
- If file already exists at that path, gets its SHA and updates (no duplicate files)
- File content follows the standard SnipForge command JSON format (title, body, description, tags, language, timestamps)
- Keyboard shortcut: `p` when a command is selected

Key changes:
- `github.ts`: new `publishCommand()` — slugifies title, checks for existing file (SHA for update), PUT via Contents API. New `slugify()` helper.
- `index.ts`: `library:publish` IPC handler — fetches command from DB, parses tags, calls publishCommand
- `preload/index.ts`: expose `library:publish` channel + Window type declaration
- `vite-env.d.ts`: added full `auth`, `library`, `shell`, `window` type declarations (were missing, caused `(window.electronAPI as any)` casts)
- `App.vue`: Upload button on command cards (visible when initialized libraries exist), inline publish modal for library picker when multiple initialized libs, `p` keyboard shortcut. Single-library shortcut: if only one initialized lib, publishes directly without modal.

**Verification:**
1. Click Upload on a command → publishes to the library → file appears in repo
2. Publish same command again → updates the file (no duplicate)
3. Subscribe from another account → sync pulls the published command
4. Press `p` with a command selected → same publish flow

**Unpublish Command (issue [#4](https://github.com/ArtluxDM/SnipForge/issues/4)):**

Flow: click "Remove from library" button on a remote command card → confirmation prompt → app deletes the JSON file from the repo via GitHub Contents API (DELETE requires the file's blob SHA) → local remote command is removed from DB → subscribers lose the command on next sync (existing REMOVE logic in sync diff handles this).

Key details:
- Only shown on remote commands where the user has an initialized library (i.e., they're the curator)
- Uses GitHub Contents API `DELETE /repos/{owner}/{repo}/contents/{path}` with the file's SHA
- After successful delete, removes the local DB entry for that command
- Subscribers will lose the command on their next sync because the file no longer exists remotely (sync step 8c: "File exists locally but not remotely → REMOVE")

Key changes:
- `github.ts`: new `unpublishCommand(libraryId, remotePath)` — fetches file SHA via Contents API, then DELETEs it
- `index.ts`: `library:unpublish` IPC handler — validates params, calls `unpublishCommand`, then deletes local remote command from DB
- `preload/index.ts`: expose `library:unpublish` channel + Window type
- `App.vue`: "Remove from library" button (Trash2 with different styling or X icon) on remote command cards that belong to an initialized library. Confirmation via inline prompt before deleting. Keyboard shortcut: `u` when a remote command is selected.

**Verification:**
1. Click "Remove from library" on a remote command → file deleted from repo
2. Local command disappears from the list
3. Subscribe from another account → sync → command is gone
4. Try to unpublish a local command → button not shown (correct)

**Bulk Publish (issue [#5](https://github.com/ArtluxDM/SnipForge/issues/5)):**

Flow: click "Bulk Publish" button in toolbar → modal opens with checkboxable list of local commands + library picker → select commands + target library → click Publish → sequential publish with progress feedback → summary of results.

Key details:
- Modal shows only local commands (remote commands can't be re-published)
- Library picker dropdown at top (pre-selected if only one initialized library)
- Select all / deselect all toggle
- Progress bar during publish with per-command status (success/fail)
- Sequential API calls (GitHub Contents API, one commit per file)
- Partial failure handling: continues on error, reports which succeeded/failed at the end
- Keyboard shortcut: `Shift+P` to open bulk publish modal

Key changes:
- `github.ts`: new `bulkPublishCommands()` — iterates commands, calls `publishCommand` for each, sends progress via callback
- `index.ts`: `library:bulkPublish` IPC handler — fetches commands from DB, calls bulkPublishCommands, sends `library:bulkPublishProgress` events to renderer
- `preload/index.ts`: expose `library:bulkPublish` + `onBulkPublishProgress` channels + Window type
- `src/components/BulkPublishModal.vue` — NEW: modal with checkboxable command list, library picker, progress bar, result summary
- `App.vue`: toolbar `PackagePlus` button (visible when initialized libraries exist) + `Shift+P` shortcut
- `src/vite-env.d.ts`: added `bulkPublish` + `onBulkPublishProgress` type declarations
- `shared/types.ts`: new `BulkPublishResult` interface

**Verification:**
1. Click PackagePlus button in toolbar → bulk publish modal opens
2. Select commands via checkboxes → pick library → click Publish → progress bar advances
3. Each command gets a "Done" or "Failed" status badge
4. Summary shows X published, Y failed
5. Press Shift+P → same modal opens
6. Partial failure: if one command errors mid-batch, others continue
7. Button hidden when no initialized libraries exist

#### Phase 4: Unified Library & Export Model

Generalizes the library concept beyond GitHub. Any folder is a library. Export and import align with the library format.

**Deliverables:**
- [x] Open a local folder as a library (issue [#6](https://github.com/ArtluxDM/SnipForge/issues/6))
- [x] Library export — folder + manifest, zipped (issue [#7](https://github.com/ArtluxDM/SnipForge/issues/7))
- [x] Unified `snipforge` format identifier (issue [#8](https://github.com/ArtluxDM/SnipForge/issues/8))

**Export modes (two, not three):**
- **Library export** — full folder (manifest + individual JSON files), zipped. Works for 1 command or 100.
- **Bundle export** — single JSON file with selected commands. Quick-share format. A bundle of 1 = single command export (no separate mode needed).

**Unified file format:**
- `"snipforge": "library"` — manifest file (`.snipforge.json`)
- `"snipforge": "bundle"` — array of commands in one file
- `"snipforge": "command"` — individual command file

**Key principle:** Library is the canonical format for organization and sharing. Bundle is the convenience format for quick handoff.

**Unified `snipforge` Format Identifier (issue [#8](https://github.com/ArtluxDM/SnipForge/issues/8)):**

Every SnipForge file format gets a top-level `"snipforge"` field so the app can self-identify files without guessing:

- `"snipforge": "library"` — manifest (`.snipforge.json`)
- `"snipforge": "bundle"` — array of commands in one JSON file (export format)
- `"snipforge": "command"` — individual command JSON file

**Writes (add identifier to all outputs):**
- `github.ts:initLibrary()` — manifest creation → add `"snipforge": "library"`
- `local-library.ts:initLocalLibrary()` — manifest creation → add `"snipforge": "library"`
- `local-library.ts:exportAsLibrary()` — manifest + command files → add both identifiers
- `github.ts:publishCommand()` — command file → add `"snipforge": "command"`
- `importExport.ts:exportCommands()` — bundle export → add `"snipforge": "bundle"`

**Reads (detect by identifier, fall back to heuristics):**
- `importExport.ts:validateExportData()` — detect `snipforge: "bundle"`, fall back to `version` + `commands` check for old files
- Import handler (`App.vue:handleImport()`) — detect `snipforge: "command"` for single-command import (wrap as bundle), detect `snipforge: "library"` to show a user-friendly error ("use Open Folder instead")
- Manifest parsing in `github.ts:browseLibrary()` and `local-library.ts:scanLocalFolder()` — no behavior change needed (manifests are already identified by filename)

**Type changes:**
- `shared/types.ts:LibraryManifest` — add optional `snipforge?: string` field
- `src/utils/importExport.ts:ExportData` — add `snipforge: string` field

**Backwards compatibility:**
- All read paths fall back to current heuristics when `"snipforge"` field is absent
- Old bundles without `snipforge: "bundle"` still import via `version` + `commands` check
- Old command files without `snipforge: "command"` still validate via `title` + `body` check

**Follow-up consistency work:**
- [x] Bulk export now routes through `importExport.ts:exportCommands()` so all bundle exports share the same metadata shape and `snipforge: "bundle"` identity (issue [#33](https://github.com/ArtluxDM/SnipForge/issues/33))

**Implementation notes:**
- Import gains single-command support as a side effect: `validateExportData()` detects `snipforge: "command"` or bare `title`+`body` files and wraps them as a one-item bundle. This means any command JSON file (from a library, publish, or export) is directly importable via the import dialog.
- Manifest detection shows a user-friendly error pointing to "Open Folder" instead of a cryptic validation failure.
- The `snipforge` field is always first in the JSON output for easy identification when reading files manually.

**Verification:**
1. Export as bundle → file contains `"snipforge": "bundle"` at top level
2. Export as library → manifest has `"snipforge": "library"`, command files have `"snipforge": "command"`
3. Publish to GitHub → command JSON has `"snipforge": "command"`
4. Init library (GitHub + local) → manifest has `"snipforge": "library"`
5. Import old bundle (no identifier) → still works (heuristic fallback)
6. Import a single command JSON file → detected by `snipforge: "command"`, imported correctly
7. Import a bare command file (old format, no identifier) → detected by title+body heuristic, imported correctly
8. Import a manifest file → friendly error: "use Open Folder"

**Open Local Folder as Library (issue [#6](https://github.com/ArtluxDM/SnipForge/issues/6)):**

Flow: click "Open Folder" button in Libraries settings → native folder picker → app validates the folder (looks for `.snipforge.json`) → if found, scans command JSONs and imports → if not found, creates library record as uninitialized (same pattern as GitHub subscribe without manifest).

Key details:
- Libraries gain a `type` column: `'github'` (default) or `'local'`
- Local libraries store the absolute folder path in `github_repo` column (reusing the column avoids migration complexity)
- Scanning uses the same validation rules as GitHub: find `.snipforge.json`, scope to its directory, validate JSON files (must have `title` + `body` strings)
- Sync is always a full diff (no SHA optimization — local FS reads are fast). `last_synced_sha` stores a content hash for display purposes only.
- Init for local libraries writes `.snipforge.json` directly to the folder (no GitHub API)
- Body dedup applies: local commands with matching bodies are skipped during scan

Key changes:
- `shared/types.ts`: add `LibraryType = 'github' | 'local'`, add `type: LibraryType` to `Library`
- `database.ts`: migration for `type` column, pass type through `addLibrary()`
- `electron/main/local-library.ts` — NEW: filesystem scanning (`scanLocalFolder`, `syncLocalLibrary`, `initLocalLibrary`)
- `index.ts`: `library:openLocal` IPC handler (folder picker + validation), dispatch `library:sync` by type
- `preload/index.ts`: expose `openLocal` channel + type declaration
- `SettingsModal.vue`: "Open Folder" button, local library cards (folder icon, path display, sync/remove controls)

**Verification:**
1. Click "Open Folder" → pick a folder with `.snipforge.json` → commands appear in main list
2. Add a JSON file to the folder → sync → new command appears
3. Remove a JSON file → sync → command disappears
4. Open a folder without manifest → library shows as uninitialized with Init button
5. Click Init → manifest created on disk → sync works
6. Unsubscribe → commands removed, folder untouched
7. Local library cards show folder path and folder icon (not GitHub icon)

**Library Export (issue [#7](https://github.com/ArtluxDM/SnipForge/issues/7)):**

Flow: in Manage Commands tab, select commands (or none for all) → click "Export as Library" → small modal asks for library name + description → save dialog for `.zip` → app generates folder structure in temp dir, zips it, saves to chosen location.

Key details:
- Zip contains a folder named after the slugified library name, containing `.snipforge.json` + individual command JSON files
- Command filenames are slugified from titles (same pattern as publishing: "Get Pods" → `get-pods.json`)
- If no commands selected, exports all commands
- The exported zip can be unzipped and opened as a local library (#6) — full round-trip
- Uses `adm-zip` npm package for cross-platform zip creation (replaced `archiver` which had bundling issues in Electron — its `readable-stream` dependency wasn't included in the asar)
- All work happens in the main process (temp dir → zip → save dialog → cleanup)

Key changes:
- `package.json`: add `adm-zip` + `@types/adm-zip` dependencies
- `electron/main/local-library.ts`: new `exportAsLibrary()` — creates temp folder, writes manifest + command JSONs, zips with adm-zip, returns zip path. New `slugify()` (duplicated from `github.ts` — avoids coupling). Handles duplicate slugs by appending counter (`-2`, `-3`, etc.)
- `electron/main/index.ts`: `library:exportZip` IPC handler — fetches commands from DB, calls exportAsLibrary, opens save dialog (zip filter), copies to chosen location, cleans up temp dir. When no command IDs specified, defaults to all local commands.
- `electron/preload/index.ts`: expose `exportZip` channel + type declaration
- `src/vite-env.d.ts`: added `exportZip` type declaration
- `src/components/SettingsModal.vue`: "Export as Library" button (accent-colored border, next to existing Export), export library modal (reuses init modal pattern — name + description fields), `source` added to Props for local-command counting

**Verification:**
1. Select commands → Export as Library → enter name → save → zip appears at chosen location
2. Unzip → folder contains `.snipforge.json` + individual command JSON files
3. Open the unzipped folder as a local library (#6) → commands appear in main list (round-trip)
4. Export with no selection → all commands exported
5. Duplicate titles get unique filenames (no overwrites)

#### Phase 5: Permissions

Library access control based on GitHub repo permissions. Determines who can publish/unpublish commands and how they're identified in the UI.

##### Permission Model

| GitHub level | SnipForge role | Subscription card label | Can publish/unpublish |
|---|---|---|---|
| Repo owner | Owner | "Owner" | Yes |
| Admin | Curator | "Curator" | Yes |
| Write/Maintain/Triage/Read | Consumer | — | No |

More restrictive than GitHub by design — write access to a repo doesn't grant library curation rights. Only the owner and admins can publish/unpublish through the app. Consumers subscribe, sync, and use commands. If they want something added, they talk to their curator outside the app.

##### Implementation

- **Detection**: `GET /repos/{owner}/{repo}` returns `permissions: { admin, push, ... }`. Check on subscribe and refresh on sync.
- **Storage**: Add `permission` column to `libraries` table (`'owner'` | `'curator'` | `'consumer'`). Owner detection via comparing authenticated user with repo owner field.
- **UI gating**: Hide publish/unpublish buttons for consumers. Show role label on library subscription card in the Libraries tab.
- **Graceful handling**: If someone's access is downgraded between syncs, update the stored permission and hide controls on next sync.

##### Deliverables

- [x] Check permissions on subscribe, store role in `libraries` table
- [x] Refresh permissions on sync
- [x] Show role label on subscription card (Owner / Curator)
- [x] Hide publish/unpublish for consumers
- [x] Handle permission changes gracefully

##### Implementation Notes

Key changes:
- `shared/types.ts`: new `LibraryPermission = 'owner' | 'curator' | 'consumer'` type, added `permission` field to `Library`
- `database.ts`: migration adds `permission TEXT NOT NULL DEFAULT 'consumer'` column, new `updateLibraryPermission()` function, `addLibrary()` accepts permission parameter
- `github.ts`: new `detectPermission(owner, repo)` — calls `GET /repos/{owner}/{repo}`, compares authenticated user with repo owner (→ `'owner'`), checks `permissions.admin` (→ `'curator'`), else `'consumer'`. Called on subscribe and refreshed on every sync.
- Local libraries always get `'owner'` permission (you own the folder).
- `App.vue`: new `publishableLibraries` computed filters `initializedLibraries` to owner/curator only. All publish/unpublish UI (buttons, bulk publish, keyboard shortcuts) gates on this. New `canUnpublish(libraryId)` helper for per-command unpublish button visibility.
- `SettingsModal.vue`: role badge (Owner/Curator) shown on GitHub library cards next to the name. Orange badge for owner, blue for curator.

**Verification:**
1. Subscribe to a repo you own → "Owner" badge appears, publish/unpublish buttons visible
2. Subscribe to a repo where you have admin access → "Curator" badge, publish/unpublish visible
3. Subscribe to a repo with read/write access only → no badge, publish/unpublish buttons hidden
4. Sync a library after permission change → role updates, controls adjust
5. Keyboard shortcuts (p, u, Shift+P) only work when user has publish rights

#### Phase 6: API Optimization & Multi-Library Support

Addresses two shortcomings from the original design: excessive REST API calls (one per command file) and single-library-per-repo assumption. Should have been REST + GraphQL from day 1.

**Context:** The Armory has 400+ commands. Subscribing made ~406 API calls (4× duplicate `/repos/` + 1 per command file via `/contents/`). A rate limit 403 was misidentified as "Access denied", which nuked the token, cascading to unauthenticated mode (60 req/hr). Multiple libraries in the same repo (e.g., template + The Armory) were invisible — `tree.find()` only returned the first manifest.

##### GitHub API: GraphQL for reads (issue [#14](https://github.com/ArtluxDM/SnipForge/issues/14))

**Problem:** REST API requires one call per file. 400 commands = 400 calls = ~40 seconds + rate limit pressure.

**Solution:** Mixed API strategy:
- **GraphQL for reads** — browse, sync, repo info, user info. Single query fetches an entire directory with all file contents.
- **REST for auth** — Device Flow is REST-only, no alternative.
- **REST for writes** — publish/unpublish/init. Simple, infrequent, no batching needed.

**API call reduction:**

| Operation | Before | After |
|---|---|---|
| Subscribe (400 commands) | ~406 calls | 2 calls |
| Sync (400 commands, changed) | ~404 calls | 2 calls |
| Sync (unchanged, SHA match) | ~3 calls | 1 call |

**Key changes planned:**
- `getRepoInfo()` — single fetch, returns branch + permissions + owner info. Passed through as context, never re-fetched.
- `graphqlFetch()` — wrapper around `POST /graphql`, same auth token, same error handling as `githubFetch()`
- `browseLibrary()` — GraphQL tree query with inline blob content, scoped to manifest directory
- `subscribeToLibrary()` / `syncLibrary()` — receive repo context, no redundant calls
- `detectPermission()` — derived from repo context (already fetched), no separate call
- `parseGitHubError()` — DONE (landed in error handling fix). Distinguishes rate limit vs bad credentials vs permission denied. Prevents token deletion on transient errors.

**Deliverables:**
- [x] `getRepoContext()` single-fetch context object (branch, SHA, permission via GraphQL `viewerPermission`)
- [x] `graphqlFetch()` wrapper with error handling (rate limit, auth, response parsing)
- [x] `browseLibrary()` uses GraphQL tree query with inline blob content
- [x] `subscribeToLibrary()` — 1-2 GraphQL calls (with subpath: 1, without: 2 + 1 REST tree)
- [x] `syncLibrary()` — 1 call (SHA match) or 2 calls (context + tree)
- [x] REST retained for auth + writes (no regression)
- [x] `detectPermission()` removed — derived from `viewerPermission` in repo context
- [x] `getFileContent()` removed — content comes inline from GraphQL tree entries
- [x] `getLatestCommitSha()` removed — SHA comes from `defaultBranchRef.target.oid`

##### Multi-library repos: discovery + picker (issue [#15](https://github.com/ArtluxDM/SnipForge/issues/15))

**Problem:** `browseLibrary()` uses `tree.find()` — returns only the first `.snipforge.json`. Repos with multiple libraries (e.g., our repo with template + The Armory) only expose whichever sorts first.

**Solution:**

**Input format — both `owner/repo` and full GitHub URLs supported.** Original plan was to drop shorthand, but `owner/repo` works reliably after #14's GraphQL switch and rate limit fixes. Both formats accepted; `parseRepoUrl()` handles all variations.

**Multi-library storage:** When subscribing to a specific library in a multi-library repo, `github_repo` stores the full path including subpath (e.g., `ArtluxDM/SnipForge/The Armory`). This avoids schema migration while allowing multiple subscriptions per repo via the existing UNIQUE constraint. `parseRepoUrl()` extracts `owner`, `repo`, and `subpath` from the stored value.

**Subscribe flow:**
1. URL with subpath (e.g., `https://github.com/ArtluxDM/SnipForge/tree/main/The%20Armory`) → scope to that directory, find the one manifest, subscribe directly
2. URL without subpath + single manifest → subscribe directly
3. URL without subpath + multiple manifests → show picker modal with library name, directory path, and command count
4. URL without subpath + no manifests → subscribe without syncing (click Init to set up)

**Implementation:**
- `discoverLibraries()` — REST recursive tree + GraphQL aliased blob reads (2 API calls) to find all manifests, read their metadata, count commands per directory
- `subscribeToLibrary(repoUrl, subpath?)` — returns `{ needsPick: true, libraries }` when multiple manifests found, frontend shows picker, user picks, re-calls subscribe with subpath
- `syncLibrary()` — now scopes browse to manifest directory using `manifest_path` (was previously using unscoped `github_repo`, causing sync to pick first manifest in multi-library repos)
- Library picker modal in SettingsModal — shows name, path, description, command count for each discovered library

**Deliverables:**
- [x] `parseRepoUrl()` accepts both `owner/repo` and full GitHub URLs (kept shorthand support)
- [x] `discoverLibraries()` finds ALL manifests in a repo via REST tree + GraphQL
- [x] URL with subpath → scoped subscribe (single GraphQL call)
- [x] URL without subpath + single manifest → subscribe directly
- [x] URL without subpath + multiple manifests → picker modal
- [x] Picker shows library name, directory path, description, and command count
- [x] Subscribing from picker scopes to selected library's directory
- [x] `syncLibrary()` scoped to manifest directory (fixes multi-library sync correctness)

**Depends on:** #14 (GraphQL reads — tree discovery benefits from single query)

#### Phase 7: Local Library Parity — Recursive Discovery + Multi-Library Picker (issue [#16](https://github.com/ArtluxDM/SnipForge/issues/16))

**Status:** Complete

Closes the gap between GitHub and local library behavior. When you open a repo root as a local library, the manifest is often in a subdirectory — but the current implementation only checks the folder root (`path.join(folderPath, '.snipforge.json')`), so it misses the manifest entirely and asks the user to init.

**Problem:**
- `scanLocalFolder()` comment even says "non-recursive — must be at root"
- GitHub discovery finds manifests anywhere in a repo tree via REST recursive tree call
- Local discovery does not — misses any manifest not at the exact folder root
- Multi-library picker exists for GitHub repos but has no local equivalent

**Plan:**

Add `findManifests(rootPath, maxDepth)` — recursive walker that returns all `.snipforge.json` paths found under a root directory. Skips `node_modules` and hidden directories. maxDepth = 5 to avoid runaway traversal.

Update `openLocalFolder` to use it when the root check fails:
- 0 manifests found → add as uninitialized (current behavior, unchanged)
- 1 manifest found anywhere → use its parent directory as the effective library root, proceed normally
- Multiple manifests found → return `{ needsPick: true, libraries: DiscoveredLibrary[] }`, mirror GitHub flow

`DiscoveredLibrary.path` for local = full absolute path to the directory containing the manifest (passed back to `openLocalFolder` when the user picks).

**Files to change:**

| File | Change |
|------|--------|
| `electron/main/local-library.ts` | Add `findManifests()`, update `openLocalFolder` return type + logic, extract `addLibraryFromScan()` helper to avoid duplication |
| `electron/main/index.ts` | `library:openLocal` handler accepts optional `folderPath` arg (skips dialog when picker re-invokes), forwards `needsPick` response |
| `electron/preload/index.ts` | Update `openLocal(folderPath?: string)` signature + type declaration |
| `src/components/SettingsModal.vue` | Handle `needsPick` in `handleOpenLocalFolder`, add `type: 'github' \| 'local'` to `libraryPicker` state, update `handlePickLibrary` to call `openLocal(lib.path)` for local or `subscribe(repoUrl, lib.path)` for GitHub, update picker modal copy ("This repo" → "This folder" for local type) |

**Verification:**
1. Open a repo root that has `.snipforge.json` in a subdirectory → library detected + synced, no "Init" prompt
2. Open a folder with manifest at root → unchanged behavior
3. Open a folder with multiple manifests → picker modal appears with library names, paths, command counts
4. Pick from the picker → correct subdirectory subscribed, commands appear
5. Open a folder with no manifest anywhere → adds as uninitialized with Init button (unchanged)
6. Already-added check works correctly for the subdir path (not the root path)

**Implementation notes:**
- `openLocalFolder()` now does a root manifest check first, then falls back to recursive manifest discovery capped at depth 5.
- Recursive discovery skips hidden directories and `node_modules`, returns the nested library directly when only one manifest exists, and returns picker data when multiple manifests are found.
- The local picker reuses the existing multi-library modal in `SettingsModal.vue`, but now branches cleanly between GitHub repo subscription and local-folder opening.
- `library:openLocal` and the preload bridge now accept an optional folder path so the picker can reopen the selected subdirectory without showing the native folder dialog again.
- Regression coverage in `tests/local-library.test.ts` now covers both the single-nested-library path and the multi-library picker path.
