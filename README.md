# SnipForge

A desktop application for saving, searching, and managing command snippets with global hotkey access.

## Features

- Real-time search by title and body
- Global hotkey access with `Cmd+Shift+Space`
- Clipboard integration for copying commands
- Tag system with autocomplete
- Variable substitution using `{{variable name}}` syntax
- Keyboard navigation and shortcuts
- Export/Import commands in JSON format with tag filtering
- Built-in help system

## Installation

### From Release (Recommended)
1. Download the latest `.dmg` (macOS) from [Releases](../../releases)
2. Open the DMG and drag SnipForge to Applications
3. Launch SnipForge

### Build from Source

```bash
# Clone the repository
git clone https://github.com/ArtluxDM/SnipForge.git
cd SnipForge

# Install dependencies
pnpm install

# Development
pnpm dev

# Build for production
pnpm build
```

## Usage

### Global Hotkey
Press `Cmd+Shift+Space` to open SnipForge from anywhere.

### Keyboard Shortcuts
- **Search**: Type to filter commands
- **Navigate**: Arrow keys to select commands
- **Copy**: `C` or `Enter` to copy command to clipboard
- **Copy Template**: `Shift+C` to copy with variables intact
- **New**: `N` to create new command
- **Edit**: `E` to edit selected command
- **Delete**: `Backspace` to delete selected command
- **Clear**: `Escape` to clear search
- **Help**: `H` to open help modal
- **Settings**: `S` to open settings

### Variables
Use `{{variable name}}` syntax in commands for dynamic values:
```bash
ssh {{username}}@{{server}}
docker exec -it {{container name}} bash
```

When copied, you'll be prompted to enter values for each variable.

### Tags
- Add tags when creating/editing commands
- Use autocomplete with `Tab` to complete tag suggestions
- Export specific tags using the export feature

### Export/Import
- Export all commands or filter by specific tags
- Commands are saved in JSON format
- Import previously exported JSON files

## Roadmap

### ✅ Completed Features
- [x] Global hotkey access
- [x] Command CRUD operations (Create, Read, Update, Delete)
- [x] Real-time search filtering
- [x] Variable substitution system
- [x] Tag system with autocomplete
- [x] Keyboard navigation and shortcuts
- [x] Clipboard integration
- [x] Export/Import with tag filtering
- [x] Built-in help system
- [x] SQLite local storage
- [x] Custom title bar and window management

### 🔄 Upcoming Improvements
- [ ] Tag management (edit/delete existing tags)
- [ ] Improve search (add tag filtering, fuzzy search)
- [ ] Improve arrow navigation logic