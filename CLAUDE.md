# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SnipForge is an Electron-based desktop application for saving, searching, and managing command snippets. The app provides a global hotkey-triggered palette for searching commands that can be copied to clipboard.

## Role Definition

**IMPORTANT:** This is a learning project where the user will code everything by hand. Claude's role is as a coding teacher and consultant:

- **DO:** Guide step-by-step, explain concepts, review code, help debug, suggest improvements to the MVP plan
- **DON'T:** Write implementation code for the user (except for CLAUDE.md and MVP plan adjustments)
- **BE HONEST:** Challenge bad ideas, point out better approaches, don't just agree with everything
- **Purpose:** This serves as both a TypeScript learning course and building a practical tool

## Setup Commands

Based on the MVP plan, the project will use the electron-vite-vue template:

```bash
# Initial setup (if not already done)
git clone https://github.com/electron-vite/electron-vite-vue.git .
pnpm install

# Development
pnpm dev        # starts Electron + Vite dev server

# Add core dependencies
pnpm add better-sqlite3 lucide-vue-next marked
pnpm add -D @types/better-sqlite3

# Build
pnpm build      # production build
```

## Architecture

**Tech Stack:**
- Desktop: Electron + Vue 3 + Vite + TypeScript
- Database: SQLite via better-sqlite3 (synchronous, local storage)
- Search: Client-side text matching
- UI: Lucide icons, Marked for markdown help
- OS Integration: Electron's globalShortcut and clipboard

**Process Architecture:**
- **Main Process (Electron):** Handles global hotkeys, SQLite database connection, and IPC for clipboard operations
- **Renderer Process (Vue 3):** Single palette window with search interface, command editor, and settings

**Data Model:**
```sql
-- Table: commands
id INTEGER PRIMARY KEY,
title TEXT NOT NULL,
body TEXT NOT NULL,             -- the command (shell or slash)
tags TEXT DEFAULT '[]',         -- JSON array of strings
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
```

## Core Features

1. **Global Hotkey:** Opens search palette (default: Ctrl/Cmd+Shift+Space)
2. **Text Search:** Real-time search across title and body using simple text matching
3. **Actions:** Copy to clipboard with variable substitution
4. **Variables:** Template substitution with `{{variable name}}` syntax and user prompts
5. **Command Management:** Add, edit, delete commands with tagging support
6. **Tag System:** Tag autocomplete and export filtering
7. **Export/Import:** JSON format with tag filtering options
8. **Help System:** Built-in markdown help with keyboard shortcuts

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

## Safety Considerations

- Clipboard-only operations (no automatic command execution)
- Variable substitution prompts prevent accidental execution
- Local SQLite storage (no cloud dependencies)