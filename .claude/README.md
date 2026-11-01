# Claude Agents for SnipForge

Specialized agents for recurring tasks. Keep them narrow and well-defined.

## Available Agents

### Release Manager

Prepares a version PR and monitors the CI-created draft. Publication remains a manual human action after platform smoke evidence and explicit approval. This Claude agent definition is not automatically available in every coding harness.

**Invoke, where supported, by asking:**
```
"Use the release manager agent to prepare a release"
"Use release-manager to propose a patch version"
"Check release status using the release manager"
```

It previews the version and notes, uses a protected-main version PR, and tags the exact merged SHA only after authorization. It requires verified disposable userData for GUI smoke, preserves existing build output, and stops if CI fails or its draft is missing. See `docs/release.md` for the platform smoke record and publication gate.

**Config:** `.claude/agents/release-manager.md`

## Context Management

For large features, use separate issues/sessions for backend and frontend. The main agent handles all code (both backend and frontend) and has direct access to Chrome DevTools MCP for screenshots and visual verification. Design skills (`frontend-design`, `ui-ux-pro-max`) are available globally.

**Planned agents:**
- **Technical Writer** — reviews feature docs for accuracy against the codebase
- **PR Reviewer** — reviews PRs before merge, checks for consistency and regressions
