# Library Working Copies

## Issue #93: first-run library dialog consistency

Plan:
- Reuse the shared modal overlay, surface, header, body, footer and primary button.
- Replace the separate blue gradients and hardcoded dark colors with existing theme tokens.
- Preserve mandatory setup, folder-picker cancellation, errors, retry and loading behavior.
- Verify theme styling and record the checks performed.

Completed:
- [x] Reused the shared modal overlay, content surface, header/body/footer and primary button, including existing focus styling.
- [x] Removed the blue badge/button, hardcoded dark gradients and separate shadow treatment; remaining setup styles use application tokens.
- [x] Added dialog labeling, busy state and error alert semantics while retaining the existing setup handler.

Verification (2026-11-01): both type checks and full test suite passed (14 files, 132 tests). Built the renderer separately into a temporary directory and visually inspected it in an isolated offscreen Electron window with mocked IPC and disposable userData: gray modal surface, orange CTA, correct typography/spacing and readable copy. Confirmed folder-picker cancellation leaves the dialog open with the button enabled for retry. No real library or application data was used. The app currently defines a single dark palette; no separate light-theme implementation or packaged-app smoke is claimed.


Library Working Copies reframes SnipForge around one simple rule: every command lives in a local library folder, and some libraries may also have a Git remote origin. The app should treat commands as files in a working copy, not as separate "local" and "remote" command types.

## Current Reference

- this doc is now the current reference for shipped library behavior
- `docs/remote-libraries.md` remains as legacy implementation history and migration context
- the working-copy model is the source of truth for current product language

## Active Notes

### Issue #61: simplify library management modal actions and secondary workflows

Plan:
- stop treating the right pane like an individual-command inspection area and make it library-centric instead
- simplify the left command toolbar into a clearer command-management flow: search first, filters next, routine actions grouped together, destructive action separated
- reduce repeated writable/read-only messaging by moving that explanation into fewer, more useful summary areas
- demote git/origin actions into an explicitly secondary workflow so they stay available without hijacking the main management surface

Final notes:
- dropped the oversized two-pane workspace treatment and rebuilt `src/components/LibraryManagementModal.vue` around the same modal pattern used by Settings: one proportional modal surface, one scrolling body, and stacked management sections instead of competing panes
- moved bulk select into the same top row as search, then kept filters and bulk actions in a simpler secondary row so the command toolbar reads left-to-right without the old overflow problems
- constrained the command list to a bounded list area so the modal no longer expands to dominate the whole app window or clip lower sections like library status
- kept destructive delete visually separate from routine export/filter actions, while demoting origin/git controls into a collapsible secondary workflow area
- tightened writable vs read-only and empty-state copy so the modal explains what the user can do next without repeating status labels across multiple surfaces
- kept the row-click selection behavior in `src/components/CommandList.vue`, which matches the management-first workflow better than the older preview-driven interaction

Verification:
- `pnpm exec vue-tsc --noEmit`
- visual check in `pnpm run dev`

Follow-up note:
- the modal is in a much better shippable state now, but there is still room for future polish on density and spacing if library management gets another dedicated UX pass

### Issue #60: align library management modal visuals with the SnipForge design system

Plan:
- pull the modal back toward existing SnipForge dark-surface styling instead of the heavier green/brown semantic treatment from the layout pass
- reduce visual noise by simplifying header badges, softening secondary panels, and relying more on spacing/typography than nested bordered cards
- tune command selection, hover, active, and disabled states so list navigation feels native to the rest of the app
- tighten the command-toolbar grouping and preview hierarchy so the modal feels cohesive rather than like several UI experiments stitched together

Final notes:
- toned down `src/components/LibraryManagementModal.vue` so it now leans on SnipForge’s existing neutrals and accent tokens instead of loud semantic greens/reds across the whole surface
- reduced visual overload by simplifying header badges, softening pane/secondary-panel borders, flattening the status cards, and making spacing + typography carry more of the hierarchy
- tightened command controls and bulk-action presentation so selection state is quieter by default, stronger only when active, and destructive actions no longer dominate the toolbar when nothing is selected
- updated `src/components/CommandList.vue` to use a subtler accent-tinted active state and cleaner list-surface treatment, which removes the muddy selected-row feel without hiding navigation focus
- improved preview readability with tag chips, clearer metadata separation, and a more deliberate code-surface treatment so the preview feels like the main artifact again

Verification:
- `pnpm exec vue-tsc --noEmit`

### Issue #59: redesign library management modal as a true two-pane workspace

Plan:
- stop treating the modal like a stacked dashboard by making the command browser and preview the two primary panes
- move search, filtering, selection state, and bulk command actions fully into the left command pane so that pane clearly owns browsing
- make the right pane primarily a preview surface, with library status and origin workflow demoted into subordinate sections below the preview instead of competing beside it
- keep library-level actions visible, but attach them to the library header/context instead of letting them blur pane ownership

Final notes:
- restructured `src/components/LibraryManagementModal.vue` into an actual two-pane workspace: the left pane now owns command browsing, selection state, search/filter controls, and bulk actions, while the right pane is led by one dominant preview surface
- moved library-level refresh/sync/import controls into the modal header so they stay available without competing with the command/preview relationship inside the workspace itself
- demoted library status and origin workflow into subordinate panels below the preview, which removes the old stacked-dashboard feeling and gives the preview a single, obvious owner
- adjusted the pane proportions and surface hierarchy so the preview now reads as the main inspection area instead of sharing equal visual weight with status/admin sections

Verification:
- `pnpm exec vue-tsc --noEmit`

### Issue #58: restructure library management modal for preview and workflows

Plan:
- turn the dedicated library management modal into a real workspace with a stronger header, clear state badges, and explicit local-path/origin context
- split bulk command management from origin/git actions so routine library work and repo workflows stop competing in the same visual block
- add an in-modal command preview plus search/filter controls so users can inspect commands without relying on a cramped flat list
- make writable vs read-only state obvious in both copy and action affordances, including stronger empty-state guidance for local writable libraries vs origin-backed read-only ones

Final notes:
- rebuilt `src/components/LibraryManagementModal.vue` into a two-column management workspace with a stronger header, explicit library state badges, a command toolbar, a full preview pane, and separate library-status/origin-workflow sections
- added search alongside tag filtering in the modal so command discovery now works inside the management surface instead of forcing users to scroll a flat list blindly
- separated active-command preview from bulk selection by updating `src/components/CommandList.vue`: row clicks now drive preview focus, while checkboxes remain dedicated to multi-select actions
- made writable vs read-only behavior more legible through badge/copy changes, hidden destructive actions for non-writable libraries, and clearer empty-state messaging for writable vs read-only libraries

Verification:
- `pnpm exec vue-tsc --noEmit`
- `pnpm vitest run tests/preload.test.ts tests/library-changes.test.ts`

### Issue #57: dedicated library management modal

Plan:
- remove the inline per-library management panel from `SettingsModal.vue` so the Libraries tab stays a directory of libraries, not a cramped nested workspace
- add a dedicated `LibraryManagementModal.vue` component that owns the focused per-library surface for command list, selection, export/import actions, and origin workflow controls
- keep Settings responsible for opening/closing the management surface and refreshing library data, while the modal handles the in-context library workflow presentation
- preserve existing library-level actions after the refactor, but stop depending on the squished inline layout that caused the missing/blank preview space regression

Final notes:
- moved the per-library management UI out of `SettingsModal.vue` into a dedicated `src/components/LibraryManagementModal.vue` overlay, so the Libraries tab now acts like a directory while focused management happens in a separate workspace
- kept Settings responsible for library list orchestration, modal open/close, and backend refresh/workflow calls, while the new modal owns command selection/filter/export controls and the library-specific layout
- preserved the existing library-level actions inside the new modal: refresh, sync, origin fetch/update/relink/commit/push/PR, import for the default writable library, selected-command delete, and selected-command export
- tightened library zip export from the management surface to use the modal’s explicit selected command IDs instead of relying on the old inline state path

Verification:
- `pnpm exec vue-tsc --noEmit`
- `pnpm vitest run tests/preload.test.ts tests/library-changes.test.ts`

### Issue #55: reconcile library docs and retire stale remote-library references

Plan:
- make this doc the unambiguous current product reference for shipped library behavior
- align the storage and schema docs around the same local-working-copy plus optional-origin model
- mark `docs/remote-libraries.md` as archived migration history only, with explicit retention and deletion criteria
- remove or rewrite doc language that still presents subscription-style remote commands, publish/unpublish rows, or the old Manage Commands surface as current behavior

Final notes:
- reaffirmed this doc as the product truth for current library workflows: every library is a local working copy, origins are library metadata, and command rows stay limited to copy/edit/delete
- aligned `docs/library-first-command-storage.md` and `docs/schema.md` with the same model so storage, schema, and UX docs now describe one architecture instead of multiple eras at once
- reduced `docs/remote-libraries.md` to an explicitly archived history doc and documented the exit criteria for eventually deleting it once the remaining compatibility language and migration context are no longer needed
- cleaned up adjacent references in `src/assets/help.md`, `docs/codebase-map.md`, `docs/settings.md`, `docs/db-health.md`, and `docs/pending.md` so they no longer present subscription-era behavior as the shipped product model

### Issue #56: clean up legacy remote-library code after working-copy migration

Plan:
- remove stale command-level remote publish surfaces that no longer belong to the working-copy product model
- trim dead IPC/preload/type exposure that only supported the old publish/browse flow and is no longer used by the renderer
- keep intentionally retained compatibility paths explicit, especially the `subscribe` alias and legacy `RemoteCommand` type alias
- add regression coverage around the surviving preload API so the active surface stays aligned with the library-level workflow model

Final notes:
- removed the dead command-level remote publish path from `electron/main/github.ts`, `electron/main/index.ts`, `electron/preload/index.ts`, and the renderer typings, including the unused `library:bulkPublish`, `library:browse`, and progress-event preload exposure
- deleted the orphaned `src/components/BulkPublishModal.vue` component and pruned stale publish/unpublish CSS selectors from `src/App.vue`
- kept the `subscribe` preload alias and `RemoteCommand` type alias on purpose as explicit compatibility shims while the shipped migration surface still recognizes legacy terminology
- `tests/preload.test.ts` now asserts both the active working-copy API and the absence of the removed command-level publish/browse methods

Verification:
- `pnpm vitest run tests/preload.test.ts tests/library-changes.test.ts`
- `pnpm exec vue-tsc --noEmit`


### Issue #54: harden legacy command and library migration paths

Plan:
- stop marking legacy migrated libraries as initialized when the cloned/opened folder does not actually contain a `.snipforge.json`
- keep legacy DB-only command migration non-destructive when the default writable library exists in SQLite but its folder or manifest is stale on disk
- add regression coverage for uninitialized legacy working copies and stale default-library upgrade states
- tighten the docs around what recovery is supported automatically vs what remains a user-visible blocked state

Final notes:
- `electron/main/database.ts` now lets legacy origin migrations carry a nullable `manifest_path`, so a cloned working copy without `.snipforge.json` is linked locally without being falsely marked as initialized/materialized
- `electron/main/local-library.ts` now keeps legacy DB-only migration non-destructive when the saved default writable library is stale on disk, returning `completed: false` instead of deleting the SQLite-only commands
- `tests/database.test.ts` and `tests/local-library.test.ts` now cover both uninitialized migrated working copies and stale default-library recovery behavior

Supported recovery after this hardening:
- legacy GitHub-library rows can be migrated into a real local working copy even if that repo folder does not currently contain a SnipForge manifest; the library stays uninitialized until the manifest exists
- stale default writable library records no longer cause destructive legacy-command cleanup during upgrade; the commands remain in SQLite until the writable library is repaired

Still blocked/user-visible:
- missing or invalid manifests are not auto-repaired; the user still needs to re-init or relink the affected library folder
- already-migrated stale local paths still surface through normal reindex/sync errors rather than silent success

### Issue #52: guarantee real git working copies for origin-backed libraries

Plan:
- stop creating origin-linked records that only materialize files without a real git working tree
- make add-from-origin land in a deterministic cloned repo-backed working copy
- add a relink path for legacy migrated libraries whose stored folder is outside any git repo
- tighten docs so local-only, git-backed, and legacy migrated states are described explicitly

Final notes:
- `electron/main/github.ts` now clones origin repos into deterministic app-support working-copy roots and links the library to the real local folder instead of creating subscription-style metadata records
- `electron/main/local-library.ts` now migrates legacy `type: 'github'` libraries by cloning real repos, and exposes `relinkOriginLibraryToFolder()` so already-materialized non-repo libraries can be upgraded without touching SQLite manually
- `electron/main/index.ts`, `electron/preload/index.ts`, and `src/components/SettingsModal.vue` now expose a relink action in the library Changes surface for blocked legacy libraries
- `src/utils/library-changes.ts` now calls out relink-required legacy state instead of treating origin-backed plus non-repo as a normal steady state

### Issue #50: move origin workflows to the library level

Plan:
- add explicit library-level fetch, update, commit, push, and pull-request actions to the Changes management surface instead of leaking origin behavior back onto command rows
- drive those actions through system `git`, with clear blocked or fallback states for non-repo working copies, missing remotes, detached heads, missing upstream branches, and missing GitHub CLI
- keep push gated to owner/curator-capable libraries while still letting consumer-oriented working copies commit locally and use a PR-oriented browser fallback

Final notes:
- `electron/main/local-library.ts` now resolves real git workflow context from the working copy, infers GitHub origin metadata from local remotes when possible, and exposes library-level fetch/update/commit/push/PR actions with explicit blocked results
- `electron/main/index.ts`, `electron/preload/index.ts`, and `shared/types.ts` now carry a focused library workflow API for the renderer instead of the old command-row publish/unpublish contract
- `src/components/SettingsModal.vue` now shows origin workflow actions inside the library Changes panel, including disabled-state reasons and a compare-page fallback when `gh` is unavailable
- default keyboard shortcuts no longer reserve publish/unpublish bindings, which keeps the active surface aligned with the working-copy model

### Issue #48: library-level working tree status using system `git`

Plan:
- detect working-tree state at the library level by shelling out to system `git` instead of bundling a runtime
- expose a small backend summary on each library contract so the current library list can consume it later without adding the full Changes workflow yet
- make fallback explicit for both "git is not installed" and "this library is not inside a git work tree" so later UI work can message those states cleanly

Final notes:
- `shared/types.ts` now carries a library-level `working_tree` summary with explicit states for clean, dirty, not-a-repo, no-working-copy, git-unavailable, and unexpected command errors
- `electron/main/local-library.ts` shells out to system `git` for `rev-parse` and `status --porcelain`, scopes results to the library folder, and returns modified/new/deleted counts without bundling Git
- `library:getAll` now returns libraries enriched with working-tree status so the current library list has backend data ready for a later Changes UI without pulling #49 or #50 forward

## Why This Exists

The current mental model still leaks old architecture:

- command rows can show cloud-oriented actions even when the command is already in a local writable library
- editing a subscribed remote command creates identity ambiguity
- the UI mixes command CRUD with library distribution mechanics

That is too clever for what the product actually is. SnipForge should act like a library-focused file editor with search, copy, and optional Git workflows.

## User Model

### Core Rule

Every library is local-first.

- A library is always a folder on disk with `.snipforge.json`
- Commands are always files inside that folder
- Some libraries also have a Git origin
- Git-backed workflows belong to the library, not the command row

### Library Types

There are only two useful states:

1. **Local-only library**
   - Local folder on disk
   - Fully editable
   - No remote origin required

2. **Git-backed library**
   - Local working copy on disk
   - Fully editable
   - May have a remote Git origin
   - Changes can later be committed, pushed, or turned into a PR

The important simplification is that both are still libraries on disk. The difference is origin, not command behavior.

## Usage

### Local Library Flow

1. Init or open a library folder
2. Work with the library
3. Commands are created, edited, and deleted as files in that folder

### Git-Backed Library Flow

1. Fork or clone a library into a local working copy
2. Work with the library like any other library
3. If the library has changes, use the library-level **Changes** flow
4. If the user has owner/admin rights, allow commit and push
5. If the user is a consumer, allow commit and PR-oriented flow later

### Command Row UX

The main command list should only expose normal command actions:

- copy
- edit
- delete

Do not leak distribution mechanics into the command row.

That means:

- no cloud vs non-cloud iconography in the main list
- no publish/unpublish buttons on normal command rows
- no hidden detach-on-edit behavior

If a command is deleted from a Git-backed library, it should be deleted from the local working copy only. What happens with that deletion upstream is a separate library-level action.

## UX Direction

### Main View

The main view is command-focused, not Git-focused.

- Commands should look uniform regardless of origin
- Library identity can still appear as a badge or source label when useful
- That label should not change the action set

### Library Manage View

Library-level operations belong in the library management surface.

That surface should own:

- library metadata
- origin details
- sync/fetch/update actions
- change detection
- commit/push/PR actions

If the library has pending filesystem changes, show a **Changes** button or section. That is where Git-like controls should live.

### Delete Semantics

For now, keep delete simple:

- deleting a command removes it from the local working copy
- the app does not try to interpret that as an immediate remote deletion
- future upstream actions happen through the library-level Git flow

This is intentionally simpler than the previous remote-command model.

## Developer Reference

### Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Command model | Commands are files in a library working copy | Matches what the product actually stores |
| Library model | All libraries are local-first folders | Removes special-case command behavior |
| Origin handling | Origin is library metadata, not command identity | Keeps command UX simple |
| Main command actions | Copy, edit, delete only | Prevents command-row workflow clutter |
| Git workflows | Library-level only | Git concerns belong to the working copy, not the snippet row |
| Delete behavior | Delete locally first | Avoids hidden remote side effects |
| Default storage | Filesystem | Consistent with library-first storage |
| SQLite role | Cache/index + app metadata | Fast search without owning canonical content |
| Git dependency | Prefer system `git` first | Lower complexity than bundling Git |

### What Changes From The Current Model

This design intentionally pushes back on the older "subscribed remote command" mental model.

Replace:

- remote commands as a special read-only command class
- detach-on-edit behavior
- publish/unpublish row actions

With:

- libraries as working copies
- commands as normal files
- origin-aware workflows only at the library level

### Role Handling

GitHub role data is still useful, but only for deciding what library-level actions to offer.

Examples:

- owner/admin: commit + push
- consumer: commit locally, later PR flow

Those permissions should not change the main command row behavior.

### Open Questions

- Whether "subscribe" should become "clone" or "add working copy from GitHub" in the UI
- Whether local-only libraries should optionally initialize Git from the app
- Whether a future PR flow should depend on GitHub auth, `gh`, or a lighter custom flow
- How aggressively the app should surface working tree state in the library list

## Architecture Direction

### Canonical Data Flow

```text
Library folder on disk
  -> command JSON files
  -> SQLite cache/index
  -> renderer search / list / edit views

Optional Git origin
  -> fetch / status / commit / push / PR
  -> library manage surface
```

### Library State

Minimum useful library state:

- local path
- manifest path
- optional origin URL
- optional Git provider metadata
- working tree status summary
- user role for origin-backed actions

### Command State

Command state should stay boring:

- file path
- library id
- content fields
- timestamps
- optional stable command id

Do not add special command-level origin behavior unless absolutely necessary.

## Key Files Likely To Change

| File | Why |
|------|-----|
| `docs/remote-libraries.md` | Legacy remote-library reference and migration history |
| `docs/library-first-command-storage.md` | Needs alignment with the new library/origin model |
| `electron/main/github.ts` | Remote flows likely shift from subscribe/sync semantics toward clone/fetch/status semantics |
| `electron/main/local-library.ts` | Becomes the core library working-copy layer |
| `electron/main/index.ts` | IPC surfaces need to move Git/distribution actions to the library level |
| `src/App.vue` | Command row action set should simplify to copy/edit/delete |
| `src/components/SettingsModal.vue` | Library management UI needs a changes/status workflow |

## Phases

### Phase 1: Lock The Working-Copy Model

Deliverables:

- this doc
- explicit replacement of detach-on-edit and command-row publish/unpublish concepts
- decision that command rows stay origin-agnostic

Verification:

- product language is clear enough that "what happens when I edit a Git-backed command?" has a short answer

### Phase 2: Simplify Command UX

Deliverables:

- remove cloud/publish/unpublish actions from the main command list
- keep command row actions to copy/edit/delete
- treat deletes as local working-copy deletes

Verification:

- a user can no longer confuse local-library commands with remote distribution controls

### Phase 3: Move Origin Workflows To Library Management

Deliverables:

- library-level `Changes` surface
- library-level status summary for modified/new/deleted command files
- actions for commit/push and later PR flow

Verification:

- command CRUD and Git workflows are clearly separated in the UI

### Phase 4: Git Integration Strategy

Deliverables:

- initial implementation using system `git`
- documented fallback behavior when `git` is unavailable
- decision on whether embedded Git is ever needed

Verification:

- the app can inspect working-copy changes without bundling a custom Git runtime

## Issue Breakdown

Tracked in GitHub issue [#51](https://github.com/ArtluxDM/SnipForge/issues/51).

Implementation order:

1. [#45](https://github.com/ArtluxDM/SnipForge/issues/45) Refactor library contracts around local-first working copies
2. [#46](https://github.com/ArtluxDM/SnipForge/issues/46) Migrate existing remote-library data into local working copies
3. [#47](https://github.com/ArtluxDM/SnipForge/issues/47) Simplify command rows to copy, edit, and delete only
4. [#48](https://github.com/ArtluxDM/SnipForge/issues/48) Add library-level working tree status using system `git`
5. [#49](https://github.com/ArtluxDM/SnipForge/issues/49) Add a library-level Changes surface for origin workflows
6. [#50](https://github.com/ArtluxDM/SnipForge/issues/50) Move fetch, commit, push, and PR workflows to the library level

## Immediate Recommendation

Do not bundle Git yet.

Start with:

- libraries as filesystem working copies
- system `git` when available
- Git-aware controls only in the library manage panel

That keeps the product model simple while leaving room for more advanced collaboration workflows later.
