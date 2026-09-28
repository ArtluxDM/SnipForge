# Release Pipeline

SnipForge releases are produced from Git tags (`v*`) by GitHub Actions.

## Active Notes

### Issue #81: required merge checks and renderer confidence

Plan (before implementation):
- Require the existing three `Verify` jobs on `main` for all users, including admins. Check how this affects direct pushes from `scripts/release.sh`; do not claim CI gates merges until GitHub settings confirm it.
- Add a mounted `App.vue` test with a mocked Electron bridge covering search, plain copy, variable prompt/substitution, and raw-template copy. Use a DOM test environment; never touch the OS clipboard or real user data.
- Build the renderer bundle during reusable PR/main/tag verification, without packaging/installing Electron on every PR. Run main and renderer type checks plus the full test suite locally and record what GitHub actually ran.
- Keep packaged-app launch, native OS clipboard, installers and auth flows out of scope; they still require isolated smoke checks. No blanket coverage threshold as a substitute for behavioral tests.

Implementation and local verification:
- GitHub `main` branch protection now requires the three GitHub Actions checks `Verify (macos-latest)`, `Verify (windows-2022)` and `Verify (ubuntu-latest)` with `strict: true` (up-to-date before merge) and `enforce_admins: true`. Queried the API after updating it; no review-count requirement was added. Required checks protect `main`, not arbitrary release tags; tag verification still gates release builds.
- `tests/app-copy.test.ts` mounts `App.vue` with a fake Electron API, a DOM-only virtual scroller, and the real variable modal. It checks filtered plain copy, no clipboard write until a variable is entered, substitution, and Shift+C raw copy. Vitest uses the Vue SFC plugin and a per-file happy-dom environment; the other tests retain their Node environment.
- Reusable `.github/workflows/verify.yml` now runs `pnpm exec vite build` after the full suite on each platform, checking renderer, main and preload bundles without installer packaging.
- Local Node 24: both type checks passed, full suite passed (13 files, 129 tests), `pnpm exec vite build` passed (chunk-size warning only), `git diff --check` and `actionlint` passed. Cross-platform CI on this change remains to be verified by a PR run; this is not an installer or native clipboard test.
- **Release workflow change:** with required checks enforced for admins, `scripts/release.sh` must not be used to commit/push a version bump directly to protected `main`. Make the version bump in a PR, let the three checks pass, merge it, then tag the merged `main` commit and push *that tag only*. The tag workflow verifies the tagged commit again. Do not push a tag created from an unmerged release branch or disable protection to make the script work.

### Issue #74: verify before building or drafting (finding 4)

Plan (before implementation):
- Make Node 24/pnpm 10 installs reproducible and prepare `better-sqlite3` for the full Vitest suite, then explicitly restore and probe the Electron ABI. Separate native-load failures from assertion failures; run heavy steps sequentially.
- Fix the main TS project's missing type reference, shared-source inclusion, and target; add named independent main and renderer type checks without masking diagnostics. Baseline `tsc -p tsconfig.node.json --noEmit` fails with TS2688, TS6307 and TS2802.
- Reuse the same frozen-install, Node-native setup, both type checks and full test suite for PR/main and **the tag's own commit**. Require successful tag verification before the platform matrix starts; create the draft only after all builds succeed. Keep build jobs credential-free and manual publication.
- Document a safe isolated packaged-app smoke checklist and record only locally executed checks, platform gaps, ABI transitions, commands, and limitations here. Do not touch normal user data or publish a release during verification.

Final decisions and local evidence (2026-09-29, macOS arm64, Node 24.21.0 / ABI 137, pnpm 10.16.0, Electron 44.4.5 / ABI 149):
- `.nvmrc` selects Node 24 and `packageManager` selects pnpm 10.16.0. On a clean checkout run `pnpm install --frozen-lockfile`, `pnpm typecheck:main`, `pnpm typecheck:renderer`, and `pnpm test`. `pnpm test` first ensures the Electron binary is installed (without launching it), then rebuilds `better-sqlite3` for its invoking Node, probes `:memory:`, and runs **all** Vitest files. `pnpm test:db` uses the same setup but targets just the DB file; `pnpm test:watch` assumes `pnpm test` has prepared the Node addon first.
- After Node tests, run `pnpm native:electron` to rebuild for Electron and open an in-memory SQLite DB **inside Electron's bundled Node**; `pnpm dev` invokes this automatically. Packaging via `pnpm build`/electron-builder also rebuilds native app dependencies. Do not infer ABI health from an install message alone; verify with the appropriate runtime. Native build permission is declared in `pnpm-workspace.yaml` (`onlyBuiltDependencies`). Do not run Vitest and Electron packaging concurrently in one checkout.
- Baseline main TS check failed TS2688 (obsolete environment reference), TS6307 (shared imports missing from composite project) and TS2802 (default ES5 target). Fixed reference, shared inclusion, target and strict diagnostics; explicitly narrowed nullable command path and unknown errors and annotated DB return type. Renderer check no longer references the composite main project, avoiding TS6305 when running `--noEmit`; these are independent checks.
- Local commands/results: `pnpm install --frozen-lockfile` exit 0; `pnpm typecheck:main` exit 0; `pnpm typecheck:renderer` exit 0; `pnpm test` twice exit 0 (12 files, 124 tests each); `pnpm exec vite build` exit 0; `pnpm exec electron-builder --dir` exit 0 (unsigned macOS arm64 unpacked app, **not** DMG install); `pnpm native:electron` after tests/build exit 0, Electron ABI 149 and in-memory DB opened. Build emitted a chunk-size warning and no Developer ID signing identity. No release tag, installer build, or publishing performed.
- A true clean checkout initially exposed a *different setup failure*: frozen install exited 0 but Vitest imports of Electron raced its on-demand binary downloader (`File exists` / `Electron failed to install correctly`), leaving 111 tests passed and one suite unable to load. The test launcher now rebuilds/probes Electron **before** starting Vitest workers; this is not an application assertion failure. On a second untouched clean worktree with that fix: `pnpm install --frozen-lockfile` exit 0, **first** `pnpm test` exit 0 (12 files / 124 tests; single serialized Electron binary download), `pnpm native:electron` exit 0 (Electron ABI 149, in-memory DB opened). Both type checks also passed on the first clean checkout. Frozen install warns that `electron-winstaller` scripts are ignored under pnpm build policy; Windows installer behavior remains untested locally.
- The older review's 58 native failures were on an earlier dependency/runtime combination. On this checkout the Node 24 native probe **also succeeded** immediately after an Electron rebuild, so an ABI mismatch could not honestly be reproduced here; ABI numbers alone are not a load-failure test. An isolated, intentionally missing `nativeBinding` produced `MODULE_NOT_FOUND` without running any assertions or altering the installed addon, demonstrating how to distinguish setup failure from test failure. Actual tests passed after Node-native preparation; no application assertion failures observed.
- PR CI on the first push: macOS and Linux verification passed; `windows-latest` failed **during frozen install**, before tests, because node-gyp 11.1.0 cannot detect the runner's Visual Studio 18 (`unknown version undefined`). Pinned both verification and release Windows jobs to `windows-2022` (Visual Studio 17); install and both type checks then passed. Its test step exposed a Windows shell quoting bug: `spawnSync` with `shell: true` truncated Node's `-e` probe at `const`. Native scripts now use a shell only for `pnpm.cmd`, passing Node/Electron executables arguments directly. macOS local suite still passed (124/124) after this change and the Electron ABI 149 probe was restored. PR #75 at commit `2b5c55b` passed all three GitHub verification jobs (macOS, Ubuntu and Windows 2022), including both type checks and the full suite on each runner. No Windows installer was run.
- `actionlint .github/workflows/verify.yml .github/workflows/release.yml` and `git diff --check` passed. Failure-path review: `build` has `needs: verify`; reusable verify checks out `${{ github.sha }}` from the tag event, not `main` or a previous PR; `create-release` has `needs: build` with no bypass. A failed, cancelled, or missing prerequisite skips downstream jobs. No token is persisted by build checkout, top-level permissions are read-only, and only the draft job has `contents: write`. Tag workflow behavior is reviewed statically here; no tag was pushed to exercise it. PR verification ran successfully on GitHub, but it does not validate an actual tag build or draft creation. GitHub branch protection / rulesets must separately require the three PR verify jobs if merges should be blocked.

### Issue #66: single-source release workflow

Plan:
- make `softprops/action-gh-release` the only release publisher
- remove `GH_TOKEN` from platform build jobs so `electron-builder` cannot auto-create draft releases during packaging
- collect macOS, Windows, and Linux build outputs as workflow artifacts
- create/update the GitHub draft release in one dedicated job after all platform builds complete
- keep draft releases as the review gate before public publishing

Final notes:
- `.github/workflows/release.yml` now has platform build jobs with no release credentials and one `create-release` job that owns draft release creation
- platform artifacts are uploaded with `actions/upload-artifact` and then downloaded into the release job before `softprops/action-gh-release` attaches them
- this removes the previous race where `electron-builder` and the release action could both create/update draft releases, which produced `untagged-*` draft URLs

### Issue #65: Node 24-compatible release actions

Plan:
- run the release workflow with Node 24 so release builds exercise the upcoming GitHub runner default
- opt JavaScript actions into the Node 24 runtime during the transition window
- update third-party release/upload actions to current major versions where safe

Final notes:
- release CI now sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`, uses Node 24 for package/build steps, and updates `pnpm/action-setup` plus release artifact actions to current major versions
- `actions/checkout` and `actions/setup-node` stay on v4 with the Node 24 runtime opt-in until the workflow is validated against the next tag build

## Current Release Flow

1. Before tagging, PR and `main` runs of `.github/workflows/verify.yml` run frozen installs, independent main and renderer type checks, the full Node-native and DOM test suite, and a Vite bundle build on macOS, Windows, and Linux. Since issue #81, GitHub branch protection requires all three `Verify` checks on `main`, including for admins, with up-to-date branches required. Check these settings if the job names change; workflow triggers alone do **not** block merges.
2. Prepare version bumps through a reviewed PR rather than running `scripts/release.sh`: it commits, tags, and pushes the branch plus **all** local tags without checks or confirmation, and direct pushes to protected `main` can fail. After the version-bump PR passes checks and merges, tag the exact merged `main` commit and push only the intended tag. The tag push starts `.github/workflows/release.yml`; its reusable `verify` job checks out **`${{ github.sha }}`** (the tag's commit) and runs the same checks. This does not trust a prior PR result; a tag can point to an arbitrary commit.
3. **Only if every tag verification matrix job succeeds**, platform builds run `pnpm build` on that commit on macOS, Windows, and Linux without release credentials. A failed/cancelled verification blocks all builds; a failed/cancelled build blocks draft creation. No `always()` bypasses either dependency.
4. Each build uploads only packaged release artifacts (`.dmg`, `.exe`, `.AppImage`, blockmaps, and update YAML files) to the workflow run.
5. A single `create-release` job (the only job with `contents: write` / `GITHUB_TOKEN` for release publishing) downloads those artifacts and creates one draft GitHub release for the tag.
6. A human performs the packaged-app smoke pass and reviews the draft before publishing. CI and an untested tag do not automatically publish. **Do not use the existing `.claude/agents/release-manager.md` for publication yet**: it auto-promotes the draft after CI and launches/kills the app without verified user-data isolation. Issue #79 tracks aligning it with this gate.

## Pre-publish packaged-app smoke record (repeat on each release candidate)

For each platform record tag/commit, version, OS/arch, installer asset, fresh or upgrade scenario, actual `app.getPath('userData')`, isolated test-data directory, and PASS/FAIL/NOT RUN for every item. Use a disposable OS account or clean VM for installers and unsigned-app prompts. **Before launching the app**, probe `app.getPath('userData')` with the same Electron app name/environment or instrument a disposable copy; confirm the resolved path is inside the disposable account, not the normal profile. Do not rely on `HOME` alone on macOS. Back up any upgrade fixture, never use real credentials or the normal `snipforge.db`. If isolation cannot be demonstrated, skip the launch rather than risk production data.

- [ ] Fresh installed launch (macOS DMG, Windows NSIS, Linux AppImage independently): installer/open and close, tray/global shortcut, security warning and library initialization; record installer and OS warnings. On Linux mark the AppImage executable, launch it on a supported Linux VM with needed desktop/FUSE libraries and verify clean exit; a build artifact alone is not a launch test.
- [ ] In a fresh synthetic library, create/search/copy a plain command and a variable command (`{{name}}`); verify clipboard text, variable prompt and no execution. Close/restart and confirm both persisted and searchable.
- [ ] Upgrade from a supported previous version with a backed-up **synthetic** DB and local library; verify migrations, existing commands/search, auth-state behavior using dummy/no tokens and no loss of files. Verify editing rich text, local sync after external edits and invalid JSON warning, safe external link opening and ZIP export. Do not attribute the #2/#3 behaviors to this release-gating issue.
- [ ] Before publication, check intended DMG/NSIS `.exe`/AppImage and metadata assets in the single draft, platform smoke results, and the absence of unintended formats/automatic publication. Any failed platform requires investigation before manual publish.

Local smoke record for issue #74: macOS arm64 unpacked directory **packaging only** and in-memory Electron native probe passed. An isolated `HOME=/tmp/snipforge-smoke-home-…` probe with Electron named `SnipForge` returned **`/Users/criswork/Library/Application Support/SnipForge`** from `app.getPath('userData')`, outside isolation. Therefore **no GUI packaged-app launch was attempted** and the normal database was not opened. Fresh launch, clipboard, restart, upgrade, macOS DMG install, Windows NSIS install, and Linux AppImage launch are **NOT RUN**; perform them in disposable OS accounts/VMs before publishing. No installer or cross-platform success is implied by the build or tests.

## Design Decisions

| Decision | Why |
|---|---|
| GitHub Actions owns publishing | Avoids `electron-builder` and release actions racing to create different draft releases. |
| Build jobs do not receive `GH_TOKEN` | Prevents accidental `electron-builder` auto-publish on tag builds. |
| Tag verification is a dependency of builds | PR checks alone cannot gate arbitrary tag pushes; test the exact tag commit first. |
| Release job runs after all platforms build | One tag should produce one release object with all platform artifacts attached together. |
| Draft releases remain the default | Keeps manual review before users receive the update. |
| Node 24 is used in CI | Catches upcoming runner/runtime compatibility issues before GitHub forces the migration. |

## Key Files

| File | Role |
|---|---|
| `.github/workflows/release.yml` | Tag verification dependency, CI build matrix and single release-publisher job |
| `.github/workflows/verify.yml` | PR/main verification and reusable tag-commit checks |
| `scripts/release.sh` | Local version bump, tag, and push helper |
| `electron-builder.json5` | Platform package/artifact naming config |
| `AGENTS.md` | Human/agent release instructions |
