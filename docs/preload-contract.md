# Published downloads and renderer bridge (finding 5, issue #76)

## For users

Download only packages attached to the published GitHub release. As checked on 2026-09-28, the newest published tag `v2.13.1` has `SnipForge-Mac-2.13.1-Installer.dmg`, `SnipForge-Windows-2.13.1-Setup.exe`, and `SnipForge-Linux-2.13.1.AppImage` (plus update metadata/blockmaps); no deb/rpm packages. GitHub `/releases/latest` instead resolves to stable `v2.12.0` and has the same three installer formats. The README should list formats, not promise a prerelease via `/latest`. macOS is unsigned as noted in README.

## Developer plan (before implementation)

1. Correct README Linux row to AppImage only. Published release assets above are the evidence; workflow artifact globs are not build targets. Packaging other Linux formats is out of scope.
2. Define a type-only `ElectronAPI` in `shared/electron-api.ts`, using existing `shared/types.ts` domain types and `unknown` for dynamic settings. Use a single ambient `Window.electronAPI` declaration in renderer typings; remove the preload's duplicate declaration and the unexposed `Window.ipcRenderer`. Check the actual exposed object with `satisfies ElectronAPI` in preload. Preserve every named method, IPC channel and callback cleanup; no raw IPC exposed.
3. Remove API-erasing casts in settings/auth/library/update, external links and window controls. Guard optional result fields (especially library picker and device flow) rather than assuming success populates them. Leave unrelated UI, layout and IPC handler implementation alone. TypeScript enforces compile-time shape only; main-process sender/URL checks remain runtime authorization.
4. Extend preload tests for bridge shape and event cleanup / representative settings, updates, external link and library calls. Run `pnpm typecheck:main`, `pnpm typecheck:renderer`, `pnpm test`, and targeted smoke checks where safely possible. For packaged UI, use disposable OS account/VM and verified isolated userData path per `docs/release.md`; never open normal user data to satisfy a smoke checklist.

## Design decisions

| Choice | Reason |
|---|---|
| One type-only shared interface, one Window declaration | Preload and Vue compile against the same public shape without Electron runtime imports in renderer. |
| No large-file extraction in this pass unless a behavior change demands it | This is a contract/documentation change, not a rework of settings or library behavior. Focused bridge regression tests guard the boundary. |
| No new channels or expanded privileges | Typing is not IPC authorization. Runtime validation remains in main. |

## Key files

`shared/electron-api.ts` — public type; `electron/preload/index.ts` — bridge implementation; `src/vite-env.d.ts` — renderer ambient declaration; `tests/preload.test.ts` — bridge regression tests; `README.md` — published format guidance.

## Deliverables / verification

- [x] README reflects published formats: `gh release view v2.12.0 --json url,isPrerelease,assets` and the same command for `v2.13.1` confirmed DMG, Setup EXE and AppImage only. Stable `/releases/latest` points to v2.12.0; v2.13.1 is a prerelease. Filenames do not establish every supported CPU architecture; no deb/rpm is advertised.
- [x] `shared/electron-api.ts` is the type-only public contract; preload's named bridge `satisfies ElectronAPI`, and `src/vite-env.d.ts` is the only Window declaration. The unexposed `Window.ipcRenderer` declaration is gone. No new methods/channels or raw invoke were added. Update and auto-sync callbacks now remove only their own listeners.
- [x] API-erasing casts in the affected settings/auth/library/update, external-link and window-control calls are gone; missing device-flow and library-picker fields are handled. Other behavior and large modules remain in place: no extraction was needed for this contract-only change.
- [x] Checks and limitations recorded below.

## Final verification (2026-09-29, macOS arm64)

Commands were run **one at a time** on the existing branch, Node v22.23.2 / pnpm 10.16.0, 8 GiB RAM. Exit statuses refer to this session:

| Command | Exit | Evidence |
|---|---:|---|
| `gh release view v2.12.0 --json url,isPrerelease,assets --jq '{url,isPrerelease,assets:[.assets[].name]}'` | 0 | Stable: `SnipForge-Mac-2.12.0-Installer.dmg`, `SnipForge-Windows-2.12.0-Setup.exe`, `SnipForge-Linux-2.12.0.AppImage` plus metadata/blockmaps. |
| `gh release view v2.13.1 --json url,isPrerelease,assets --jq '{url,isPrerelease,assets:[.assets[].name]}'` | 0 | Prerelease: same three installer formats at 2.13.1, plus metadata/blockmaps. |
| `pnpm typecheck:main` | 0 | Shared type and preload compile. |
| `pnpm typecheck:renderer` | 0 | Vue consumers compile against the same interface. |
| `pnpm test` | 0 | Script rebuilt/probed Node `better-sqlite3` (ABI **127**); 12 files / 126 tests passed, including named preload methods and listener cleanup. |
| `pnpm exec vite build` | 0 | Renderer, main and preload built; Vite warned about a >500 kB chunk. |
| `env -u GH_TOKEN -u GITHUB_TOKEN pnpm exec electron-builder --dir --config.directories.output=/tmp/snipforge-finding5-package.sXKNeK` | 0 | Created unsigned macOS arm64 unpacked app with `app.asar` in a **new** temp output directory, not an installer. Skipped signing (no Developer ID identity). |
| `pnpm native:electron` | 0 | Rebuilt and opened an in-memory DB under Electron 44.4.5, native ABI **149**. Do not infer Electron loading from the Node test probe or from builder's install log. |
| `git diff --check` | 0 | No whitespace errors. |

The prior session's `electron-builder` log reported native dependency installation completed, followed by `pnpm native:electron` reporting ABI 149. Its packaging command's **final exit status was not recorded**. The subsequent `FATAL ERROR: Reached heap limit` at approximately 2 GB occurred while refreshing the **code index**, not as a demonstrated packaging failure. No index rebuild was attempted here; targeted `rg`, file inspection, TypeScript checks and tests covered the changed boundary without another memory-heavy index refresh. The independent unpacked package command above exited 0; this does not retrospectively establish the prior packaging command's exit status.

Packaged GUI smoke (update banner, settings, external links, library picker), DMG install, Windows NSIS and Linux AppImage launch are **NOT RUN**. No disposable OS account/VM with a verified isolated Electron `userData` directory was used; per `docs/release.md`, launching in the normal macOS profile risks touching the real database. The unpacked app's existence and bridge unit tests are not a substitute for those flows. Cross-platform installer verification remains a pre-publish task, not a claim of this PR. TypeScript verifies the bridge's compile-time shape, not IPC handler authorization or runtime response payloads.
