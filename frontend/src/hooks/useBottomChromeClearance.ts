import { layout } from '../theme/tokens';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useVideoPlayerStore } from '../store/videoPlayerStore';
import { useResponsive } from './useResponsive';

/**
 * The compact expand control is a 44px touch target plus the dock's existing
 * bottom gap. Keeping this derived from the shared tokens prevents a second
 * screen-specific clearance value from drifting away from the shell.
 */
const COLLAPSED_DOCK_CLEARANCE = 44 + layout.dockBottomGap;

/** The portion of tabBarClearance reserved for the floating mini player. */
const MINI_PLAYER_CLEARANCE = layout.tabBarClearance - layout.dockClearance;

/** Visible mobile dock clearance, suitable for floating controls above it. */
export function useDockClearance(): number {
  const { isDesktop } = useResponsive();
  const dockCollapsed = useUiStore((state) => state.dockCollapsed);

  if (isDesktop) return 0;
  return dockCollapsed ? COLLAPSED_DOCK_CLEARANCE : layout.dockClearance;
}

/**
 * Bottom padding for tab-hosted scroll content. It follows the visible dock
 * and only reserves mini-player room while a track is actually mounted.
 * Safe-area padding remains the responsibility of the screen container.
 */
export function useBottomChromeClearance(): number {
  const dockClearance = useDockClearance();
  const hasAudioMiniPlayer = usePlayerStore((state) => !!state.currentMedia);
  const hasVideoMiniPlayer = useVideoPlayerStore((state) => state.mode === 'mini');

  return dockClearance + (hasAudioMiniPlayer || hasVideoMiniPlayer ? MINI_PLAYER_CLEARANCE : 0);
}

/** Extra height occupied by focused, screen-specific bottom chrome (for
 * example Library's multi-select actions). Mini players add this to their
 * dock/safe-area position instead of learning about every screen directly. */
export function usePlayerChromeBottomOffset(): number {
  return useUiStore((state) => state.bottomOverlayOffset);
}
