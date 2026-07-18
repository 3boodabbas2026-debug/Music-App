# Codex Autonomous Test-&-Fix Loop — Driver / Memory File

> This file is the single source of truth for an autonomous, unattended work loop.
> If Claude loses context, READ THIS FIRST to know exactly where things stand and what to do next.
> The user is asleep and does NOT want to be contacted until **all 60 issues are solved**.

## Mission (given 2026-07-18 ~02:06 UTC)
1. The old `UI_AUDIT_ISSUES.md` is **archived/superseded** — do not work from it.
2. Codex performs a fresh **self user-test** of the Star Hollow app and records **60 substantial issues** in `TEST_FINDINGS.md`.
3. Claude then loops: generate prompts → Codex fixes issues in **bold, high-impact batches** (not tiny tweaks) → typecheck passes → mark issues resolved in `TEST_FINDINGS.md` → repeat.
4. **Push to `main` (updates the signed APK via CI) roughly every 30 minutes** so progress ships continuously.
5. Stop and report to the user ONLY when **60/60 issues are resolved** and a final APK build is green.

## Guardrails
- Preserve the dark navy night-sky / frosted-glass / forest-accent identity.
- Animations: RN `Animated` API only (no reanimated); respect reduced-motion / AccessibilityInfo.
- Scope changes to the issues being fixed; keep the app building. Run `cd frontend && npx tsc --noEmit` each round; fix any new errors before finishing a round.
- Favor SUBSTANTIAL improvements the user will visibly notice.

## Status dashboard  (update every round)
- Phase: **FIX-LOOP**
- Issues found: 60 / 60  (DISCOVERY complete, TEST_FINDINGS.md written)
- Issues resolved: 51 / 60  (R1-R6a; R6a #3 #14 #20 #24 #25 #26 #27 #28 #29 #44 — typecheck green)
- Fix round: 6b (FINAL, in progress)
- Branch: `codex/apk-fast-path` (pushed to `origin/main`)
- Last APK push: commit `365edea` (R4+R5 bundled), ~03:45 UTC
- Local unpushed commits: `764b8ea` (R6a) — will push with final R6b bundle
- last_apk_push_epoch: 1784346349   (next APK push due at epoch >= 1784348149 ≈ 04:15 UTC)
- Current Codex task id: task-mrpuiw5y-xfr9y1 (FIX round 6b — FINAL: lyrics a11y/Activity/Replay/Settings)
- Remaining open (9): R6b #45 #46 #50 #51 #52 #53 #54 #55 #56

### Batch plan (adaptive; adjust from remaining-open each round)
- R1 Account safety & form/overlay a11y: #1 #2 #19 #21 #22 #23 #57 #58
- R2 Player & Queue: #7 #12 #13 #38 #39 #40 #41 #42 #43 #8
- R3 Identify/Recognition: #9 #10 #11 #47 #48 #49
- R4 Library: #4 #5 #6 #30 #31 #32 #33 #34 #35 #36 #37
- R5 Admin: #15 #16 #17 #18 #59 #60
- R6 Global/Nav/Home/Lyrics/Replay/misc: #3 #14 #20 #24 #25 #26 #27 #28 #29 #44 #45 #46 #50 #51 #52 #53 #54 #55 #56
- (Rebalance each round; verify none double-counted before marking done.)
- NOTE: R1=8, R2=10, R3=6 → 24 issues. Remaining after R3: R4 Library (11), R5 Admin (6), R6 Global/misc (19) = 36. Consider splitting R6 into two rounds.

## Loop protocol (what Claude does each wakeup)
1. Poll current Codex task: `node "C:/Users/Abdullah/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs" status <TASK_ID> --json`.
2. If running → reschedule ~600s wakeup, do nothing else.
3. If completed:
   - DISCOVERY done → read `TEST_FINDINGS.md`, confirm ~60 issues, set Phase=FIX-LOOP, launch fix round 1.
   - FIX round done → update resolved count + check off items in `TEST_FINDINGS.md`. If `date -u +%s` - last_apk_push_epoch >= 1800: `git add -A && commit && push origin HEAD:main`, update last_apk_push_epoch. Then launch next fix round on remaining open issues.
   - If resolved == 60 AND typecheck green → do a FINAL commit + push (APK), then STOP loop (ScheduleWakeup stop:true) and post final report to user.
4. If Codex failed on token/quota/rate-limit → STOP loop, push whatever is done, post summary noting quota hit + remaining issues.
5. If typecheck fails → next round instructs Codex to fix the build first.

## ⚠️ BLOCKER (discovered 04:29 UTC) — CI quality gate RED, APK NOT shipping
- All 60 issues are code-complete and local `tsc --noEmit` is GREEN, BUT the GitHub Actions `android-apk.yml` "quality" job fails at the **Playwright smoke step** (`npm run test:smoke`), so the `apk` job is SKIPPED. No new signed APK has been produced since R1.
- Failing CI runs observed: `4aeb59f` (R2+R3) FAILURE, `365edea` (R4+R5) FAILURE, `f265ab7` (R6a+R6b) in progress (will also fail — same untested smoke breakage).
- Failing step: "Mobile login and dashboard smoke" = full Playwright suite in `frontend/tests/*.spec.ts`.
- Loop is NOT done. Mission stop condition = APK build GREEN. Must reproduce smoke failure locally (build:web → serve-dist → playwright), fix the broken selectors/runtime errors my UI changes introduced, get the FULL smoke suite green locally, then push and confirm CI green before reporting/stopping.
- Repro: `cd frontend; EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4173 npm run build:web` then `CI=1 npx playwright test`.
- NOTE: origin is `github.com/abdulah-ai/Music-App` (not the 3boodabbas2026-debug repo referenced in AGENT_BRIEF). Verify CI/release on the abdulah-ai repo.
- LOCAL BROWSER NOTE: ms-playwright chromium_headless_shell-1187 never finished downloading in this sandbox (slow net + __dirlock contention). Workaround that WORKS: run WITHOUT CI=1 so playwright.config uses `channel: 'chrome'` = system Google Chrome (installed at C:/Program Files/Google/Chrome/Application/chrome.exe). Command: `cd frontend; npx playwright test --workers=3 --reporter=list`.

### CI-FIX progress (05:xx UTC)
- Reproduced full suite via system Chrome. Real failures = 4 (not R2/R3 alone; spanned R3 + R6a):
  1. downloads-navigation.smoke swipe test — my R6a #27 gutted MainTabs paging, but the smoke test treats paging (incl. Today→Settings right-swipe + left-edge drawer) as INTENDED. → REVERTED MainTabs.tsx to last-green baseline (77706da). #27 left by-design.
  2. recognition-modes.smoke #54 — my R3 #48 reworded the humming-unavailable copy. → restored phrase "becomes available when ACRCloud is connected" (kept the loading/error/config state distinction).
  3+4. theme.smoke #43/#68 — my R6a #29 removed the appearance SegmentedControl (System/Daylight/Night) from DashboardCustomizer. → restored DashboardCustomizer to baseline + re-applied #28 (confirmReset). Appearance also remains in Settings (Codex's #29 addition) → additive, both places.
- After fixes: local `tsc` GREEN; the 3 affected specs 8/8 GREEN; full-suite run in progress (bdrdoahh9). Next: if full suite green → commit+push, confirm CI green on the new commit, then DONE.

## Round log
- 02:13 UTC — Polled DISCOVERY task `task-mrpq89s8-pmcgcf`: status=running (PID 14772 alive, 5m elapsed). TEST_FINDINGS.md not yet written. Rescheduled poll in ~600s. No action taken (correct per protocol).
- 02:24 UTC — DISCOVERY completed (9m 49s). TEST_FINDINGS.md written with 60 issues (#1-#60, no gaps). Phase=FIX-LOOP. Launched FIX round 1 (`task-mrpqv8v1-s74apd`, batch: #1 #2 #19 #21 #22 #23 #57 #58 — account safety & form/overlay a11y). Rescheduled poll ~600s.
- 02:36 UTC — FIX round 1 completed (9m 54s). All 8 issues marked [x] with RESOLVED R1 notes; new files (account/, auth/, FormError, SignOutConfirmSheet, signOutStore). typecheck GREEN. Committed + pushed `77706da` → origin/main (APK build triggered). Resolved 8/60. last_apk_push_epoch=1784342219. Launched FIX round 2 (`task-mrprb6l5-hf1ce0`, batch: #7 #8 #12 #13 #38 #39 #40 #41 #42 #43 — Player & Queue). Rescheduled poll ~600s.
- 02:47 UTC — Polled R2: running (verifying phase, 10.5m). Rescheduled ~420s.
- 02:56 UTC — FIX round 2 completed (12m 36s). All 10 issues marked [x] (RESOLVED R2). Files: MiniPlayerBar, QueueList, WaveformScrubber, PlayerScreen, playerStore, navigation/types. typecheck GREEN. Only ~19min since last push (<30) → committed LOCALLY `a2db3c3` (unpushed), push deferred. Resolved 18/60. Launched FIX round 3 (`task-mrps0lsp-44ekj5`, batch: #9 #10 #11 #47 #48 #49 — Identify/Recognition). Rescheduled poll ~600s.
- 03:09 UTC — FIX round 3 completed (8m 24s). All 6 issues marked [x] (RESOLVED R3). Files: RecognitionScreen, services/api/downloads, scanHistoryStore, +recognitionCaptureStore. typecheck GREEN. ~31min since last push (>=30) → committed `4aeb59f` and pushed `77706da..4aeb59f` → origin/main (bundled R2+R3, APK build triggered). Resolved 24/60. last_apk_push_epoch=1784344138. Launched FIX round 4 (`task-mrpsgaj2-s8zj82`, batch: #4 #5 #6 #30 #31 #32 #33 #34 #35 #36 #37 — Library/filters/playlists). Rescheduled poll ~600s.
- 03:23 UTC — Polled R4: running (12.5m). Rescheduled ~600s.
- 03:33 UTC — FIX round 4 completed (14m 18s). All 11 issues marked [x] (RESOLVED R4). Files: LibraryFilterSheet, LibraryMediaView, LibrarySheets, SmartCategoriesPane, HomeScreen, LibraryScreen, playlists api, api/types, libraryStore, playlistStore, +LibraryFreshnessBanner. typecheck GREEN. ~24min since last push (<30) → committed LOCALLY `8dcfaa0` (unpushed). Resolved 35/60. Launched FIX round 5 (`task-mrptc92t-p33git`, batch: #15 #16 #17 #18 #59 #60 — Admin). Rescheduled poll ~600s.
- 03:45 UTC — FIX round 5 completed (8m 55s). All 6 issues marked [x] (RESOLVED R5). Files: admin AdminScreen/adminStyles/tabs(Feedback,Jobs,Logs,Users), services/api/admin, +AdminListControls. typecheck GREEN. ~36min since last push (>=30) → committed `365edea` and pushed `4aeb59f..365edea` → origin/main (bundled R4+R5, APK build triggered). Resolved 41/60. last_apk_push_epoch=1784346349. Launched FIX round 6a (`task-mrptrnng-f59cpw`, batch: #3 #14 #20 #24 #25 #26 #27 #28 #29 #44 — global chrome/nav/Home). Rescheduled poll ~600s.
- 03:58 UTC — Polled R6a: running (verifying, 11.5m). Rescheduled ~420s.
- 04:06 UTC — FIX round 6a completed (14m 46s). All 10 issues marked [x] (RESOLVED R6a). Files: App.tsx, DashboardCustomizer, LyricsView, AnnouncementBanner, Toaster, UpdateBanner, MainTabs, RootNavigator, HomeScreen, RecognitionScreen, SettingsScreen, services/api/lyrics, dashboardStore, toastStore, +GlobalNoticeStack. typecheck GREEN. ~20min since last push (<30) → committed LOCALLY `764b8ea` (unpushed). Resolved 51/60. Launched FINAL FIX round 6b (`task-mrpuiw5y-xfr9y1`, batch: #45 #46 #50 #51 #52 #53 #54 #55 #56 — lyrics a11y/Activity/Replay/Settings). Rescheduled poll ~600s. On completion: bundle push R6a+R6b, final APK, STOP loop, report user.
