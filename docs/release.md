# Release Pipeline

SnipForge releases are produced from Git tags (`v*`) by GitHub Actions.

## v2.13.2 beta release (issue [#85](https://github.com/ArtluxDM/SnipForge/issues/85))

Goal: make a beta release from the merged `main` tip after PR #84, including the palette search fix and the preceding hardening work. Use an explicit beta version so testers can identify the build; beta releases are not shown by the stable-only in-app update checker.

Plan:
- [x] Bump `package.json` to `2.13.2-beta.1` in a release PR based on merged `main`; run local type checks, tests, and a Vite bundle build.
- [x] Merge only after the three required platform checks pass, then tag the resulting `main` commit and push only `v2.13.2-beta.1`.
- [ ] Confirm tag verification, platform builds, and one draft containing macOS DMG, Windows EXE, Linux AppImage, and update metadata. Mark it as a GitHub prerelease.
- [ ] Complete the isolated packaged-app smoke record below and review the draft before publication.

Release source: PR #84 merged as `a6e4e6e`; previous prerelease is `v2.13.1`.
Local verification: Node 24.21.0 and pnpm 10.16.0; frozen install, main and renderer type checks, all 130 tests across 13 files, and `pnpm exec vite build` passed. Vite emitted its existing large-chunk warning. Installer and packaged-app smoke checks remain pending.

Beta.1 tag attempt: `v2.13.2-beta.1` points to merged `main` commit `51136b6`. All three tag verification jobs passed, but all three packaging jobs failed: electron-builder inferred publishing from the tag and exited because the build jobs intentionally had no `GH_TOKEN`. The draft job was skipped. Keep this failed tag as a record; do not move it.

Beta.2 recovery plan:
- [x] Bump the package version to `2.13.2-beta.2` and make `pnpm build` pass `--publish never` to electron-builder so tagged packaging cannot attempt publication.
- [x] Verify locally with type checks, the full suite, and a macOS DMG build under a simulated tag environment with no GitHub token.
- [ ] Merge the recovery PR after required checks, tag the exact new `main` commit as `v2.13.2-beta.2`, and check the full release workflow and draft assets.
- [ ] Mark the draft prerelease and perform the isolated packaged-app smoke and draft review before publication.

Beta.2 local verification: Node 24.21.0, pnpm 10.16.0, frozen install, main and renderer type checks, and all 130 tests passed. `GITHUB_REF=refs/tags/v2.13.2-beta.2` with release tokens unset and `pnpm build` completed a macOS arm64 DMG plus blockmap; electron-builder did not attempt to publish. The local DMG is unsigned. No packaged app was launched against the normal profile.

Beta.2 tag attempt: `v2.13.2-beta.2` points to merged `main` commit `e9d888c`. All three tag verification and packaging jobs passed. The draft job failed because `fail_on_unmatched_files: true` treated optional `.AppImage.blockmap` (and then other optional formats) as required. The artifact upload glob also captured unpacked Windows executables and internal YAML files. No draft release was created. Keep the tag unchanged.

Beta.3 recovery plan:
- [x] Bump to `2.13.2-beta.3`; restrict uploaded and attached files to the configured DMG, NSIS EXE, AppImage, their produced blockmaps, and `latest*.yml` update metadata.
- [x] Keep unmatched-file validation for every expected format and check the workflow globs against the beta.2 artifact listing before committing.
- [x] Pass local checks and required PR checks, merge, tag only the new `main` commit, and verify the workflow creates one clean draft marked as a prerelease.
- [ ] Perform isolated packaged-app smoke and draft review before publication.

Beta.3 local verification: the six workflow patterns matched the eight intended files in the beta.2 draft-job listing and excluded five internal/unpacked files. `actionlint`, both type checks, the full suite (13 files, 130 tests), `pnpm exec vite build`, and `git diff --check` passed. The existing Vite large-chunk warning remains.

Beta.3 draft record (2026-09-29): PR #88 passed all three required checks and merged as `477b6a7`. Tag `v2.13.2-beta.3` points to that commit. [Tag workflow run](https://github.com/ArtluxDM/SnipForge/actions/runs/36504050007) passed all three verification jobs, all three platform packaging jobs, and the single draft creation job. The draft was marked as a GitHub prerelease and had eight intended assets: macOS DMG and blockmap, Windows NSIS EXE and blockmap, Linux AppImage, and `latest-mac.yml`, `latest.yml`, and `latest-linux.yml`. No unpacked executable or internal YAML file was attached. The three update YAML files each identify `2.13.2-beta.3`, the matching installer filename, and its uploaded size. Release notes identify this as a beta and state the installed-app smoke limitation.

Beta.3 pre-publish smoke record: macOS arm64 DMG fresh install **NOT RUN**; Windows NSIS EXE fresh install **NOT RUN**; Linux AppImage fresh launch **NOT RUN**; synthetic upgrade, command persistence/search/copy, native clipboard, global hotkey, and auth-state checks **NOT RUN** on packaged installers. A disposable OS account or VM and verified `app.getPath('userData')` isolation were not available for this candidate, so no packaged app was launched against the normal profile. Installer warnings, OS/arch behavior beyond CI packaging, and upgrade results are unknown. These checks were part of the normal manual publication gate.

Publication: the maintainer reported manual testing and explicitly authorized publishing the beta without the isolated packaged-app smoke record above. [v2.13.2-beta.3](https://github.com/ArtluxDM/SnipForge/releases/tag/v2.13.2-beta.3) was published as a **prerelease** on 2026-09-29 with the same eight assets. The missing cross-platform installed-app results remain an acknowledged limitation; release notes state that they were not recorded.

## Active Notes

### Issue #79: release-manager safety and publication gate

Plan (before instruction edits):
- Replace the agent's direct-main release path with a version PR, the three required Verify checks, merge, and a tag of the exact merged main SHA; push only that tag and never bypass protection or use the legacy script.
- Require verified disposable userData before any GUI launch, exact-process cleanup, and preservation of existing output; otherwise record GUI smoke as NOT RUN. CI alone cannot establish installer behavior.
- Leave draft creation to CI, stop on failed CI or a missing draft, and require recorded platform smoke and explicit human approval before manual publication. Never automatically change release state or mutate previous releases.
- Align agent availability and release guidance, then record a static dry-run of success and each specified failure path without executing a release or accessing app data.

Final notes and static walkthrough (2026-11-01; instruction review only):
- [x] Replaced direct-main/all-tags and automatic promotion instructions with a protected-main version PR, exact merged-SHA tag, CI-owned draft, verified isolation, and a manual human publication gate. Existing output requires approval before deletion or overwrite; only the exact process started by an isolated check may be stopped.
- [x] Walked through a hypothetical `v1.2.3`: the version PR passes all three Verify checks and merges at SHA A; the tag targets A, only that tag is pushed, tag CI passes, and its draft contains the intended assets. After each platform's installer smoke is recorded as PASS, the agent presents the evidence for explicit human approval; a human publishes manually. No actual release actions were performed.
- [x] Failed/cancelled or missing tag CI: report the run state and failure logs if available; stop, with no fallback draft or promotion. Green CI but no draft or incomplete assets: report and stop, with no fallback creation.
- [x] Isolation probe resolves outside the disposable account, or cannot establish the path: no GUI launch; record affected smoke as NOT RUN and block publication. A macOS HOME override alone does not pass. Pre-existing output with no approval and no safe separate output: stop the build and preserve it.
- [x] All CI and smoke pass but human approval is absent: present the evidence and leave the draft unpublished. Prior release state and latest/prerelease state remain untouched. These are prose scenario walkthroughs, not a live release, CI run, GUI test, or verification of platform installers; no tag, push, publication, app launch, or app-data access was performed for them.

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
- Local Node 24: frozen install, both type checks, full suite (13 files, 129 tests), `pnpm exec vite build` (chunk-size warning only), `git diff --check` and `actionlint` passed. PR #82 at `6439f3a` passed all three GitHub Verify jobs (macOS, Ubuntu and Windows 2022), including the new bundle-build step. This is not an installer or native clipboard test.
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

Plan (before implementation):
- Inventory every action in the release workflow and reusable verification against upstream manifests; upgrade runtime references to supported Node 24 releases while preserving pnpm, Node, matrix and required check names.
- Run actionlint and diff checks, then record the three PR Verify results separately from tag packaging evidence.
- Document the next tag-run checks for all platform packages and Node 20 warnings. Do not create a tag or release for this issue; leave unobserved results explicitly NOT RUN.

Runtime inventory (upstream manifests checked 2026-11-01):

| Use | Action | Declared runtime |
|---|---|---|
| Release build and reusable Verify checkout | [actions/checkout@v6](https://github.com/actions/checkout/blob/v6/action.yml) | Node 24 |
| Release build and reusable Verify pnpm installer | [pnpm/action-setup@v6](https://github.com/pnpm/action-setup/blob/v6/action.yml) | Node 24 |
| Release build and reusable Verify Node setup | [actions/setup-node@v6](https://github.com/actions/setup-node/blob/v6/action.yml) | Node 24 |
| Release build artifact upload | [actions/upload-artifact@v6](https://github.com/actions/upload-artifact/blob/v6/action.yml) | Node 24 |
| Draft job artifact download | [actions/download-artifact@v7](https://github.com/actions/download-artifact/blob/v7/action.yml) | Node 24 |
| Draft job release action | [softprops/action-gh-release@v3](https://github.com/softprops/action-gh-release/blob/v3/action.yml) | Node 24 |

The release `verify` job calls the local reusable workflow, not another JavaScript action. The artifact upload/download inputs used here remain present in their manifests. The previous checkout, setup-node, pnpm setup, upload and download v4 manifests and release v2 manifest declared Node 20; upstream identifies [release v2 as unsupported](https://github.com/softprops/action-gh-release#readme). These major refs deliberately follow upstream maintenance releases. Node 24 from `.nvmrc`, pnpm 10.16.0 and the Windows 2022 pin remain unchanged. The existing `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` flag remains as a transition safeguard; it is no longer needed for these declared runtimes, and GitHub [retired Node 20 on hosted runners](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/). Node 24 actions require sufficiently recent runners (checkout requires [runner 2.327.1 or later](https://github.com/actions/checkout#checkout-v5)); these workflows use GitHub-hosted runners.

Validation and remaining evidence:
- Local `actionlint .github/workflows/release.yml .github/workflows/verify.yml` and `git diff --check`: PASS.
- PR Verify on macOS, Windows 2022 and Ubuntu: see the PR checks for the exact head; these run type checks, tests and Vite bundling, not installer packaging.
- Next authorized release: inspect the tag run for its exact commit, successful tag Verify and all three Build jobs; inspect each platform's uploaded package and the draft's expected assets. Inspect annotations and logs for Node 20 action runtime warnings in Verify, Build and Create draft release jobs, including post steps. Record run URL, commit, per-platform results and warning findings before the existing isolated smoke and manual publication gate.
- Tag-run package builds, artifact transfer, draft creation and absence of Node 20 warnings: **NOT RUN** for this change. The original criteria requiring all-platform package builds and warning-free release runs remain operationally pending; PR Verify cannot establish them. Keep issue #65 open until that evidence exists.

## Current Release Flow

1. Before tagging, PR and `main` runs of `.github/workflows/verify.yml` run frozen installs, independent main and renderer type checks, the full Node-native and DOM test suite, and a Vite bundle build on macOS, Windows, and Linux. Since issue #81, GitHub branch protection requires all three `Verify` checks on `main`, including for admins, with up-to-date branches required. Check these settings if the job names change; workflow triggers alone do **not** block merges.
2. Prepare version bumps through a reviewed PR rather than running `scripts/release.sh`: it commits, tags, and pushes the branch plus **all** local tags without checks or confirmation, and direct pushes to protected `main` can fail. After the version-bump PR passes checks and merges, tag the exact merged `main` commit and push only the intended tag. The tag push starts `.github/workflows/release.yml`; its reusable `verify` job checks out **`${{ github.sha }}`** (the tag's commit) and runs the same checks. This does not trust a prior PR result; a tag can point to an arbitrary commit.
3. **Only if every tag verification matrix job succeeds**, platform builds run `pnpm build` on that commit on macOS, Windows, and Linux without release credentials. A failed/cancelled verification blocks all builds; a failed/cancelled build blocks draft creation. No `always()` bypasses either dependency.
4. Each build uploads only packaged release artifacts (`.dmg`, `.exe`, `.AppImage`, blockmaps, and update YAML files) to the workflow run.
5. A single `create-release` job (the only job with `contents: write` / `GITHUB_TOKEN` for release publishing) downloads those artifacts and creates one draft GitHub release for the tag.
6. A human performs the packaged-app smoke pass and reviews the draft before publishing. CI and an untested tag do not automatically publish. The `.claude/agents/release-manager.md` instructions preserve this gate; the agent is not automatically available in every coding harness. Publication remains a manual human action after platform smoke evidence and explicit approval.

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
