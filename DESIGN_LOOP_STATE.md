# Codex Autonomous DESIGN Loop — Driver / Memory File

> Single source of truth for an unattended "turn Star Hollow into a masterpiece" design loop.
> If Claude loses context, READ THIS FIRST. User is away; do not contact until all 73 design ideas are shipped with a GREEN APK build.

## Mission (given 2026-07-18 ~05:48 UTC)
1. Codex (high effort / "ultra") does a fresh design pass and records **73 substantial design ideas** in `DESIGN_IDEAS.md`.
2. Claude then loops: generate prompts → Codex implements ideas in **bold, cohesive batches** → **typecheck GREEN** → **full Playwright smoke suite GREEN** → mark ideas done → repeat.
3. Push to `main` (rebuilds signed APK via CI) roughly every ~30 min so progress ships continuously.
4. Stop and report to user ONLY when **73/73 ideas done** AND CI (quality + apk jobs) is GREEN and the apk-latest release refreshed.

## Guardrails (design north star)
- Elevate WITHIN the existing identity: dark navy night-sky, frosted glass, forest accents, restrained dusk-editorial, premium & calm. NO generic Spotify styling, no excessive purple/blur/animation. A masterpiece = refined hierarchy, typography, spacing rhythm, depth, motion polish, cohesion — not a reskin.
- Animations: RN `Animated` API only (no reanimated). Respect reduced-motion / AccessibilityInfo.
- Use semantic theme tokens (`frontend/src/theme/tokens.ts`) + shared UI components. Extend the token system rather than sprinkling one-off values.
- **CRITICAL — do not break CI:** the committed Playwright smoke suite (`frontend/tests/*.spec.ts`, 40 tests) encodes exact selectors, copy, roles, layout invariants (no horizontal overflow, mini-player above dock, tab paging, theme tabs, recognition copy, etc.). Design changes MUST keep every smoke test green. If a change alters a tested string/role/layout, update the test IN LOCKSTEP only when the new behavior is clearly correct.

## Verification each round (MANDATORY before push)
1. `cd frontend; npx tsc --noEmit` → must be GREEN.
2. `cd frontend; EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4173 npm run build:web` → must succeed.
3. Full smoke suite via SYSTEM CHROME (sandbox has no headless_shell): `cd frontend; npx playwright test --workers=3 --reporter=list` (NO CI=1 → uses channel:'chrome' = installed Google Chrome). Must be 40/40 GREEN. Fix any regressions before committing.
4. Only then commit + push. After push, confirm the new commit's CI run (quality + apk jobs) is GREEN before treating it as shipped.

## Status dashboard (update every round)
- Phase: **DESIGN-IMPLEMENT**
- Ideas found: 73 / 73 (DESIGN_IDEAS.md written)
- Ideas done: 33 / 73  (R1-R3; R3 #24-#33 — tsc + full smoke 40/40 green)
- Round: 4 (in progress)
- Branch: `codex/apk-fast-path` → origin/main
- Last shipped APK: R1 `88df962` + R2 `7bcafd8` — both CI GREEN. R3 committed LOCALLY `db16b4d` (unpushed — bundle w/ R4). last_apk_push_epoch: 1784357578
- Current Codex task id: task-mrq1eq9j-dca31t (R4 Library #34-#41, effort=high)

### Batch plan (adaptive)
- R1 Foundations: #1-#12 (tokens/type/spacing/grid/glass/elevation/palette/accent/gradients/radii/icons/numerics/daylight)
- R2 Motion & microinteractions: #13-#23
- R3 Screens — Auth + Home: #24-#33
- R4 Screens — Library: #34-#41
- R5 Screens — Player/Queue/Lyrics/Waveform: #42-#48
- R6 Screens — Recognition/Activity/Replay/Settings/Telegram/Admin: #49-#56
- R7 Components & states: #57-#68
- R8 Cohesion & finishing: #69-#73

### ⚠️ Smoke-test invariants to protect each round (frontend/tests)
- theme.smoke: daylight `--sh-palette-background` == `#EAF1EB` and `Bring a track home.` color == `rgb(19, 37, 27)`; data-theme light/dark; tabs 'Daylight'/'System'/'Night' (role tab) in customizer. If a design idea (e.g. #12) deliberately changes these token VALUES, update theme.smoke's expected values IN LOCKSTEP (keep the test's structural intent).
- auth-dashboard: no horizontal overflow at 390px; forest-atmosphere bg transparent; `forest-backdrop-app`, `forest-atmosphere`, `forest-drift-layer`, `forest-fireflies` testIDs; mini-player/video-mini-strip stays above dock/bulk-bar; exact copy 'Bring a track home.', 'YOUR MUSIC', 'What's playing?', 'YOUR IMPORTS', 'Nothing in motion'; tabs Today/Library/Identify/Activity; virtualization (<80 rendered rows of 520).
- accent-contrast: raiseAccentToContrast behavior (exact rgb expectations).
- downloads-navigation: swipe paging + left-edge drawer; 'Add N links to library'; 'LATEST IMPORT','1/2 added','This source is unavailable'.
- player-more: 'NOW PLAYING','More player options', Track/Playback tabs, exact labels ('Play next for X', 'Duration: 4:05','File: MP3 · 8.0 MB', etc.).
- recognition-modes: 'Hum or sing' tab disabled when unconfigured + copy /becomes available when ACRCloud is connected/.
- Keep ALL accessibilityRole/label/testID and visible copy the tests query. Verify with system Chrome each round.

## Env notes (carry forward)
- Origin: `github.com/abdulah-ai/Music-App`. CI runs API: https://api.github.com/repos/abdulah-ai/Music-App/actions/runs?branch=main&per_page=3
- Release: https://github.com/abdulah-ai/Music-App/releases/download/apk-latest/starhollow.apk
- Codex runner: `node "C:/Users/Abdullah/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs" task --background --write --effort high "<prompt>"` ; poll: `... status <id> --json`.
- Playwright: use system Chrome (no CI=1). The 60-issue loop is DONE (see CODEX_LOOP_STATE.md).

## Round log
- 05:48 UTC — Created design loop. Launched DESIGN-DISCOVERY (`task-mrpy5gnp-iysej0`, effort=high) → DESIGN_IDEAS.md with 73 ideas. Prior 60-issue loop DONE (APK versionCode 40, commit c749471). Rescheduled poll ~600s.
- 06:00 UTC — DISCOVERY done (8m50s). 73 ideas confirmed (#1-#73, no gaps, 5 groups). Phase=DESIGN-IMPLEMENT. Recorded batch plan + smoke-test invariants. Launched R1 Foundations #1-#12 (`task-mrpylcep-hbpmvc`, effort=high; Codex self-runs full smoke suite via system Chrome). Poll ~900s.
- 07:14 UTC — R3 Auth+Home done (20m41s). #24-#33 done (4 files: AuthLayout, HomeScreen, LoginScreen, RegisterScreen). tsc+build GREEN, full smoke 40/40 GREEN first try. ~27min since push (<30) → committed LOCALLY `db16b4d` (unpushed). Done 33/73. Launched R4 Library #34-#41 (`task-mrq1eq9j-dca31t`, effort=high). Poll ~900s. R2 CI GREEN confirmed (7bcafd8).
- 06:53 UTC — R2 Motion done (27m). #13-#23 done (25 files: motion.ts, useTactileGlass, TabChipRow, SegmentedControl, Reveal, PressableScale, Button/IconButton, MiniPlayerBar, WaveformScrubber, CoverBackdrop, ProgressRing, sidebar/dock, screens). tsc+build GREEN, full smoke 40/40 GREEN first try. ~30min since push → committed+pushed `7bcafd8` → origin/main (CI verify pending). Done 23/73. last_apk_push_epoch=1784357578. Launched R3 Auth+Home #24-#33 (`task-mrq0gjes-k0qlcq`, effort=high). Poll ~900s.
- 06:23 UTC — R1 done (15m35s). #1-#12 marked done; 21 files (theme/tokens, theme/theme, shared components). tsc GREEN, build GREEN. Full smoke: first run 1 fail (auth remembered-accounts) = parallel-load flake (passed in isolation 1.2s), re-run 40/40 GREEN. ~52min since last push → committed+pushed `88df962` → origin/main (CI verify pending). Done 12/73. last_apk_push_epoch=1784355790. Launched R2 Motion #13-#23 (`task-mrpze7mg-3w8qef`, effort=high). Poll ~900s.
