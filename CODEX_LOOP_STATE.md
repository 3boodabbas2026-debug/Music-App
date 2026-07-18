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
- Issues resolved: 8 / 60  (R1: #1 #2 #19 #21 #22 #23 #57 #58 — typecheck green)
- Fix round: 2 (in progress)
- Branch: `codex/apk-fast-path` (pushed to `origin/main`)
- Last APK push: commit `77706da` (R1), ~02:36 UTC
- last_apk_push_epoch: 1784342219   (next APK push due at epoch >= 1784344019 ≈ 03:06 UTC)
- Current Codex task id: task-mrprb6l5-hf1ce0 (FIX round 2 — Player & Queue)

### Batch plan (adaptive; adjust from remaining-open each round)
- R1 Account safety & form/overlay a11y: #1 #2 #19 #21 #22 #23 #57 #58
- R2 Player & Queue: #7 #12 #13 #38 #39 #40 #41 #42 #43 #8
- R3 Identify/Recognition: #9 #10 #11 #47 #48 #49
- R4 Library: #4 #5 #6 #30 #31 #32 #33 #34 #35 #36 #37
- R5 Admin: #15 #16 #17 #18 #59 #60
- R6 Global/Nav/Home/Lyrics/Replay/misc: #3 #14 #20 #24 #25 #26 #27 #28 #29 #44 #45 #46 #50 #51 #52 #53 #54 #55 #56
- (Rebalance each round; verify none double-counted before marking done.)

## Loop protocol (what Claude does each wakeup)
1. Poll current Codex task: `node "C:/Users/Abdullah/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs" status <TASK_ID> --json`.
2. If running → reschedule ~600s wakeup, do nothing else.
3. If completed:
   - DISCOVERY done → read `TEST_FINDINGS.md`, confirm ~60 issues, set Phase=FIX-LOOP, launch fix round 1.
   - FIX round done → update resolved count + check off items in `TEST_FINDINGS.md`. If `date -u +%s` - last_apk_push_epoch >= 1800: `git add -A && commit && push origin HEAD:main`, update last_apk_push_epoch. Then launch next fix round on remaining open issues.
   - If resolved == 60 AND typecheck green → do a FINAL commit + push (APK), then STOP loop (ScheduleWakeup stop:true) and post final report to user.
4. If Codex failed on token/quota/rate-limit → STOP loop, push whatever is done, post summary noting quota hit + remaining issues.
5. If typecheck fails → next round instructs Codex to fix the build first.

## Round log
- 02:13 UTC — Polled DISCOVERY task `task-mrpq89s8-pmcgcf`: status=running (PID 14772 alive, 5m elapsed). TEST_FINDINGS.md not yet written. Rescheduled poll in ~600s. No action taken (correct per protocol).
- 02:24 UTC — DISCOVERY completed (9m 49s). TEST_FINDINGS.md written with 60 issues (#1-#60, no gaps). Phase=FIX-LOOP. Launched FIX round 1 (`task-mrpqv8v1-s74apd`, batch: #1 #2 #19 #21 #22 #23 #57 #58 — account safety & form/overlay a11y). Rescheduled poll ~600s.
- 02:36 UTC — FIX round 1 completed (9m 54s). All 8 issues marked [x] with RESOLVED R1 notes; new files (account/, auth/, FormError, SignOutConfirmSheet, signOutStore). typecheck GREEN. Committed + pushed `77706da` → origin/main (APK build triggered). Resolved 8/60. last_apk_push_epoch=1784342219. Launched FIX round 2 (`task-mrprb6l5-hf1ce0`, batch: #7 #8 #12 #13 #38 #39 #40 #41 #42 #43 — Player & Queue). Rescheduled poll ~600s.
