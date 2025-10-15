## Keyboard Shortcuts

## Navigation

- **↑↓** - Navigate through commands
- **Tab** - Navigate between focusable elements (searchbar → filter → settings → help → commands)
- **Enter** (in searchbar) - Select first command
- **⌘F** (Mac) / **Ctrl+F** (Windows/Linux) - Focus searchbar from anywhere
- **Escape** - Cancel/deselect/close (priority: modals → dropdown → selection → blur → clear search)

## Actions

- **C** - Copy selected command (with variable substitution)
- **Shift+C** - Copy command template (with variables intact)
- **N** - Add new command
- **E** - Edit selected command
- **Backspace** - Delete selected command

## Search

SnipForge supports advanced search with filters to help you quickly find the right command.

### Basic Search
Simply type in the search box to search across command titles and bodies.

### Filter Syntax
Use filters to search specific parts of commands:

- **tag:linux** - Find commands with the "linux" tag
- **title:docker** - Search only in command titles for "docker"
- **body:ssh** - Search only in command bodies for "ssh"

### Multiple Filters
Combine filters using the pipe `|` separator:

**tag:linux | body:ssh** - Commands tagged "linux" AND containing "ssh" in the body

### Multiple Tags
Use commas within tag filters:

**tag:linux,docker** - Commands with BOTH "linux" AND "docker" tags

### Complex Examples
- **tag:git | title:clone** - Git commands with "clone" in the title
- **tag:linux,server | body:systemctl** - Linux server commands using systemctl
- **title:backup | body:rsync** - Backup commands using rsync

### Filter Dropdown
Click the filter icon 🔽 next to the search box to quickly add filter types.

## Autocomplete

- **Tab** - Accept inline tag suggestion (works within tag: filters)
- **Escape** - Dismiss tag suggestion

## Global

- **⌘⇧Space** (Mac) / **Ctrl⇧Space** (Windows/Linux) - Show/hide SnipForge

## Export & Import

### Export Commands
Export your commands to a JSON file for backup or sharing.

- **Filter by tags**: Use the text input to specify which commands to export
- **Tag dropdown**: Click the filter icon to select tags from a visual list
- **Command counter**: Shows how many commands will be exported `(23)`
- **Export all**: Leave filter empty to export all commands

### Import Commands
Import commands from a previously exported JSON file.

- Validates file format before importing
- Shows success/failure count after import
- Duplicate commands are added as new entries

## Variables

Use `{{variable name}}` syntax in commands for dynamic substitution.

**Example:** `docker exec -it {{container}} {{command}}`

When you copy a command with variables, you'll be prompted to enter values for each variable before the final command is copied to your clipboard.