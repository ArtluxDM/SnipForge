<p align="center">
  <img src="app-icon.png" width="120" alt="SnipForge icon">
</p>

<h1 align="center">SnipForge</h1>

<p align="center">
  <strong>Your commands, one hotkey away.</strong><br>
  A blazing fast snippet palette that lives on your desktop.<br>
  Save commands, code blocks, prompts, and templates. Search instantly, copy with variables.
</p>

<p align="center">
  <a href="https://snipforge.dev">Website</a> &bull;
  <a href="https://github.com/ArtluxDM/SnipForge/releases/latest">Download</a> &bull;
  <a href="https://github.com/sponsors/ArtluxDM">Sponsor</a>
</p>

<p align="center">
  <img src="docs/screenshots/command-palette.png" width="720" alt="SnipForge command palette">
</p>

## Why SnipForge

You have hundreds of commands across Docker, Kubernetes, Git, SSH, APIs, and internal tooling. Some live in Notion, some in Slack messages, some you just google every time. SnipForge puts them all in one place — a global hotkey palette that opens from anywhere, searches instantly, and copies to your clipboard with variable substitution.

Teams can share command libraries through GitHub repos. Adding a GitHub library creates a local working copy of its command files; a local folder works without GitHub.

## Features

**Global hotkey** — One shortcut opens SnipForge from any app. Type to search, arrow keys to navigate, Enter to copy. Configurable in settings.

**Variables** — Use `{{variable name}}` templates. When you copy, SnipForge prompts you to fill in each value before it hits your clipboard.

```bash
/add customer {{Customer Name}}
```

<p align="center">
  <img src="docs/screenshots/usage-example-variable-substitution.png" width="720" alt="Variable substitution prompt">
</p>

**Multi-format editors** — Plain text, rich text (TipTap), Markdown, and syntax-highlighted code for 15+ languages (JavaScript, Python, Go, Rust, Bash, SQL, YAML, and more).

**Libraries** — Keep commands as JSON files in local folders; optionally link a library to a GitHub repo for library-level fetch, commit, push, or PR workflows. Auto-sync can refresh the local index.

**Local-first** — Command files live in folders you choose; SQLite indexes them and stores app settings. No account is needed for local libraries. Optional GitHub features use GitHub's API and local Git working copies; update checks contact GitHub Releases when enabled. No telemetry is built in.

**Keyboard-driven** — Full navigation without a mouse. Customizable shortcuts for every action.

## The Armory

SnipForge ships with **The Armory** — a curated starter library of 477 commands across 39 categories including Git, Docker, Kubernetes, SSH, curl, PostgreSQL, nginx, n8n, and more. Import it from `The Armory/` in this repo, or use it as a reference for building your own libraries.

## Download

Get the latest stable release from the [Releases page](https://github.com/ArtluxDM/SnipForge/releases/latest) (prereleases appear on [all releases](https://github.com/ArtluxDM/SnipForge/releases)):

| Platform | Format |
|----------|--------|
| macOS | `.dmg` |
| Windows | `.exe` |
| Linux | `.AppImage` |

> **macOS note**: The app isn't code signed yet. Right-click > "Open" > "Open" to bypass Gatekeeper, or run `xattr -cr /Applications/SnipForge.app` in Terminal.

## Quick Start

1. Install and launch SnipForge; choose a folder for your default writable library when prompted (commands are stored there as JSON files)
2. Press `Cmd+Shift+Space` (or `Ctrl+Shift+Space`) to open the palette
3. Create a command or open an existing library folder, then type to search
4. Press `Enter` or `C` to copy a command
5. If the command has `{{variables}}`, fill in the values when prompted

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Arrow Keys` | Navigate list |
| `C` / `Enter` | Copy command |
| `Shift+C` | Copy with variables intact |
| `N` | New command |
| `E` | Edit selected |
| `Backspace` | Delete selected |
| `Escape` | Clear search / close |
| `S` | Settings |

All shortcuts are customizable in Settings > General.

### Team Libraries

1. Open Settings > **Libraries**; open a local folder for an offline library, or connect GitHub in Settings > Connectors to add a repo-backed one
2. Enter a GitHub repo URL (or `org/team-commands`) and click **Subscribe** (the current UI label); choose a library if the repo contains more than one
3. SnipForge clones the repo into a local working copy and indexes its command files. Use the library's management view for refresh and Git workflows; available write actions depend on permissions and working-copy state

Local libraries do not require GitHub. An unreadable or invalid command JSON blocks that library's sync without discarding its previous search index; repair or remove the bad file and sync again. See [Library Working Copies](docs/library-working-copies.md) for current behavior and [Library-First Command Storage](docs/library-first-command-storage.md) for reconciliation details.

## Build from Source

```bash
git clone https://github.com/ArtluxDM/SnipForge.git
cd SnipForge
# Use Node 24 (.nvmrc) and pnpm 10.16.0 (packageManager)
pnpm install --frozen-lockfile
pnpm typecheck:main
pnpm typecheck:renderer
pnpm test       # prepares Node-native dependencies, then runs the full suite
pnpm dev        # prepares Electron-native dependencies before Vite/Electron
pnpm build      # production packaging; rebuilds Electron-native dependencies
```

Run `pnpm test:db` for just the SQLite suite. After tests, use `pnpm native:electron` to prepare/probe Electron's native addon before launching it (`pnpm dev` does this automatically). Do not run tests and packaging concurrently in the same checkout. See [Release Pipeline](docs/release.md) for CI, smoke checks and publishing.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron + Vue 3 + Vite + TypeScript |
| Database | SQLite via better-sqlite3 |
| Editors | CodeMirror 6 (code/markdown), TipTap (rich text) |
| Search | Fuse.js (weighted fuzzy search) |
| UI | Lucide icons, Virtua (virtual scrolling), highlight.js |

## Documentation

- [Library Working Copies](docs/library-working-copies.md) — current local/GitHub library behavior
- [Library-First Command Storage](docs/library-first-command-storage.md) — files, index and sync behavior
- [Release Pipeline](docs/release.md) — checks, packaging and manual publication
- [DB Health](docs/db-health.md) — SQLite maintenance checks and DB test recovery
- [Codebase Map](docs/codebase-map.md) — File reference, architecture, IPC channels
- [Settings](docs/settings.md) — Configuration, hotkey remapping, auto-sync
- [Variable Substitution](docs/variable-substitution.md) — Template syntax and copy flow

## Support

SnipForge is built and maintained independently. If you or your team uses it, consider [sponsoring the project](https://github.com/sponsors/ArtluxDM) to keep development active.

## License

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). Free to use, modify, and distribute. Modifications must be released under AGPL with full source code.

For commercial licensing inquiries, reach out at [contact@snipforge.dev](mailto:contact@snipforge.dev).
