---
title: "snipforge"
tags: [project, electron, desktop, active]
status: active
cluster: snipforge
tech: [electron, vue3, typescript, sqlite, vite, fuse.js]
related:
  - "[[snipforge-website/CLAUDE]]"
  - "[[home-lab/CLAUDE]]"
---

## What This Is

SnipForge is a desktop app (Electron + Vue 3 + TypeScript) for saving, searching, and managing command snippets. Global hotkey opens a palette, you search, you copy. The user is an engineer/human/ai_agent who needs commands/snippets fast — every UX decision serves that.

## Workflow

**Doc-first:**
1. Update the feature doc with the plan before writing code
2. Implement, referencing the GitHub issue in commits. Use `fixes #N` for bug fixes, rework, and refactor issues. Use `closes #N` for feature issues and chore issues when the todo item is complete and should close automatically.
3. Update the feature doc with final notes and mark deliverables complete
4. The feature doc is the source of truth — for the plan, the roadmap, and the dev log

**GitHub Issues** are the work tracking system. Each session starts with an issue, ends with a commit that references it. Issues have acceptance criteria and point to the relevant feature doc. We use GitHub issues as the todo list, so closure semantics are intentional: `fixes #N` is for bug/rework/refactor issues, while `closes #N` is for completed feature/chore issues that should leave the todo list.

**User-first mindset.** We're not building code for code's sake. Every feature exists because a person needs it. Think about how functional it is for the end user — that's the driver, not how fancy the implementation is.

**Context management.** For large features, split into two issues: backend (#N-backend) and frontend (#N-frontend). Backend session handles main process, SQLite, IPC, types. Frontend session starts fresh with clean context and handles Vue components, styles, visual verification. This avoids hallucinations from context pressure. Chrome DevTools MCP is available directly for screenshots and visual verification (`pnpm dev:debug`). See `.claude/README.md` for available agents.

**Scratch notes.** Temporary working notes may live in repo-local `temp*.md` files while a task is in progress. These files are scratch only, are git-ignored, and should be removed after the task is complete unless the user explicitly asks to keep or promote them into real docs.

## Tech Stack

- Desktop: Electron + Vue 3 + Vite + TypeScript
- Database: SQLite via better-sqlite3 (synchronous, local storage)
- Editors: CodeMirror 6 (code/markdown), TipTap (rich text)
- Search: Fuse.js (fuzzy search with weighted scoring)
- UI: Lucide icons, Marked + highlight.js, DOMPurify for sanitization
- Performance: Virtua for virtual scrolling
- OS Integration: Electron globalShortcut, clipboard, system tray
- Remote: GitHub API (Device Flow auth, repo sync for remote libraries)

## Architecture

- **Main Process:** Global hotkeys, SQLite, IPC, GitHub API operations
- **Renderer Process:** Single palette window — search, editor, settings
- **Process boundary:** Long operations in Main, keep Renderer responsive
- **IPC:** Small, typed channels — not overloaded RPC events

## Frontend Reference

**Key files:**
- `src/App.vue` — main palette (search, command list, all root styles)
- `src/components/SettingsModal.vue` — settings page (General, Connectors, Libraries, Manage Commands)
- `src/components/CommandModal.vue` — add/edit command
- `src/components/VariableInputModal.vue` — variable substitution prompt
- `src/composables/useSettings.ts` — reactive settings store
- `src/preload.ts` — IPC bridge (check for available channels)
- `shared/types.ts` — shared TypeScript types

**Design system (CSS variables in App.vue):**
- Accent: `--accent` (#ec5002), `--accent-hover`, `--accent-light`
- Backgrounds: `--bg-app`, `--bg-input`, `--bg-surface`, `--bg-elevated`, `--bg-hover`
- Text: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-muted`
- Borders: `--border`, `--border-hover`
- Z-indices: `--z-dropdown` (500), `--z-modal` (1000), `--z-toast` (2000)

**Design skills available:** `frontend-design` (plugin, creative direction), `ui-ux-pro-max` (skill, UX knowledge database). Invoke when making visual design decisions.

## Feature Docs

Feature documentation lives in `docs/`. These are living documents — plan, implementation notes, and dev log in one place.

| Doc | What | Status |
|-----|------|--------|
| `docs/schema.md` | Database schema — tables, columns, migrations, TypeScript types | Living reference |
| `docs/library-first-command-storage.md` | File-backed command model — filesystem source of truth, SQLite as index/cache, migration and sync notes | Current reference + historical roadmap |
| `docs/library-working-copies.md` | Current local and GitHub-origin library UX and working-copy workflows | Current reference |
| `docs/remote-libraries.md` | Older subscription-era architecture and migration history | Archived (not current setup guidance) |
| `docs/settings.md` | Settings — infrastructure, General tab, connectors, auto-sync, shortcuts | Phases 1-3 complete |
| `docs/variable-substitution.md` | Variable substitution — `{{variable}}` templates, copy flow, highlighting | Current state documented, #11 planned |
| `docs/auto-update.md` | Stable-release check and notification (Phase 1); download/install (Phase 2) | Phase 1 implemented; Phase 2 future |
| `docs/db-health.md` | Database health — integrity checks, orphan detection, VACUUM | Deepness TBD |
| `docs/release.md` | Release pipeline — tag-triggered CI builds, artifact collection, draft GitHub releases | Living reference |

## Development

```bash
# Use Node 24 (.nvmrc) and pnpm 10.16.0 (packageManager)
pnpm install --frozen-lockfile
pnpm typecheck:main && pnpm typecheck:renderer
pnpm test         # prepares Node-native dependencies; full suite
pnpm test:db      # same preparation; DB suite only
pnpm dev          # prepares Electron-native dependencies, starts Electron + Vite
pnpm dev:debug    # same, with Chrome DevTools Protocol on port 9222
pnpm build        # production package build
```

### Guidelines

- Strict TypeScript (`"strict": true`)
- Clipboard-only operations (no keystroke simulation, no auto-execution)
- Variable substitution with `{{variable name}}` prompts user before copy
- Store SQLite database in user data directory

### Commit Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Short, focused messages — what changed and why, not a paragraph
- Reference GitHub issues explicitly:
  - Bug fix, rework, or refactor issue: `fix: harden sync bookkeeping (fixes #25)`
  - Completed feature or chore todo item: `feat: add CLI v1 for library search (closes #31)`

### Release Process

**Option 1 — Claude Release Manager Agent (currently blocked; see issue #79):**

**Do not use this agent for a release until #79 is fixed.** `.claude/agents/release-manager.md` currently launches/kills the app without verifying user-data isolation, deletes build output, and auto-promotes a green CI draft. That contradicts the isolated packaged-app checks and manual publication gate in `docs/release.md`. It is also not automatically available in every coding harness.

**Option 2 — Manual version PR and tag** (the old release script is incompatible with protected `main`):

Create a version-bump PR, pass the three required `Verify` checks, and merge. Tag the merged `main` commit and push **only that tag**; do not run `scripts/release.sh` on protected `main`. It commits and pushes the branch plus all local tags without checks or confirmation, and its direct branch push can be rejected. Use the isolated packaged-app checklist in `docs/release.md` before manually publishing the CI draft.

In both cases, GitHub Actions verifies the exact tagged commit (main and renderer type checks plus full tests on macOS, Windows, and Linux) before parallel platform builds. One job then attaches artifacts to a **draft**, not a published release. `electron-builder` must not receive release credentials during build jobs; GitHub Actions owns publishing. See `docs/release.md`.

**Build config:** `electron-builder.json5` (not package.json). Always do clean builds when switching dev → production.

## Safety

- Clipboard-only — never executes commands automatically
- Variable substitution prompts prevent accidental execution
- GitHub tokens use Electron `safeStorage` when available; when unavailable the code falls back to base64 encoding (not encryption). Linux `basic_text` is not secure storage either — do not promise at-rest protection on every machine.
- DOMPurify is used at command/Markdown HTML rendering and clipboard HTML sinks; this is not a substitute for hostile-content testing.
