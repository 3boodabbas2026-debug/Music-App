# Star Hollow UI Audit — Live Issue List

Working list from a screenshot-by-screenshot pass over the app (mobile-first,
current build). Each issue has a description, and where useful, a suggested
direction. **Nothing here has been implemented yet** — this file is the
handoff spec for whoever fixes these.

Keep the existing dark Star Hollow identity (navy night sky, frosted glass
surfaces, forest accents) while fixing these — none of this should turn into
a broader redesign. Fix issues independently where possible; don't bundle
unrelated changes into one commit.

---

## Issue 1 — Bottom tab bar is always pinned and eats screen space

**Screen:** Mobile, every screen with the tab bar (Today, Library, Identify,
Activity).

**Problem:** The bottom tab bar (Today / Library / Identify / Activity) is
permanently visible and takes up a fixed strip of the viewport at all times.

**Suggested fix:** Make it collapsible — either auto-hide on scroll down and
reappear on scroll up (a well-established mobile pattern), or give it an
explicit collapse affordance. Respect `prefers-reduced-motion` /
`AccessibilityInfo.isReduceMotionEnabled()` for the hide/show transition,
consistent with how `SanctuaryMode.tsx` and `Starwell.tsx` already gate their
animations.

**Status: fixed in codex/ui-audit-completion**

### Issue 1b — Content gets cut off behind the tab bar

**Screen:** Today (Offline shelf card at the bottom of the scroll).

**Problem:** The "Offline shelf" card's body text and icon are partially
hidden underneath the tab bar — insufficient bottom clearance on scrollable
content.

**Suggested fix:** This is a symptom of a recurring pattern (we've now hit it
on Library's multi-select bar, the Identify search bar, and here). Rather than
patching bottom padding screen-by-screen, define **one shared "safe bottom
inset" constant/hook** (there is already a `layout.dockClearance` /
`layout.tabBarClearance` token in `theme/theme.ts` — audit whether every
scrollable screen actually uses it, since this keeps recurring) and apply it
everywhere content can sit near the tab bar or mini player.

**Status: fixed in codex/ui-audit-completion**

---

## Issue 2 — Dashboard customize modal ("Arrange your hollow")

**Screen:** Today → dashboard settings icon → "Arrange your hollow" modal.

1. **Full-screen takeover for a settings panel.**
   Suggested fix: centered dialog/panel with a max-width and internal scroll
   instead of a full-bleed sheet. Can stay near-full-height on mobile if
   needed, but should read as a floating panel on desktop.

   **Status: fixed in codex/ui-audit-completion**

2. **Reorder up/down arrow buttons look bland, low-affordance, and don't
   show disabled state at list boundaries** (first item's "up", last item's
   "down").
   Suggested fix: either a proper drag handle for drag-to-reorder, or keep
   arrows but give them a real disabled visual state and more contrast.

   **Status: fixed in codex/ui-audit-completion**

3. **No real light/dark theme — "Forest Night" / "Cosmic Night" read as two
   near-identical dark variants**, not a genuine light/dark pair, and both
   use the same generic leaf icon rather than previewing their own accent.
   Suggested fix: make each accent option visually preview its own hue in the
   selector; if a real light mode is wanted, it needs its own token set (see
   "Broader suggestions" below).

   **Status: fixed in codex/ui-audit-completion** (accent previews; a true
   light theme remains an unscoped product decision.)

4. **Layout/Accent segmented controls feel generic** — selected state is a
   subtle background tint, easy to miss.
   Suggested fix: reuse the glass/glow selected-state treatment already built
   for `Button` and `IconButton` so selection is unmistakable.

   **Status: fixed in codex/ui-audit-completion**

5. **Weak/no open-close animation.**
   Suggested fix: short scale+fade or slide-up transition using the existing
   `motion` duration/easing tokens in `theme/theme.ts` rather than new values.

   **Status: fixed in codex/ui-audit-completion**

6. **Too dense** — every widget row repeats icon + title + subtitle + two
   arrow buttons + a toggle for 8 rows.
   Suggested fix: simplify per-row chrome (see #2 — drag handle removes two
   buttons per row) and tighten row height.

   **Status: fixed in codex/ui-audit-completion**

7. **Bottom tab bar bleeds through the modal** — "Listening stats" row is
   half-covered by the tab bar. Same root cause as Issue 1b; should resolve
   once this becomes a proper centered dialog (#1).

   **Status: fixed in codex/ui-audit-completion**

---

## Issue 3 — Sidebar needs a modernization pass

**Screen:** Desktop/tablet sidebar (`AppSidebar.tsx`).

1. **Visual design feels dated/flat** — wants a more modern look overall
   (this one is subjective; needs a design pass, not just a token swap — the
   glass surface language from the recent dashboard work is the natural
   direction here since the sidebar currently doesn't use it).
2. **No animations** on nav item selection, hover, or expand/collapse.
   Suggested fix: subtle transition on the active-row accent bar and
   background tint (reuse `motion` tokens), plus a hover micro-interaction.
3. **No "Add account" option** — the account row at the bottom only supports
   a single signed-in user with sign-out; no multi-account switching.
   Suggested fix: needs product scoping first (does this mean multiple
   Star Hollow accounts on one device, switchable without re-entering a
   password each time? That's a real feature, not a small UI tweak — token
   storage, cached-user data, and Issue 4 below all need to support multiple
   concurrent identities before "Add account" can work correctly).
4. **Telegram connection isn't remembered** — user has to reconnect
   repeatedly instead of staying linked.
   Suggested fix: needs verification before fixing. The backend already
   tracks link status per account (`TelegramScreen.tsx` checks
   `status.authorized` on load and jumps straight to the `'linked'` phase if
   true, and there's a `telegram_account` model on the backend), so on paper
   this should already persist. Reproduce exactly when it re-prompts
   (different device? after logout/login? after some time period?) before
   assuming the fix — it may turn out to be entangled with Issue 4's account
   state bleed rather than a Telegram-specific bug.

---

## Issue 4 — Cross-account data leak: playback/library state isn't cleared on account switch (bug, not cosmetic)

**Screen:** Any screen, after signing out of one account and into another.

**Problem:** Confirmed directly in the code, not just from a screenshot.
`authStore.logout()` (`frontend/src/store/authStore.ts:77-81`) only clears
`tokenStorage` and `offlineMedia` — it never resets `usePlayerStore`,
`useLibraryStore`, `useDashboardStore`, `usePinStore`, `usePlayHistoryStore`,
`useFavoritesStore`, `usePlaylistStore`, or `useScanHistoryStore`. These are
all global Zustand stores that live for the app process's lifetime, so
switching accounts leaves account A's now-playing track (and library, pins,
play history, etc.) visible to account B until a full page reload.

**Suggested fix:** Add a single "reset all session-scoped stores" call
invoked from `logout()` (and again right after a successful `login()`/
`register()`, in case something was left over from an unclean previous
session) that clears every store above back to its initial state. Since this
is a correctness/privacy bug — one account's data being visible to another —
treat it as higher priority than the cosmetic issues above, and fix before
"Add account" (Issue 3.3) is built, since multi-account support would make
this bug worse, not better, if the underlying stores still aren't isolated
per identity.

**Status: fixed in codex/ui-audit-correctness**

---

## Issue 5 — Library card polish (grid + list view)

**Screen:** Library, both grid and list layouts.

1. **Square glow artifact behind the round play button on hover — confirmed
   root cause.** In `frontend/src/components/library/LibraryMediaView.tsx`,
   the hover glow (`shadowColor`/`shadowRadius`/`shadowOffset`) is applied to
   `playFabWrap`, a plain rectangular `View` with no `borderRadius` — the
   pill shape only exists on the inner `LinearGradient` (`playFab`,
   `borderRadius: radii.pill`). On React Native Web a shadow on an unrounded
   box renders as a square glow, which is exactly the square visible behind
   the circular play button.
   Suggested fix: move `borderRadius: radii.pill` onto `playFabWrap` itself
   (or otherwise wrap the shadow around an already-rounded element).

   **Status: fixed in codex/ui-audit-correctness**

2. **Blank/black fallback thumbnails — confirmed root cause.** Tracks with no
   real artwork fall back to a dark `coverGradient` plus a glyph icon
   rendered at only `0x59` (~35%) opacity (`LibraryMediaView.tsx`, glyph
   fallback block). Against the already-dark fallback gradient, the glyph is
   nearly invisible, so the card reads as a plain black square instead of a
   recognizable "no artwork" placeholder.
   Suggested fix: raise the glyph's fallback contrast substantially, or use a
   solid tinted background instead of relying on a faint icon alone, so a
   missing-artwork card still looks intentional.

3. **Raw scraped titles again** — e.g. "Take It Off – Kesha #kesha
   #lyrics_songs #lyricsedit #…" and "Children – Robert Miles (Intermediate
   Piano Tutorial)" dump source-site metadata straight into the display
   title, then get awkwardly truncated mid-word/mid-hashtag. Same underlying
   issue flagged from the first screenshot (Home's "Continue listening"
   card) — confirms this is systemic, not a one-off, and should be fixed
   once in `displayTitle` rather than per-screen.

   **Status: fixed in codex/ui-audit-completion**

4. **No animations** — grid↔list view toggle snaps instantly; cards have no
   entrance transition and only the play button fades on hover.

5. **General "friendliness" gaps:**
   - The yellow status dot on a card has no visible label/tooltip explaining
     what it means.
   - Grid and list cards currently show wildly inconsistent visual quality
     (one has a real, readable thumbnail; the other is a near-blank square)
     — reads as broken/unfinished rather than "no artwork available."

---

## Issue 6 — Video player experience

**Screen:** Fullscreen video player (`GlobalVideoStage.tsx`), and its
minimized/floating state seen over the Library screen.

1. **General dissatisfaction with the video display** — wants an overall
   better/more polished layout for the fullscreen player. No specific
   sub-complaint beyond "I don't like how the video displayed" — needs a
   concrete design direction before implementation.

2. **Wants next/prev to visibly swap the video content, not just audio.**
   Needs verification before assuming it's broken: `GlobalVideoStage.tsx`
   already builds a `videoQueue` from the library's video items and wires
   `nextMedia`/`prevMedia`/`setMediaId`, so switching *should* already swap
   the rendered video. This screenshot's library has only one video (see the
   "VIDEO 1 OF 1" badge), so next/prev are correctly inert here — **retest
   with 2+ videos in the library** before treating this as a bug rather than
   a test-data limitation.

3. **Wants controls to auto-hide behind a blur after 3–5 seconds of
   inactivity, so the video is unobstructed** (any tap brings them back).
   Confirmed this doesn't exist yet — there is no `setTimeout`/
   `controlsVisible`-style logic anywhere in `GlobalVideoStage.tsx`; every
   control (top bar, transport bar, track info) stays permanently visible.
   This is a net-new feature, not a fix.
   Suggested direction: fade + slight blur of the chrome layer after N
   seconds idle, restore instantly on any interaction — the same pattern
   most video apps use (YouTube, Netflix).

4. **Dislikes the minimized/floating video window** overlapping other
   screens — seen in the second screenshot, where a small floating video
   card sits on top of the Library list, obscuring the Favorites tab and
   filter row underneath. This is a deliberate existing feature
   (`mode: 'mini'` in `videoPlayerStore.ts` — a persistent draggable
   picture-in-picture window so video minimizes like audio does), but the
   user wants it removed or redesigned into something less intrusive.
   Suggested direction: needs a product decision among: (a) remove PiP
   entirely and just pause/stop video on leaving the player, (b) keep it but
   constrain it to never overlap primary content (fixed corner dock, correct
   z-index, smaller size), or (c) replace it with a persistent strip matching
   the audio mini-player's pattern instead of a floating card.

---

## Issue 7 — Track options menu ("…") covers the whole screen

**Screen:** Library, tapping "…" on any track.

**Problem:** Opens a near-full-height bottom sheet (Play, Play next, Add to
queue, Add to favorites, Pin for quick access, Add to playlist, More by
artist, Rename/edit details, Select multiple, Save file, Delete) that
dominates the screen — the same "full takeover for what should be a small
menu" pattern as the dashboard modal (Issue 2.1).

**Suggested fix:** Shrink into a compact, glass/blur-styled floating menu
using the frosted-glass surface language already built this session
(`GlassPanel`/`glass` tokens in `theme/theme.ts`), anchored near where it was
triggered — not a heavy opaque full-height sheet.

**Status: fixed in codex/ui-audit-completion**

---

## Issue 8 — Selection-mode bottom bar overlaps the tab bar — confirmed root cause, and it's an incomplete fix of a bug we already fixed once

**Screen:** Library, select mode (tap "Select multiple…" then select items).

**Problem:** Confirmed directly in the code. In
`frontend/src/screens/LibraryScreen.tsx`, the bulk-selection bar (`bulkBar`,
~line 662) only pads for the device safe-area:
`paddingBottom: insets.bottom + spacing.sm`. It never accounts for the
persistent mobile tab bar's own height (`layout.tabBarClearance` /
`dockClearance` in `theme/theme.ts`), so on mobile it renders flush at the
screen's bottom edge, directly under the Today/Library/Identify/Activity bar
— cutting off the "N selected" label and the Delete button.

**This is the same interaction already fixed once this session** — the mini
player was moved above the bulk bar via `bulkBarOffset` →
`MiniPlayerBar bottomOffset`. That handled the mini-player collision
correctly but never accounted for the tab bar itself, so this is an
incomplete fix, not a new bug.

**Suggested fix:** Apply the same clearance treatment already used for the
mini player — pad `bulkBar` by the tab bar's height too, not just the
safe-area inset. This is the "systemic bottom-clearance" issue already
flagged in Broader Suggestions below; this is now the **third** confirmed
occurrence (Issue 1b, Issue 2.7, and this one).

**Status: fixed in codex/ui-audit-correctness**

### Issue 8b — Selection display consistency for video items (needs clarification)

**Problem (as reported, needs confirmation):** the selected-item visual
treatment may need polishing, and the same problem may occur when selecting
a video item specifically, not just other media types.

**Status: needs clarification** — unclear whether this means Issue 8's
overlap also reproduces with a video selected, or a distinct visual bug in
the selected-row treatment (checkmark/border) for video cards specifically.
Get a screenshot of a video item selected before scoping a fix.

---

## Issue 9 — Player screen (Now Playing) — highest priority per the user

**Screen:** `PlayerScreen.tsx`, the full Now Playing view.

**User's framing:** "the most important page in the whole app... what gives
a feeling of listening to music." Wants a real visual/animation upgrade, not
a small tweak. **Prioritize this above the smaller polish items once fixes
start.**

1. **General visual/animation upgrade** — open-ended, wants a stronger
   "listening to music" feeling and more motion throughout. No concrete
   sub-items yet; needs a design direction agreed before implementation.

2. **Transport play/pause button — confirmed root cause, third occurrence of
   the accent-contrast bug.** `PlayerScreen.tsx:236` sets the big center
   button's `backgroundColor: accent` directly, using the same
   `useTrackAccent()` hook (`hooks/useTrackAccent.ts`) already implicated in
   the mini-player and Home resume-button contrast failures from the very
   first screenshot reviewed. For this track's warm-toned artwork, it
   renders as a near-invisible dark maroon circle on this screen too.
   Confirms this is **one systemic bug** — an unclamped track-derived color
   used as a solid fill with no minimum contrast floor — not three separate
   incidents. Fix once, at the `useTrackAccent` level (clamp/adjust the
   derived color's luminance before using it as a button fill), not per
   button. See also the elevated note in Broader Suggestions below.

   **Status: fixed in codex/ui-audit-completion**

3. **"Sanctuary" pill looks disabled/inconsistent with the other three
   pills** (Up next, Lyrics, More look active-styled; Sanctuary looks
   visibly dimmed with no explanation).
   **Status: resolved by observation** — a follow-up screenshot shows
   Sanctuary Mode activates correctly; the pill just uses a coral/red tint
   for its active state instead of the teal used elsewhere in the app, which
   read as "dimmed." Not a bug — optionally worth aligning its accent color
   with the rest of the app for consistency, but no functional issue.

---

## Issue 13 — Sanctuary Mode's next/prev doesn't advance to another track (likely root cause found, needs confirmation)

**Screen:** Player screen → Sanctuary Mode, tapping next/prev.

**Problem:** Reported that Sanctuary Mode — described as an ambient
"put the phone down and just listen" screensaver-like state — doesn't
advance to a different track when using its next/prev controls.

**Likely root cause:** Traced a real, plausible pathway in
`frontend/src/store/playerStore.ts:154` — the queue's auto-continuation
logic explicitly filters to `media_type === 'audio'` only when pulling more
tracks in from the library:
`useLibraryStore.getState().items.filter((m) => m.media_type === 'audio' && ...)`.
The track in this screenshot ("Children – Robert Miles") is classified
`video`. If it ended up as the sole item in the queue, the continuation
logic that would normally extend the queue with more tracks explicitly
excludes video-type items — meaning there may genuinely be nothing for
`playNext()` to advance to.

**Needs confirmation:** does this reproduce with an audio-type track
playing instead of a video-type one? That would confirm the issue is
specifically about how video-classified media interacts with the
audio-only queue system, not Sanctuary Mode's next/prev controls
themselves being broken.

---

## Issue 14 — Ambient starfield/aurora in Sanctuary Mode feels completely static and "empty" (likely root cause found)

**Screen:** Player screen → Sanctuary Mode background.

**Problem:** "There is no animation at all... it's just empty." The
starfield and aurora sweep in the screenshot show zero visible motion.

**Likely root cause:** `SanctuaryMode.tsx`'s star-twinkle and aurora-drift
animations are both explicitly gated by
`AccessibilityInfo.isReduceMotionEnabled()` — if the device/browser used for
this screenshot has "reduce motion" enabled at the OS level, **both
animations are intentionally disabled entirely**, which would produce
exactly this frozen scene.

**Needs verification:** check whether reduce-motion is enabled on the
device/browser this was captured on. If it's off and the scene still looks
static, that's a separate, real animation bug.

**Separately, regardless of the above:** even with motion working, the
current design (a handful of small dots, one subtle aurora sweep) may be too
sparse to read as "alive" at a glance. Worth a genuine visual upgrade to
this scene on its own merits, since "empty" was the user's own word for it
— ties into Issue 9's broader ask for the Player experience to feel more
alive.

---

## Issue 10 — Lyrics don't work — confirmed root cause, tied to the title-cleaning issue

**Screen:** Player screen → Lyrics tab.

**Problem:** Traced in `frontend/src/services/api/lyrics.ts`: it queries
lrclib.net using the raw `media.title`/`media.artist` fields as-is. For this
track, that's the scraped garbage title ("Children – Robert Miles
(Intermediate Piano Tutorial) #pianocover #…") and `capo.piano` as the
"artist" field — which is a YouTube channel name, not the real recording
artist. That search has almost no chance of matching anything in lrclib's
database.

**This is a second, functional consequence of the title-cleaning problem
already flagged in Issue 5.3** — cleaning up title/artist metadata wouldn't
just look better on cards, it would make lyrics actually work for tracks
that do exist in lrclib's database.

**Suggested fix:** Once `displayTitle`/artist cleanup exists (per Issue
5.3), use the cleaned values — not the raw scraped fields — when querying
lrclib. Also worth distinguishing "uploader/channel name" from "real artist"
in the data model if that distinction doesn't already exist, since
`capo.piano` (a channel) and `Robert Miles` (the actual artist) are very
different things for a lyrics/metadata lookup.

**Status: fixed in codex/ui-audit-completion**

---

## Issue 11 — "Up next" panel covers the full screen, mostly empty

**Screen:** Player screen → "Up next" pill.

**Problem:** Same full-takeover pattern as Issues 2.1 and 7 — and
especially wasteful here: with one track in the library, the sheet shows one
row of content on top of a large empty void.

**Suggested fix:** Same as Issue 7 — compact, glass/blur-styled panel sized
to its content, not a fixed full-height sheet.

**Status: fixed in codex/ui-audit-completion**

---

## Issue 12 — "More" (Playback) panel — same full-screen issue, plus a feature request

**Screen:** Player screen → "More" pill → Playback panel.

**Problem:** Same full-screen display complaint as Issue 11 (wants smaller +
glass/blur treatment).

**Status: fixed in codex/ui-audit-completion**

**Feature request (needs scoping):** User wants more options here beyond
the current four (Playback speed, Sleep timer, Pin to Today, Add to
favorites) — specifics not yet defined. **Needs a follow-up conversation**
before this can be scoped; don't guess at what to add.

---

## Broader suggestions (not from a specific screenshot — flagging from general review)

These are patterns worth fixing at the system level rather than per-screen,
since the same root causes keep resurfacing:

- **Systemic bottom-clearance bug.** Issues 1b and 2.7 are the same class of
  bug we already fixed once for Library's multi-select bar and the Identify
  screen. A single shared layout constant/hook, audited across *every*
  scrollable screen, would prevent this from recurring a fourth and fifth
  time as new screens get built.

  **Status: fixed in codex/ui-audit-completion**
- **No real light theme exists.** Every token in `theme/theme.ts` (`palette`,
  `glass`, `ambient`, `gradients`) is hardcoded dark. If a genuine light mode
  is wanted (Issue 2.3), that's a token-architecture change — a parallel
  light palette selected via a theme context — not a per-component fix. Worth
  scoping as its own project rather than folding into the dashboard modal fix.
- **Reorder-by-drag is a common enough pattern** that adopting a
  battle-tested library (e.g. `react-native-draggable-flatlist`, already
  compatible with the app's Expo/RN version) will likely produce a better
  result with less custom code than hand-rolling arrow buttons with correct
  boundary/disabled states.
- **Motion consistency audit.** The app has a `motion` token (durations/
  easings) but it's unclear how consistently every animated surface
  (modals, tab bar, toasts) actually pulls from it vs. inlining ad hoc
  timings. Worth a quick pass once the dashboard modal animation (2.5) is
  built, so the same values get reused rather than a third set of numbers.
- **Reduced-motion coverage.** `SanctuaryMode` and `Starwell` already check
  `AccessibilityInfo.isReduceMotionEnabled()`. Any new animation added for
  Issues 1 and 2.5 should follow that same guard for consistency.
- **Raw scraped titles keep resurfacing** (Issue 5.3, and the very first
  screenshot's "Continue listening" card). Now confirmed on **three**
  independent surfaces (Home card, Library cards, and Issue 10's broken
  lyrics matching) — this is a `displayTitle`/metadata-cleaning problem, not
  a per-card one, and it's no longer just cosmetic: it's actively breaking
  the lyrics feature (Issue 10). This should be the **highest-priority
  broader fix**, since it has a real functional cost, not just an
  appearance one.
- **"Full-screen takeover for what should be a compact contextual panel" is
  now a confirmed pattern across four separate surfaces:** the dashboard
  customize modal (Issue 2.1), the track options "…" menu (Issue 7), the
  "Up next" panel (Issue 11), and the "More"/Playback panel (Issue 12). Every
  one of these is a small, focused piece of content wrapped in a heavy
  full-height sheet. **Build one shared compact "glass sheet" component**
  (using the frosted-glass surface language already established this
  session) — sized to its content with a sensible max-height, not the full
  viewport — and migrate all four onto it, rather than redesigning each
  one's takeover behavior individually. This is the single highest-leverage
  fix in this whole list: one component change fixes four reported issues.
- **Accent-derived button contrast is a confirmed systemic bug, not three
  separate ones.** `useTrackAccent()` (`hooks/useTrackAccent.ts`) returns a
  raw color sampled from track artwork with no contrast/luminance floor, and
  three different surfaces use it directly as a solid button fill: the mini
  player's play button (first screenshot reviewed), Home's "Continue
  listening" resume button, and the Player screen's main transport button
  (Issue 9.2). For any track with a dark/warm-toned cover, the resulting
  button is nearly invisible. Fix once inside `useTrackAccent` (or a
  wrapper) by clamping the returned color to a minimum contrast ratio
  against the dark surfaces it gets placed on, rather than patching each of
  the three (and any future) call sites individually.

---

## Issue 15 — Starwell orb (Identify screen) needs a real visual upgrade, tied to the "Star Hollow" name itself

**Screen:** Identify → "What's playing?" (`RecognitionScreen.tsx`, the
`Starwell` component).

**Problem:** Open creative ask — wants the orb to feel significantly more
alive/elaborate, explicitly tied to the app's own name. No concrete
sub-items yet; needs a design direction agreed before implementation.

**Note:** this is the same "make the app's signature visual moments feel
alive" theme as Issue 9 (Player screen) and Issue 14 (Sanctuary ambient
scene) — now a third screen. Worth treating these three as one connected
design pass on the app's key "moments" rather than three unrelated asks.

---

## Issue 16 — 8-second listening window — confirmed exact, easy fix

**Screen:** Identify, while listening.

**Problem:** Confirmed exact — `frontend/src/screens/RecognitionScreen.tsx:35`:
`const LISTEN_SECONDS = 8;`.

**Suggested fix:** Increase this constant. The backend's recognition
timeout (`SMA_RECOGNITION_TIMEOUT_SECONDS=25` in `backend/.env`) already
gives plenty of headroom to extend the client-side listening window without
any backend changes — this is a one-line change once fixes start, not a
systems problem.

---

## Issue 17 — "Recognize sung/hummed lyrics, not just the exact recording" — major feature, needs feasibility research (not a simple fix)

**Screen:** Identify.

**Problem:** User wants recognition to work when a person sings or hums the
melody, not just when the original recording is playing nearby.

**Why this isn't a quick fix:** Confirmed the backend's recognition
(`backend/app/services/recognition/shazam_service.py`) runs through
`shazamio` — the real Shazam API, which works by **acoustic fingerprint
matching** against the exact original studio recording. This technology
fundamentally cannot recognize someone singing or humming a melody — a sung
version has a completely different audio fingerprint than the produced
track, so it will never match, regardless of listening duration (Issue 16
doesn't help this one).

What's being asked for — "hum to search" — is a genuinely different
technology (melody-contour matching, not audio fingerprinting; this is what
Google's "Hum to Search" and SoundHound use). Shazam itself doesn't offer
this.

**Status: needs a research/feasibility pass, not a suggested fix.** Before
this goes in any fix queue, need to determine: is there a usable/affordable
third-party service that supports melody-based recognition we could
integrate, or would this require building melody-matching in-house (a real
ML undertaking, not a config change)? Don't scope implementation work until
that's answered.

---

## Issue 18 — Activity screen: functionally fine, just needs the same design pass as everything else

**Screen:** Activity (`JobsScreen.tsx`), History list.

**Problem:** No bugs — the History cards (status pill, checkmark, source
badge, "Ready in your library") work correctly as-is. User wants this
screen brought in line with the visual language established by the rest of
this session's edits (frosted-glass surfaces, navy-sky background) rather
than left on the older flat-card style.

**Note (reinforces an existing issue, not new):** "Take It Off – Kesha
#kesha #lyrics_songs #lyricsedit …" appears here too — the **fourth**
confirmed surface with the raw-scraped-title problem (Home, Library, Issue
10's broken lyrics matching, and now Activity). Further strengthens that as
the top-priority broader fix already flagged above.

---

## Issue 19 — "Add to playlist" panel — 5th confirmed occurrence of the full-screen-takeover pattern

**Screen:** Library → track "…" menu → "Add to playlist".

**Problem:** Same full-takeover pattern as Issues 2.1, 7, 11, and 12 — a
small, focused piece of content (a text input and a "create playlist"
button) wrapped in a heavy sheet. This is now the **fifth** confirmed
occurrence.

**Suggested fix:** Same as the others — migrate onto the shared compact
glass-sheet component recommended in Broader Suggestions below, once built.

**Status: fixed in codex/ui-audit-completion**

---

## Issue 20 — Playlist sheets use a hardcoded off-theme background color — confirmed root cause

**Screens:** "Add to playlist" panel and the Playlist detail view (both
share the same underlying sheet style).

**Problem:** Traced exactly. `frontend/src/components/library/LibrarySheets.tsx:493-495`
— the shared `sheet` style has `backgroundColor: '#1B1426'`, a **literal
hardcoded dark plum/purple hex**, completely disconnected from the theme
tokens (`colors.surface`, `glass.fill`, etc.) used everywhere else in the
app. This is exactly why these two panels visibly clash — a different hue
family entirely — against the navy/forest theme built everywhere else this
session.

**Suggested fix:** Replace `#1B1426` with the appropriate theme token so
these sheets match the rest of the app. Check whether other sheets in this
same file share the `sheet` style — if so, one fix resolves all of them at
once.

**Status: fixed in codex/ui-audit-completion**

**Also reinforces two already-logged issues (not new numbers), both
confirmed again on this screen:**
- Blank/black playlist thumbnails — same root cause as Issue 5.2, now
  confirmed on the playlist card and the playlist-detail track row too.
- Raw scraped title — "Take It Off – Kesha #kesha #lyrics_songs
  #lyricsedit #popmusic" again, now the fifth/sixth confirmed surface.

---

## Issue 21 — Auto-rename Telegram imports — partially already exists, with real gaps

**Problem (as requested):** files downloaded via Telegram get random
number/letter filenames; wants something to "listen to them" and sort them
into the right category automatically.

**This is not starting from zero.** Found `auto_name_media()` in
`backend/app/workers/job_engine.py:199` — it already runs Shazam
recognition automatically on freshly imported audio with garbage titles.
The code's own comment says: *"Telegram music is the main source of
gibberish names (filename stems)"* — this was built specifically for this
exact problem.

**Confirmed real gaps in the existing implementation:**
1. **Capped at 10 tracks per import batch** (`AUTO_NAME_CAP = 10` in
   `job_engine.py`). Bulk-importing more than 10 from Telegram leaves the
   rest with gibberish names permanently, unless someone manually visits
   Settings → "Name untitled tracks" (which runs the same recognition via
   `POST /recognitions/library`, uncapped, on demand).
2. **Completely skips video files** — the eligibility check explicitly
   requires `media.media_type == AUDIO`. Video imports from Telegram never
   get auto-named at all.
3. **"Sort into the right category" isn't addressed by this at all.** The
   existing feature only fixes display title/artist via Shazam matching —
   there's no playlist/genre/category sorting logic anywhere in the
   codebase. This part is a genuine new feature.
   **Needs scoping before implementation:** what should "category" mean
   here — auto-create/assign genre-based playlists? Sort by media type?
   Something else? Don't guess at this; ask before building it.

**Suggested fix for the confirmed gaps:** raise or remove `AUTO_NAME_CAP`
(or queue the remainder instead of dropping them), and extend eligibility
to cover video-type media too (video recognition would need its own audio
extraction path if `shazam_service` currently assumes an audio file — worth
checking before assuming this is a one-line change).

---

## Issue 22 — Rich track details display — data already exists, needs a real UI for it

**Problem (as requested):** wants song details (release year, artist, etc.)
displayed well and automatically, not just minimally.

**Good news:** the data already exists. `Media` already has `album`,
`genre`, `release_year`, and `is_remix` fields (`backend/app/models/media.py`,
populated from Shazam's metadata on recognition) — but they're currently
only folded into small caption text like "Ambient · 2024" in
`LibraryMediaView.tsx` and `PlayerScreen.tsx`. There's no dedicated "track
details" view presenting this information well.

**Suggested fix:** build a proper details section/panel showing all
available metadata clearly (album, genre, release year, remix flag, source,
etc.) rather than a truncated caption line. **This connects directly to
Issue 12** — the user already asked for "more" content in the Player
screen's "More" panel; a track details section is a natural fit for that
same panel once it's rebuilt as a compact glass sheet.

---

## Deferred (explicitly, per the user)

- **Issue 3.4 (Telegram connection persistence)** — user wants to discuss
  what should happen when connecting to Telegram separately, later. **Do
  not scope or implement changes to Telegram connection/auth flow** until
  that conversation happens.
- **Issue 17 (hum/sing recognition)** — needs a feasibility/research pass
  before any implementation work. Do not attempt to build this from the
  fix list below.

---

## Suggested working order (for whoever picks this up)

Numeric order isn't fix priority. Suggested order, grouped by leverage and
risk:

1. **Confirmed bugs/correctness first:**
   - Issue 4 (cross-account state leak — privacy/correctness bug)
   - Issue 8 (selection bar overlaps tab bar — confirmed root cause)
   - Issue 5.1 (square shadow behind play button — confirmed root cause)
2. **High-leverage broader fixes (each resolves multiple logged issues at once):**
   - Title/metadata cleaning in `displayTitle` (fixes Issues 5.3, 10, and
     the repeated-title notes across Issues 18/20 — six+ surfaces at once)
   - Shared compact glass-sheet component (fixes Issues 2.1, 7, 11, 12, 19
     — five surfaces at once)
   - `useTrackAccent` contrast floor (fixes Issue 9.2 and the mini-player /
     Home resume-button contrast bugs — three surfaces at once)
   - Playlist sheet hardcoded color (Issue 20 — quick, isolated)
3. **Then the remaining confirmed/scoped issues:** 1, 1b, 2 (remaining
   sub-items), 3 (excluding 3.4), 5.2, 6, 13, 16, 21 (the confirmed-gap
   parts only)
4. **Then the open design asks** (need a direction agreed, not just a
   ticket): 9.1, 14 (visual upgrade part), 15
5. **Skip entirely for now:** Issue 17, Issue 3.4 (see Deferred above), and
   anything marked "needs clarification" until that clarification happens
   (Issue 8b, Issue 12's specific feature list, Issue 21's category-sorting
   scope, Issue 22's exact panel design).

---

## Status

All issues above: **not started**. This file is the source of truth for what
to fix — update an issue's status inline (e.g. `**Status: fixed in <commit>**`)
as work lands, rather than deleting resolved issues, so there's a record of
what's been done.
