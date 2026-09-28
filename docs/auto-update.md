# Auto-Update

Automatic update checking and notification for the desktop app. Users should know when a new version is available without manually checking.

## Context

Releases are built via GitHub Actions as drafts for manual review/publication. Phase 1 below is implemented: the app checks for newer **stable published** GitHub Releases and shows a banner; Phase 2 (in-app download/install) is not implemented. The original Phase 1 design below is retained for context.

## Design

### Phase 1 — Check & Notify

No new dependencies. Uses GitHub Releases API directly (same patterns as library sync).

**Check behavior:**
- On launch: check GitHub Releases API for latest published release
- Background: re-check every 24 hours (chained `setTimeout`, same pattern as auto-sync)
- Settings toggle: `update.autoCheck` (default: on)
- Manual check: button in Settings General tab

**Notification UX — bottom banner on main palette:**

```
┌─────────────────────────────────────────────┐
│  search commands...                    ⊕ ⚙  │
├─────────────────────────────────────────────┤
│  (command list)                              │
│                                              │
│                                              │
├─────────────────────────────────────────────┤
│  New version is out   [update]  remind later │
└─────────────────────────────────────────────┘
```

- Banner appears at bottom of palette when update is available
- **"update"** → opens snipforge.dev in browser, dismisses banner for this version
- **"remind me later"** → hides banner, shows again after 24 hours
- If user keeps dismissing, it keeps coming back every 24h (gentle nudge)
- Banner never appears for a version the user already clicked "update" on
- When a NEW version is released (different from dismissed), cycle resets — banner auto-shows again

**Notification timing:**
- First detection of new version: banner auto-shows immediately
- After "remind me later": suppressed for 24 hours, then auto-shows on next launch/check
- After "update" clicked: suppressed permanently for that version

**Settings General tab additions:**
- Current version display (e.g., "Version 2.8.2")
- Update status: "Up to date" / "v2.9.0 available"
- "Check for updates" manual button
- Toggle: "Check automatically" (maps to `update.autoCheck`)

### Phase 2 — In-App Download & Install (future, separate issue)

Requires code signing certificates for both macOS and Windows:
- macOS: Apple Developer account, code signing + notarization in CI
- Windows: EV code signing certificate (for SmartScreen trust)

Without signing, user-triggered in-app install doesn't work well:
- macOS: Gatekeeper blocks unsigned apps
- Windows: SmartScreen shows scary "protected your PC" warning

Phase 2 work:
- Add `electron-updater` dependency
- `electron-builder.json5`: add `publish` config pointing to GitHub
- Download progress UI in the banner
- Install-on-quit flow (less disruptive than immediate restart)
- CI: signing + notarization steps in release workflow

## Implementation Details (Phase 1)

### Settings keys

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `update.autoCheck` | boolean | `true` | Enable/disable automatic checking |
| `update.dismissedVersion` | string \| null | `null` | Version user clicked "update" on (permanent dismiss) |
| `update.remindAfter` | string \| null | `null` | ISO timestamp — suppress banner until this time |

### Types

```typescript
interface UpdateStatus {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null  // snipforge.dev
  lastChecked: string | null // ISO timestamp
}
```

### IPC channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `update:check` | renderer → main | Trigger manual check |
| `update:getStatus` | renderer → main | Get current update status |
| `update:dismiss` | renderer → main | User clicked "update" (permanent dismiss for version) |
| `update:remindLater` | renderer → main | User clicked "remind me later" (24h snooze) |
| `update:statusChanged` | main → renderer | Push status changes to renderer |

### Main process (`electron/main/update.ts`)

- `checkForUpdate()`: GET `https://api.github.com/repos/{owner}/{repo}/releases/latest`, compare semver with `app.getVersion()`
- `startUpdateChecker()`: launch check + 24h timer (chained setTimeout)
- `stopUpdateChecker()`: cleanup on quit
- `shouldShowBanner()`: check `dismissedVersion` and `remindAfter` against current latest

### Renderer

- `UpdateBanner.vue`: bottom banner component in `App.vue`
- Conditional render based on update status + dismissal state
- "update" button calls `shell:openExternal` with `https://snipforge.dev`
- "remind me later" button calls `update:remindLater`

### Banner visibility logic

```
show banner = updateAvailable
              AND latestVersion !== dismissedVersion
              AND (remindAfter is null OR now > remindAfter)
```

## What We're NOT Doing

- No auto-download (not even user-triggered in Phase 1 — just link to website)
- No update channels (stable only)
- No special handling for metered connections (one small API call)
- No tray badge or toast — banner only
- No `electron-updater` in Phase 1

## Status

Phase 1 implemented in `electron/main/update.ts`, `src/components/UpdateBanner.vue`, and Settings; checks use `/releases/latest`, skip drafts/prereleases, and link to snipforge.dev. Phase 2 is future work, not a shipped download/install feature.
