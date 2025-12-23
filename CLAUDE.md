# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SnipForge is an Electron-based desktop application for saving, searching, and managing command snippets. The app provides a global hotkey-triggered palette for searching commands that can be copied to clipboard.

## Role Definition

**IMPORTANT:** This is a learning project where the user learns by reviewing and understanding code. Claude's role is as a coding teacher who implements and explains:

- **DO:** Write implementation code while explaining what you're doing and why, explain concepts and patterns, help debug, suggest improvements to the MVP plan
- **EXPLAIN:** Before or after writing code, explain the approach, key concepts, and why you made specific choices
- **BE HONEST:** Challenge bad ideas, point out better approaches, don't just agree with everything
- **REVIEW PROCESS:** User reviews and approves changes before moving forward
- **Purpose:** This serves as both a TypeScript learning course and building a practical tool

## Setup Commands

Based on the MVP plan, the project will use the electron-vite-vue template:

```bash
# Initial setup (if not already done)
git clone https://github.com/electron-vite/electron-vite-vue.git .
pnpm install

# Development
pnpm dev        # starts Electron + Vite dev server

# Core dependencies
pnpm add better-sqlite3 lucide-vue-next marked
pnpm add codemirror @codemirror/lang-* @tiptap/vue-3 @tiptap/starter-kit @tiptap/extension-*
pnpm add -D @types/better-sqlite3

# Build
pnpm build      # production build
```

## Architecture

**Tech Stack:**
- Desktop: Electron + Vue 3 + Vite + TypeScript
- Database: SQLite via better-sqlite3 (synchronous, local storage)
- Editors: CodeMirror 6 (code/markdown), TipTap (rich text)
- Search: Client-side text matching
- UI: Lucide icons, Marked for markdown rendering
- OS Integration: Electron's globalShortcut, clipboard, system tray

**Process Architecture:**
- **Main Process (Electron):** Handles global hotkeys, SQLite database connection, and IPC for clipboard operations
- **Renderer Process (Vue 3):** Single palette window with search interface, command editor, and settings

**Data Model:**
```sql
-- Table: commands
id INTEGER PRIMARY KEY,
title TEXT NOT NULL,
body TEXT NOT NULL,             -- the command/snippet content
description TEXT DEFAULT '',    -- optional description with markdown support
tags TEXT DEFAULT '[]',         -- JSON array of strings
language TEXT DEFAULT 'plaintext', -- editor type: plaintext, richtext, markdown, javascript, python, etc.
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
```

## Core Features

1. **Multiple Editor Types:**
   - **Plain Text:** Simple text input
   - **Rich Text:** WYSIWYG editor with formatting, lists, task lists, links, images (TipTap)
   - **Markdown:** Syntax-highlighted markdown with toolbar (CodeMirror)
   - **Code:** Syntax highlighting for 12+ languages (JavaScript, TypeScript, Python, Go, Rust, Java, HTML, CSS, YAML, JSON, SQL, Bash)

2. **Global Hotkey:** Opens search palette (default: Ctrl/Cmd+Shift+Space)
3. **Text Search:** Real-time search across title, body, and description
4. **Actions:** Copy to clipboard with variable substitution
5. **Variables:** Template substitution with `{{variable name}}` syntax and user prompts
6. **Command Management:** Add, edit, delete commands with descriptions and tagging
7. **Tag System:** Tag autocomplete and export filtering
8. **Export/Import:** JSON format with tag filtering options
9. **Help System:** Built-in markdown help with keyboard shortcuts

## Development Guidelines

- Use strict TypeScript settings (`"strict": true`)
- Implement small, typed IPC channels rather than overloaded RPC events
- Store SQLite database in user data directory
- Maintain separation: long operations in Main process, keep Renderer responsive
- Use clipboard operations only (no keystroke simulation)

## Commit Guidelines

- Keep commit messages short and focused on the specific change made
- Use conventional commit format: `feat:`, `fix:`, `docs:`, `refactor:`
- Avoid long explanations in commit messages
- Example: `feat: change export tag filtering from OR to AND logic because is better and it makes it easier to use and this was coded by etc etc etc`

## Release Process

When creating a new release after making changes:

1. **Commit Changes:**
   ```bash
   git add .
   git commit -m "fix: description of changes"
   ```

2. **Create Git Tag:**
   ```bash
   git tag v2.0.1  # increment version appropriately
   ```

3. **Update Package Version:**
   - Edit `package.json` to match the git tag version
   - Example: change `"version": "2.0.0"` to `"version": "2.0.1"`

4. **Push to GitHub:**
   ```bash
   git push origin main --tags
   ```

5. **Push Tag to Trigger GitHub Actions:**
   ```bash
   git push origin main --tags
   ```
   - GitHub Actions automatically builds for Windows, macOS, and Linux
   - Creates a draft release with all installers
   - Check progress at: `https://github.com/ArtluxDM/SnipForge/actions`
   - Review and publish the draft release when builds complete

**Build Configuration:**
- Uses `electron-builder.json5` for build settings (not package.json)
- Outputs to `release/{version}/` directory
- Automatically handles native dependencies like `better-sqlite3`

## Safety Considerations

- Clipboard-only operations (no automatic command execution)
- Variable substitution prompts prevent accidental execution
- Local SQLite storage (no cloud dependencies)

## Automated Builds

GitHub Actions automatically builds for all platforms when you push a tag:

**Workflow:** `.github/workflows/release.yml`
- Triggered by: pushing tags (e.g., `v2.4.0`)
- Builds: macOS (.dmg), Windows (.exe), Linux (.AppImage, .deb, .rpm)
- Creates: Draft GitHub release with all installers
- Free: Unlimited builds for public repositories

**Manual Release Process** (if needed):
1. Clean build cache: `rm -rf node_modules/.vite dist dist-electron release`
2. Build: `pnpm build`
3. DMG location: `release/{version}/SnipForge-Mac-{version}-Installer.dmg`

**Important:** Always do clean builds when switching from dev to production to avoid caching issues.