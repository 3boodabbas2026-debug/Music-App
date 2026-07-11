# Duskglen product rebuild

## Product position

Duskglen is a private music utility that turns links, nearby audio, and
Telegram files into a personal, playable collection. It should not imitate a
streaming catalog it does not own. The premium experience comes from making
capture, identification, organization, and playback feel immediate.

The design direction is **dusk editorial**: near-black plum surfaces, clear
solid typography, one warm ember action color, and artwork-led color only when
music is present. Atmosphere supports content; it never competes with it.

## Information architecture

The primary destinations are:

1. **Today** — capture a link, resume listening, and see only useful recent work.
2. **Library** — search, filter, organize, and play the personal collection.
3. **Identify** — recognize nearby music and recover through text search.
4. **Activity** — understand, cancel, retry, and review background work.

Playlists live inside Library. Telegram, Replay, Settings, Player, and Admin are
secondary destinations in the account/navigation sheet.

## Feature decisions

| Feature | Decision | Why |
| --- | --- | --- |
| Authentication | Improve | Keep the simple two-screen flow; replace fantasy copy with clear value and make validation/state feedback consistent. |
| Link downloads | Keep + improve | This is the fastest path to value. It remains the hero action on Today with fewer competing controls. |
| Configurable dashboard | Remove | Nine configurable widgets create empty-state sprawl before users have music. Conditional, opinionated sections are clearer and cheaper to maintain. |
| Library | Improve | Keep grid/list, bulk selection, metadata, offline, and filters; establish scope first and refinement second so controls do not overwhelm content. |
| Favorites and pins | Merge into collection UX | They remain distinct behaviors, but appear as filters/actions instead of separate destinations. |
| Playlists | Keep inside Library | Playlists are organization, not a top-level world. Existing creation and play-all flows remain. |
| Player | Replace presentation | Album art and track identity become primary. Queue, lyrics, sleep, speed, favorite, and pin move into clear secondary layers. |
| 3D Moonlight player stage | Remove from playback | WebGL geometry made the brand more prominent than the music and added dependency/runtime cost. A lightweight moon remains in brand and identification moments. |
| Queue | Improve | Keep click-to-play and removal; present it in a focused bottom sheet with consistent artwork. |
| Lyrics | Keep + improve | Synced seeking is genuinely valuable. It shares the player sheet with Queue. |
| Identify | Keep + improve | A distinctive core feature. Language, target size, result hierarchy, and recovery are clarified. |
| Downloads and job history | Merge as Activity | One place for active work and history is easier to understand than dashboard widgets plus a hidden Jobs screen. |
| Offline | Keep + harden | Cached library, queue, and saved tracks are core trust features; offline state stays visible but not dominant. |
| Telegram import | Keep as secondary | Powerful for the users who need it, but too specialized for primary navigation. |
| Replay | Keep as secondary | Valuable after history exists; it should not consume first-use attention. |
| Settings | Improve | Group by playback, storage/offline, account, and support; keep operational tools out of the main journey. |
| Admin | Keep as a utility surface | It is role-gated operational software, not part of the consumer navigation hierarchy. |
| Streaming-style recommendations | Do not fake | There is no recommendation catalog/backend. “Recently played,” favorites, and on-repeat remain honest personalization. |

## Design system

- Typography: Sora 400/500/600/700 with a compact editorial scale.
- Spacing: a 4-point base with 8, 12, 16, 20, 24, 32, 40, 48, and 64 point steps.
- Shape: 10-point artwork, 14-point controls, 18–22 point surfaces, pill only for compact selectors.
- Color: neutral ink backgrounds, elevated plum surfaces, ember primary action,
  lavender secondary signal, gold only for pins/premium moments.
- Motion: 120–360 ms for direct feedback and transitions; reduced-motion is
  respected. Default screen backgrounds are static.
- Touch: every control exposes a semantic label/state and at least a 44-point target.

## Engineering decisions

- Treat the shipped product as what it is: an Expo web export hosted in a
  Capacitor WebView. Avoid native-only complexity that does not benefit that runtime.
- Centralize remote art in an Expo Image primitive with memory/disk caching,
  lazy loading, recycling keys, and cross-dissolve transitions.
- Remove WebGL/Three.js from the brand visual and keep animation on composited
  transforms/opacity.
- Keep large collections virtualized and prevent per-tick player state from
  re-rendering whole screens.
- Preserve API contracts while fixing transactional integrity and background-job cleanup.

## Trade-offs

The rebuild intentionally removes some ambient spectacle and dashboard
personalization. In return, the app is easier to understand on first launch,
faster in the APK WebView, more consistent across every screen, and far easier
to extend without duplicating presentation logic.
