# Dependency Security Maintenance

## User-facing overview

SnipForge depends on an Electron runtime plus renderer/main-process libraries that handle local data, rich text, ZIP export, Markdown rendering, and SQLite. This document tracks the dependency-security triage for review finding 1 so updates are made deliberately instead of blindly chasing an audit count.

## GitHub issue

- Issue: [#68 — Triage and update security-sensitive dependencies](https://github.com/ArtluxDM/SnipForge/issues/68)
- Source review: `review-2026-09-28-findings.md` finding 1 / `temp-1-security-dependencies.md`

## Plan before code changes

1. Establish the locked-version baseline with Node, pnpm, platform, git SHA, Electron version, and `pnpm audit --prod --json` saved to local scratch.
2. Inventory every current production advisory by package, resolved version, dependency path, affected operation, patched version, and SnipForge reachability.
3. Review Electron separately from `pnpm audit --prod` because Electron is a devDependency that becomes the bundled runtime.
4. Apply supported dependency updates in small batches:
   - direct production libraries first (`adm-zip`, `dompurify`);
   - TipTap family as one compatible set;
   - build/runtime packages that affect production advisories (`vue`/PostCSS/nanoid path) if they remain in the production audit;
   - Electron only after checking the major-version breaking changes and rebuilding native modules.
5. Rebuild `better-sqlite3` for the active Node/Electron ABI before verification.
6. Rerun audit and verification after updates. Record exact commands, failures, platform gaps, and any time-limited exceptions here.

## Current locked-version baseline — before remediation

Captured 2026-09-28 on macOS arm64.

| Item | Value |
| --- | --- |
| Git SHA | `a1862f7e700aa2037d596b0c5b917e2b1c6364a3` |
| Node | `v22.23.2` |
| pnpm | `10.16.0` |
| Platform | `Darwin MacBookAir 25.5.0 arm64` |
| Electron declared / locked | `^29.1.1` / `29.4.6` |
| Audit command | `pnpm audit --prod --json > temp-audit/prod-before.json` |
| Audit result | 35 advisories: 0 critical, 11 high, 20 moderate, 4 low across 177 production dependencies |

## Advisory inventory — before remediation

| Package | Locked | Severity count | Path / source | Affected operation | SnipForge reachability before update | Planned action |
| --- | ---: | --- | --- | --- | --- | --- |
| `adm-zip` | `0.5.16` | 2 high, 1 moderate | direct dependency | Crafted ZIP parsing/extraction memory allocation and extraction through symlinks | Search found only ZIP creation in `electron/main/local-library.ts` (`new AdmZip()`, `addLocalFolder`, `writeZip`). No archive parsing/extraction call was found, so the reported vulnerable operations appear unreachable in current app flows. | Update to patched `0.6.1` anyway; direct dependency with compatible ZIP creation API. |
| `@tiptap/core` | `3.14.0` | 1 high, 1 moderate | direct TipTap family via rich text editor | Markdown attribute parsing ReDoS; `mergeAttributes()` `__proto__` handling | Rich-text content is user/import/library controlled and passed through TipTap (`RichTextEditor.vue` `content`, `setContent`, paste handling). The Markdown parser advisory is less clearly reachable because SnipForge uses CodeMirror + `marked` for Markdown, not TipTap Markdown parsing directly. | Update all direct TipTap packages together to a compatible patched 3.x release (`>=3.30.5`). |
| `markdown-it` / `linkify-it` | `14.1.0` / `5.0.0` | 2 moderate / 2 high | transitive via `@tiptap/pm > prosemirror-markdown` | ReDoS/quadratic link parsing | App code does not call `prosemirror-markdown` directly. Reachability depends on TipTap internals/extensions; treat as transitive rich-text risk. | Resolved through TipTap family update if possible; otherwise document exception. |
| `dompurify` | `3.3.1` | 15 total (moderate/low) | direct dependency | Sanitization bypasses involving custom elements, DOM output modes, `IN_PLACE`, hooks/config mutation, Trusted Types | SnipForge directly sanitizes rendered command content and Markdown modal/help output (`App.vue`, `DescriptionModal.vue`, `HelpModal.vue`). Current use appears string-in/string-out without `IN_PLACE`, `RETURN_DOM`, `SAFE_FOR_TEMPLATES`, custom-element predicates, or global `setConfig()`, but sanitizer is on an attacker-controlled content path. | Update to patched `3.4.16`. |
| `postcss` / `nanoid` | `8.5.6` / `3.3.11` | 4 high, 3 moderate | `@tiptap/vue-3 > vue > @vue/compiler-sfc > postcss > nanoid` in prod audit | CSS source-map file disclosure; Nano ID pathological generator sizes | This path is surprising in a runtime production audit. `@vue/compiler-sfc` is not expected to be used by the packaged app at runtime, but it is currently pulled into the production dependency graph. | Update Vue/Vite-related packages if needed; verify whether final prod audit clears. |
| `tar-fs` | `2.1.3` | 1 high | `better-sqlite3 > prebuild-install > tar-fs` | Tar extraction symlink validation bypass during native prebuild install | Runtime app does not extract tarballs. This is install-time/native-prebuild tooling inside a production dependency tree. | Prefer supported package update (`better-sqlite3`/transitive) if available; otherwise document time-limited install-time exception. |

## Electron runtime review plan

Current runtime is Electron `29.4.6`, while npm `latest` is `44.4.5`. `pnpm audit --prod` does not include this bundled runtime risk. The upgrade will be evaluated in supported major hops rather than a blind latest-major jump. Breaking-change notes to check before selecting the target include Electron 30–44 changes around Chromium/Node versions, native modules, permissions, sandbox/window behavior, protocol/navigation defaults, packaging/notarization, and deprecated APIs.

## Verification plan

Minimum local verification for this PR:

- `pnpm install` / lockfile refresh
- `pnpm exec electron-builder install-app-deps` or equivalent native-module rebuild for Electron
- `pnpm test:db`
- `pnpm test`
- `pnpm exec vue-tsc --noEmit`
- `pnpm exec tsc --noEmit -p tsconfig.node.json` (record known infra failures if still present)
- `pnpm build`
- start dev app and exercise create/search/copy, rich-text paste/open, ZIP export, restart with existing DB
- packaged macOS launch smoke test from the generated artifact

Cross-platform installer smoke tests on Windows/Linux require separate machines/runners. If unavailable, record them as unverified; do not mark them passed.

## Final results

Completed on 2026-09-28 for issue #68.

### Dependency update batches

| Batch | Changes | Result |
| --- | --- | --- |
| Direct production advisories | `adm-zip` `0.5.16` → `0.6.1`; `dompurify` `3.3.1` → `3.4.16`; removed deprecated `@types/dompurify` stub | Cleared direct ZIP/sanitizer advisories. `adm-zip` vulnerable extraction/read operations were not used by SnipForge, but the direct package was still patched. |
| TipTap compatible set | All direct TipTap packages moved from `3.14.0` to `3.31.3`; added explicit `@tiptap/core` and `@tiptap/pm` alignment | Cleared TipTap, `markdown-it`, and `linkify-it` advisories without mixing package-family versions. |
| Vue/Vite/build chain | `vue` `3.5.21` → `3.5.43`; `vite` `5.4.20` → `7.3.6`; `@vitejs/plugin-vue` `5.2.4` → `6.0.9`; `vue-tsc` `2.2.12` → `3.3.11`; `typescript` `5.9.2` → `5.9.3`; `vitest` `3.2.7` → `4.1.11` | Cleared production `postcss`/`nanoid` audit path and dev Vitest advisories. |
| Native/runtime | `better-sqlite3` `12.2.0` → `13.0.3`; `electron` `29.4.6` → `44.4.5`; `electron-builder` `24.13.3` → `26.15.3`; `electron-builder-squirrel-windows` pinned to `26.15.3` | `better-sqlite3@12.2.0` could not rebuild against Electron 44/V8 headers; `13.0.3` rebuilt cleanly for Node 22 and Electron 44. |
| Targeted transitive overrides | `tar-fs` → `2.1.5`; `glob@7.2.3>minimatch` → `3.1.5` | Avoids blanket ignores. Both overrides stay within compatible semver lines and remove the remaining audit findings for install/build tooling. |

### Audit before/after

| Command | Before | After |
| --- | --- | --- |
| `pnpm audit --prod --json` | 35 advisories: 0 critical, 11 high, 20 moderate, 4 low | 0 advisories: 0 critical, 0 high, 0 moderate, 0 low |
| `pnpm audit --json` | Not the original launch gate; after production fixes it exposed Electron/build/test dev/runtime advisories | 0 advisories: 0 critical, 0 high, 0 moderate, 0 low |

No audit exceptions remain in this PR.

### Electron review

Electron moved from locked `29.4.6` to current `44.4.5`. Checked Electron breaking-change notes for majors 30–44 before the upgrade. Relevant impacts:

- Electron 44 rearchitected the `clipboard` API to align with the W3C Clipboard API. SnipForge's main-process clipboard IPC now awaits `clipboard.writeText()`, awaits `clipboard.readText()`, and writes rich text through `new ClipboardItem({ 'text/plain', 'text/html' })`.
- Electron 44 removes renderer-process `clipboard` module access; SnipForge already uses preload IPC rather than renderer direct Electron imports.
- Electron 32 removed `File.path`; no app usage was found in the searched source paths.
- Electron 33 requires native modules to support C++20-era toolchains; `better-sqlite3@12.2.0` failed against Electron 44 headers, and `better-sqlite3@13.0.3` rebuilt successfully.
- Electron 44 removes macOS 12 and 32-bit Windows/Linux ARM support. Current local smoke coverage is macOS arm64 only; Windows/Linux packaging remains unverified in this PR.

### Advisory reachability decisions

- `adm-zip`: advisories affect crafted ZIP parsing/extraction and symlink-following extraction. SnipForge's code only creates ZIPs with `addLocalFolder()`/`writeZip()` for export, so the vulnerable operation was not reachable before the update. Updated anyway and added an export ZIP regression test.
- `@tiptap/core` / `markdown-it` / `linkify-it`: rich text is reachable through editor content, paste/imported command data, and command rendering. TipTap's Markdown parser path was not directly called by SnipForge, but the family was upgraded as a compatible set because it sits on user-controlled rich-text paths.
- `dompurify`: sanitizer is directly reachable for command/Markdown rendering and clipboard HTML. Current app usage is string-in/string-out, not `IN_PLACE`, `RETURN_DOM`, custom element predicates, or global `setConfig()`, but this is security-sensitive and was patched.
- `postcss` / `nanoid`: surfaced through `@vue/compiler-sfc` in the production dependency graph, not expected runtime app behavior. Updating Vue/Vite removed the production audit path.
- `tar-fs`: install-time native prebuild extraction via `better-sqlite3 > prebuild-install`, not a runtime app operation. Patched with a semver-compatible override instead of documenting an exception.

### Verification evidence

Passed locally on macOS arm64:

- `pnpm audit --prod --json` → 0 advisories
- `pnpm audit --json` → 0 advisories
- `pnpm exec electron-builder install-app-deps` → rebuilt `better-sqlite3` for Electron `44.4.5` arm64
- `pnpm test:db` → 13 passed
- `pnpm test` → 106 passed
- `pnpm exec vue-tsc --noEmit` → passed
- `pnpm build` → Vite + Electron Builder completed; macOS arm64 DMG produced at `release/2.13.1/SnipForge-Mac-2.13.1-Installer.dmg`; build warns only about unsigned macOS package and large renderer chunk
- Electron clipboard smoke script using `ClipboardItem` → passed
- Packaged macOS app launch smoke with clean `--user-data-dir` → app initialized DB and stayed alive for 8s; killed intentionally
- Packaged macOS app restart smoke using the same `--user-data-dir` → existing DB loaded and stayed alive for 8s; killed intentionally
- DMG mount smoke with `hdiutil attach` → mounted and contained `SnipForge.app` plus Applications symlink

Known verification gaps / failures:

- `pnpm exec tsc --noEmit -p tsconfig.node.json` still fails on pre-existing TS project setup issues from finding 4: missing `vite-plugin-electron/electron-env`, shared files excluded from `tsconfig.node.json`, and ES iteration target/downlevelIteration errors. The Electron 44 clipboard type error that appeared during this work was fixed.
- No Windows installer, Linux AppImage, macOS Intel, or signed/notarized macOS install smoke was run in this PR. These remain unverified.
- No visual/manual UI automation was available for full create/search/copy/rich-text paste flows. Existing unit tests cover search/parser/CLI copy, database/local-library flows, rich-text attachment handling, and the ZIP export regression; packaged launch/restart was smoke-tested.

## Cadence

After this remediation, repeat dependency review monthly and before every public release, plus same-day triage for high/critical security advisories affecting Electron, rich text/HTML processing, archive processing, or native modules.
