# SnipForge

A desktop application for saving, searching, and managing command snippets with global hotkey access.

## Features

- **Multiple Editor Types**: Plain Text, Rich Text (WYSIWYG), Markdown, and Code editors
- **Syntax Highlighting**: Support for 12+ programming languages (JavaScript, TypeScript, Python, Go, Rust, Java, HTML, CSS, YAML, JSON, SQL, Bash)
- **Rich Text Editing**: WYSIWYG editor with formatting, lists, task lists, links, and images
- **Markdown Support**: Markdown editor with toolbar and syntax highlighting
- **Real-time Search**: Search by title and body across all snippets
- **Global Hotkey**: Quick access with `Cmd+Shift+Space` (macOS) or `Ctrl+Shift+Space` (Windows/Linux)
- **Clipboard Integration**: One-click copy with variable substitution
- **Tag System**: Organize snippets with tags and autocomplete
- **Variable Substitution**: Dynamic values using `{{variable name}}` syntax
- **Keyboard Navigation**: Full keyboard shortcuts for power users
- **Export/Import**: JSON format with tag filtering
- **Built-in Help**: Comprehensive help system with keyboard shortcuts

## Installation

### From Release (Recommended)
1. Download the latest `.dmg` (macOS) from [Releases](../../releases)
2. Open the DMG and drag SnipForge to Applications
3. Launch SnipForge

**macOS Security Note**: Since this app isn't code signed, macOS will show a "damaged" warning. To run it:
- **Method 1**: Right-click the app → "Open" → "Open" (bypasses Gatekeeper)
- **Method 2**: Run this command in Terminal:
  ```bash
  xattr -cr /Applications/SnipForge.app
  ```

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
- [x] Multiple editor types (Plain Text, Rich Text, Markdown, Code)
- [x] Syntax highlighting for 12+ programming languages
- [x] WYSIWYG rich text editor with custom checkboxes
- [x] Markdown editor with toolbar
- [x] Global hotkey access
- [x] Command CRUD operations (Create, Read, Update, Delete)
- [x] Real-time search filtering
- [x] Variable substitution system
- [x] Tag system with autocomplete
- [x] Keyboard navigation and shortcuts
- [x] Clipboard integration
- [x] Export/Import with tag filtering
- [x] Built-in help system with markdown rendering
- [x] SQLite local storage
- [x] Custom title bar and window management
- [x] System tray integration

### 🔄 Upcoming Improvements
- [ ] Windows and Linux builds via GitHub Actions
- [ ] Tag management (edit/delete existing tags)
- [ ] Search improvements (tag filtering, fuzzy search)
- [ ] Command history and favorites
- [ ] Cloud sync (optional)
- [ ] Themes and customization