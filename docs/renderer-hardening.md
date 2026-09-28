# Renderer Navigation and IPC Hardening

## User-facing overview

SnipForge renders imported/shared command content and exposes privileged desktop operations through a named preload API. This hardening work makes those boundaries explicit: untrusted content should not navigate an app window to attacker-controlled content, launch unsafe URLs, call privileged IPC from unauthorized frames, or force unsafe HTML parsing during command previews.

This document tracks review finding 2. The review is a risk assessment, not proof of a working exploit.

## GitHub issue

- Issue: [#70 — Harden renderer navigation, IPC, and untrusted HTML handling](https://github.com/ArtluxDM/SnipForge/issues/70)
- Source review: finding 2, captured in tracked issue #70 and the plan/final notes below (local review scratch is not required to use this doc).
- Dependency triage prerequisite: PR [#69](https://github.com/ArtluxDM/SnipForge/pull/69) is merged.

## Plan before code changes

1. Centralize URL policy in the Electron main process:
   - app content is limited to the configured Vite dev origin in development and the packaged `index.html` file URL in production;
   - top-level navigation in every app window is blocked unless it stays on an allowed app URL;
   - popups are denied and intentional external opens go through one HTTPS-only validator;
   - malformed URLs, `javascript:`, `data:`, `file:`, custom schemes, credentials-bearing URLs, and HTTP URLs are rejected for external opening.
2. Apply the same navigation policy to the main palette window and the existing `open-win` child window path. Keep the child path working for legitimate hash-based routes, but validate the hash as route data rather than trusting arbitrary URLs.
3. Wrap privileged `ipcMain.handle` registrations with one sender/frame authorization boundary:
   - sender must be a live app window's `webContents`;
   - sender frame must be the main frame for that window;
   - frame URL must match the allowed app URL policy;
   - denied calls must fail before side effects.
4. Tighten production CSP in `index.html` by removing `script-src 'unsafe-inline'` while keeping dev/build behavior intact. Keep the policy explicit for default, script, style, image/font, connect, object, base URI, form, and frame ancestors.
5. Replace preview text extraction in `src/App.vue` so hostile HTML is treated as data before any DOM parsing. Preserve visible text, entities, whitespace reasonable for list previews, and `{{variable}}` detection/highlighting behavior.
6. Add focused regression tests for:
   - hostile content preview extraction and legitimate plain/HTML previews;
   - allowed and blocked navigation/external URL decisions;
   - allowed main-frame IPC and rejected sender/frame cases;
   - legitimate dev and packaged app URL decisions.
7. Run local verification: type checks, targeted/full tests, production build, and a packaged-app launch smoke check. Record exact gaps; do not claim cross-platform testing unless it was actually run.

## Implementation notes

Completed on 2026-09-28 for issue #70.

### Security decisions

- App URL policy is centralized in `electron/main/security.ts`.
  - Development app content is limited to the exact configured Vite origin from `VITE_DEV_SERVER_URL`.
  - Packaged app content is limited to the resolved `dist/index.html` file URL.
  - `file:`, `http(s)`, and malformed URLs are not accepted as app content unless they match those exact policies.
- Every app `BrowserWindow` is registered through `registerAppWindow()` and receives the same navigation controls:
  - `window.open` is denied after optionally routing a validated HTTPS URL through `shell.openExternal`;
  - top-level `will-navigate` outside the app URL policy is prevented;
  - frame navigation outside the app URL policy is prevented.
- External URL opening now uses `parseExternalHttpsUrl()` for both popups and `shell:openExternal` IPC. It rejects malformed values, non-HTTPS schemes, missing hostnames, credentials-bearing URLs, relative URLs, `file:`, `data:`, `javascript:`, HTTP, and custom schemes.
- All `ipcMain.handle` registrations in `electron/main/index.ts` now go through `secureIpcHandle()`. The authorization check requires:
  - a live registered app window;
  - the window's own `webContents` as sender;
  - the sender frame to be the main frame when frame identity is available;
  - sender and frame URLs to match the app URL policy.
- The existing `open-win` path was kept because it is part of the current preload API. It now accepts only sanitized hash-route data, registers the child window with the same navigation policy, and loads only the app entry point plus that hash.
- `DescriptionModal.vue` and `HelpModal.vue` no longer rewrite `localhost:5173` links into assumed HTTPS destinations. Nested anchor clicks are handled with `closest('a')`; the main process remains the final URL enforcement point.
- `index.html` production CSP removes `script-src 'unsafe-inline'`. `style-src 'unsafe-inline'` remains because current renderer styling/runtime behavior still depends on inline style allowance. The policy explicitly sets `default-src`, `script-src`, `style-src`, `img-src`, `font-src`, `connect-src`, `object-src`, `base-uri`, and `form-action`.
- Preview/plain-text extraction now uses `src/utils/htmlText.ts`, a text scanner/entity decoder that does not assign untrusted HTML to DOM `innerHTML`. DOMPurify remains at HTML rendering and clipboard HTML sinks.

## Verification evidence

Passed locally on macOS arm64:

- `pnpm exec vitest run tests/renderer-hardening.test.ts --reporter=dot` → 9 passed
- `pnpm exec vue-tsc --noEmit` → passed
- `pnpm test` → 12 files / 115 tests passed
- `pnpm test:db` → 13 passed
- `pnpm build` → Vite + Electron Builder completed; macOS arm64 app and DMG produced under `release/2.13.1/`; build warned only about a large renderer chunk and unsigned macOS packaging
- Packaged app smoke: launched `release/2.13.1/mac-arm64/SnipForge.app/Contents/MacOS/SnipForge --user-data-dir=<tmp>`, app initialized a fresh DB and stayed alive for 8 seconds; process was killed intentionally

Expected/known failure:

- `pnpm exec tsc --noEmit -p tsconfig.node.json` still fails on pre-existing TS project configuration issues tracked by finding 4: missing `vite-plugin-electron/electron-env`, shared files excluded from `tsconfig.node.json`, and ES iteration target/downlevelIteration errors. No new `renderer-hardening` file errors remained after adjusting this PR's code.

## Remaining risks / unverified

- No Windows, Linux, macOS Intel, signed/notarized macOS, or clean-machine installer smoke was performed in this PR.
- Runtime click/navigation behavior and actual resource loads from hostile rich text (remote images/media, `file:` URLs, malformed links), including copy-to-clipboard HTML, were not exercised with a browser automation harness. Coverage is via focused unit tests for URL policy, external URL validation, IPC sender rejection/allowance, and hostile preview extraction plus a packaged launch smoke. Recheck dev and packaged flows in an isolated profile before making an end-to-end security claim.
- Dev flow was preserved by policy tests for the configured Vite origin and by keeping dev-only CSP `connect-src` allowances; a live `pnpm dev` UI smoke was not run.
- CSP still permits inline styles. Script inline allowance was removed; further style tightening should be handled separately if/when renderer styling no longer requires it.
- This PR intentionally does not address dependency triage, local-library reconciliation, release gates, or large-module refactors from other findings.
