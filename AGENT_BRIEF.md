# Star Hollow Music App Agent Brief

## Project
Star Hollow is a dark, music-focused app built with an Expo/React Native frontend and a Python backend.

Main frontend path:
- `frontend/`

Screenshot reference folder:
- `Screenshoots for Star Hollow - Copy/`

Important note:
- This working folder may not currently be a Git repository. Before multiple agents edit code, verify the real Git root or set up a clean repo/branch workflow.

## Current Goal
Improve the app UI and codebase step by step without letting Codex and Claude overwrite each other.

The user wants:
- Better visual polish.
- Cleaner layout hierarchy.
- Fewer overlaps where modals, mini-player, sidebar, or panels cover content.
- Cleaner code structure before major redesigns.
- Low token usage for Claude whenever possible.

## Screens Covered
The 27 screenshots show these app areas:
- Today/Home
- Library
- Identify/Recognition
- Activity/Jobs
- Telegram
- Replay
- Settings
- Admin
- Player
- Login
- Register

## Visual Direction
Keep the existing identity:
- Dark forest/night music mood.
- Calm, premium, focused.
- The Player screen is one of the strongest visual references.

Improve:
- Contrast and readability.
- Spacing and hierarchy.
- Overlay behavior.
- Mobile and desktop responsive layouts.
- Reusable components instead of one-off fixes.

Avoid:
- Replacing the app with a generic Spotify clone.
- Huge visual rewrites before code is organized.
- Multiple agents editing the same files at the same time.
- Hiding content behind modals, bottom bars, or sidebars.
- Making the app too purple, too muddy, or too low contrast.

## Known Problem Areas
- `frontend/src/screens/LibraryScreen.tsx` is large and likely needs extraction.
- `frontend/src/screens/HomeScreen.tsx` is large and likely needs extraction.
- `frontend/src/components/library/LibrarySheets.tsx` likely controls heavy overlays and menus.
- `frontend/src/components/dashboard/DashboardCustomizer.tsx` likely controls the large dashboard modal.
- `frontend/src/components/player/MiniPlayerBar.tsx` can compete with page content.
- `frontend/src/components/ui/AppSidebar.tsx` affects desktop spacing and navigation.

## Recommended Agent Roles

### Codex
Use Codex for:
- Git/repo safety.
- Refactors.
- Component extraction.
- Code implementation.
- Tests and screenshot checks.
- Preventing regressions.

Codex should edit code only on a clear branch or clean worktree.

### Claude
Use Claude for:
- Screenshot analysis.
- UX critique.
- Visual hierarchy recommendations.
- Copywriting and labels.
- Reviewing before/after screenshots.

Claude should usually produce specs, not edit code directly, unless assigned a small isolated file.

## First Work Sequence
1. Verify Git/repo setup.
2. Create a short UI audit from screenshots.
3. Refactor large screens/shared layout components.
4. Fix overlay and mini-player spacing rules.
5. Improve screen visuals one group at a time.
6. Validate with desktop and mobile screenshots.

## Model Guidance
- Use cheaper/faster Claude model for small critique, copy, and ranking tasks.
- Use stronger Claude model only for full 27-screenshot strategy or complex architecture review.
- Use strongest available Codex model for repo edits and refactors.

