# Settings

Persistent user preferences with a proper settings infrastructure. Currently everything is hardcoded or ephemeral — this feature adds a settings backend, IPC bridge, reactive store, and UI.

The SettingsModal is the settings page. Each tab is a settings section.

## Architecture

### Storage

`settings` table in SQLite — key-value, same pattern as `auth`:

```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
```

Values are JSON-encoded for complex types (e.g., `{"width":800,"height":600}`). Simple values stored as plain strings.

### Backend

`electron/main/settings.ts` — CRUD with typed defaults:

```typescript
// Defaults are the source of truth for available settings + their types
const DEFAULTS: Record<string, unknown> = {
  'general.hotkey': 'CommandOrControl+Shift+Space',
  'general.windowState': null,
  'library.autoSync': false,
  'library.autoSyncInterval': 30,  // minutes
}

function get<T>(key: string): T
function set(key: string, value: unknown): void
function getAll(): Record<string, unknown>
```

### IPC

| Channel | Purpose |
|---------|---------|
| `settings:get` | Get a single setting by key |
| `settings:set` | Set a single setting |
| `settings:getAll` | Get all settings (merged with defaults) |

### Renderer

Reactive composable (`src/composables/useSettings.ts`) — loads all settings on mount, provides reactive refs that auto-persist on change:

```typescript
const { settings, updateSetting } = useSettings()
// settings.value['general.hotkey'] → reactive, auto-persists
```

SettingsModal consumes this composable. Other components can too (e.g., App.vue for hotkey display).

---

## Tab Structure

The SettingsModal tabs:

1. **General** — hotkey remapping, shortcuts, display prefs (themes, tag pills, preview on copy), window state
2. **Connectors** — OAuth integrations (GitHub now, extensible for GitLab/Bitbucket/etc.)
3. **Libraries** — local/opened libraries, GitHub-backed libraries, sync/origin controls, auto-sync toggle + interval, and library-scoped management entry points

---

## Phases

### Phase 1: Infrastructure + General Settings (issue [#10](https://github.com/ArtluxDM/SnipForge/issues/10)) ✅ COMPLETE

The foundation. Adding new settings is now just a key in `DEFAULTS` + one UI element.

**Settings infrastructure:**
- [x] `settings` table in `database.ts` (migration)
- [x] `electron/main/settings.ts` — get/set/getAll with typed defaults, JSON encoding, overlay pattern
- [x] IPC handlers in `index.ts` — `settings:get`, `settings:set`, `settings:getAll`
- [x] Preload bridge + type declarations
- [x] `src/composables/useSettings.ts` — reactive singleton store, shared across components

**General tab (new, first tab):**
- [x] Global hotkey remapping — picker captures key combo, validates modifiers, re-registers `globalShortcut` live, falls back on failure
- [x] Window state persistence — bounds + maximized saved on close, restored on launch, off-screen detection

**Connectors tab (new):**
- [x] GitHub OAuth moved from Libraries tab
- [x] Extensible list pattern (icon, provider, status/avatar, action button)
- [x] Connected state shows user's GitHub avatar (circular), disconnected shows GitHub icon

**Tab restructure:**
- [x] General (first) → Connectors → Libraries
- [x] Libraries tab cleaned of OAuth and now owns library sync controls plus entry points into library-scoped management

**Key files:**
- `electron/main/settings.ts` — NEW: settings CRUD
- `electron/main/database.ts` — migration for `settings` table
- `electron/main/index.ts` — settings IPC handlers, hotkey re-registration
- `electron/preload/index.ts` — settings bridge
- `src/composables/useSettings.ts` — NEW: reactive store
- `src/components/SettingsModal.vue` — new General + Connectors tabs, restructured layout, OAuth moved
- `src/vite-env.d.ts` — settings type declarations

### Phase 2: Library & Sync Settings ✅ COMPLETE

- [x] Auto-sync toggle + interval dropdown (15/30/60/120 min) in Libraries tab
- [x] Background sync timer in main process (chained `setTimeout`, re-reads interval each cycle, starts/stops on setting change)
- [x] Sync status line — relative time ("2 min ago"), derived from most recent `last_synced_at` across libraries, refreshes every 30s
- [x] `library:autoSyncResult` event pushes results to renderer, triggers library list refresh

### Phase 3: Display & Shortcuts ✅ COMPLETE

Unblocks parked ideas (tag pills, preview on copy). All in the General tab.

- [x] Display settings: tag pills toggle, preview on copy toggle
- [x] Keyboard shortcut remapping — table of current bindings, click-to-rebind, conflict detection
- [x] Shortcuts map (defaults + user overrides) stored in `shortcuts` setting, consumed by App.vue `matchAction()` helper
- [x] Reset to defaults button

**Key changes:**
- `electron/main/settings.ts` — added `display.tagPills`, `display.previewOnCopy`, `shortcuts` defaults with `DEFAULT_SHORTCUTS` export
- `src/App.vue` — tag pills rendering (`.tag-pill`), preview on copy toast, `matchAction()` + `matchesShortcut()` replace hardcoded key checks in `handleKeyboard`
- `src/components/SettingsModal.vue` — Display section (toggle switches), Keyboard Shortcuts section (shortcut table with click-to-rebind, conflict detection, reset)

### Phase 4: Libraries UX Refinement (planned)

The Libraries tab and Library Management workspace are functionally strong, but the current presentation gets visually crowded once management is active. This phase is about sharpening that workflow for daily use as an internal dev tool: focused, practical, and still pleasant.

Planned work:
- [ ] Refactor Library Management into a focused workspace instead of a stacked inline layer ([#62](https://github.com/ArtluxDM/SnipForge/issues/62))
- [ ] Strengthen visual hierarchy and surface depth across Libraries + Management ([#63](https://github.com/ArtluxDM/SnipForge/issues/63))
- [ ] Refine action priority, badges, disabled states, and header polish in the Libraries flow ([#64](https://github.com/ArtluxDM/SnipForge/issues/64))

Implementation notes:
- Keep the current dark dev-tool character and orange brand accent
- Do not over-design it into a commercial SaaS look
- The target is calmer hierarchy, clearer modes, and cleaner repeated daily use
- Visual observations were gathered from live MCP inspection and screenshots during app interaction
- Current shipped direction: library management now takes over the Libraries tab as a focused workspace instead of stacking beside the parent settings surface
- Recent UI refinements also strengthened card hierarchy, action priority, and overview density in the Libraries flow without changing the underlying workflows

### Post-Phase Hardening

#### Tag Filter Semantics In Library Management And Export (issue [#32](https://github.com/ArtluxDM/SnipForge/issues/32)) - Complete

Problem:
The app currently uses different tag-filter semantics depending on where the user is looking. Browse and management flows use OR-style matching, while export filtering still runs through shared AND-style filtering. The export count preview in Settings also follows the old AND rule, so the UI can promise one result set and export another.

Delivered:
- [x] Defined one semantic for multi-tag selection in browse/manage/export flows: OR semantics with exact normalized tag matches
- [x] Routed browse/manage/export matching through shared tag-filter utilities instead of duplicating ad hoc checks
- [x] Updated tests so filtered export behavior is locked to the chosen rule
- [x] Logged the final behavior here after implementation

Implementation notes:
- `src/utils/tags.ts` now owns the shared multi-tag rule through `matchesTagFilter()` and `filterCommandsByTags()`
- `src/App.vue`, `src/components/SettingsModal.vue`, and `src/components/BulkPublishModal.vue` now all use the same matching path
- Matching was tightened to exact normalized tags rather than substring contains, so selecting `docker` no longer silently matches `docker-compose`
- The library-management export count now uses the same shared filter as the export itself, removing preview/export drift

Verification:
- `pnpm exec vue-tsc --noEmit`
- `pnpm test`

---

## Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Storage | SQLite key-value table | Consistent with existing stack, no new dependencies, atomic writes |
| Key format | Dot-notation (`general.hotkey`) | Groups settings by section, readable, greppable |
| Defaults | In code, not DB | DB only stores overrides. Defaults change with app updates without migration. |
| Connectors | Own tab | Auth integrations are a distinct concern. Extensible pattern for future providers. |
| Auto-sync | Per-library + master toggle | Master toggle in Libraries header, per-library toggle next to library name. Fixed 6-hour interval internally. |
| Auto-sync UX | Separate toggle for now | **Future idea:** collapse sync button and auto-sync into one control — single click = manual sync, double click = toggle auto-sync. Eliminates the per-library toggle. |
| Hotkey capture | Custom input that listens for keydown | Standard UX for hotkey pickers. Show current combo, click to change, press new combo. |
| Window state | Save on `close` event, restore on `ready` | Standard Electron pattern. Store as JSON in settings. |
| Shortcuts | General tab, not own tab | Not enough content to justify a dedicated tab. Section within General is sufficient. |

## Connector Pattern

Connectors are authenticated integrations with external services. Phase 1 has one (GitHub), but the UI and data model support adding more.

**UI pattern per connector:**
```
[GitHub Icon]  GitHub          @username    [Disconnect]
[GitLab Icon]  GitLab          Not connected [Connect]
```

**Data model:** GitHub uses the `auth` table for token storage, separate from preferences in `settings`. `safeStorage` encrypts when a secure backend is available; the fallback is base64 only, not encryption (see `docs/schema.md`).

**Future connectors (not planned, just showing the pattern works):**
- GitLab — same OAuth Device Flow, different API
- Bitbucket — OAuth 2.0, different endpoints
- Self-hosted — URL + personal access token
