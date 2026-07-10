import { create } from 'zustand';

export type VideoMode = 'closed' | 'expanded' | 'mini';

type VideoPlayerState = {
  mediaId: string | null;
  mode: VideoMode;
  /** Bumped whenever something else (audio starting) needs the video
   * paused — GlobalVideoStage watches this and calls player.pause(). It's a
   * signal, not a boolean, so requesting a pause twice in a row (e.g. two
   * audio tracks queued back-to-back) still fires the effect each time. */
  pauseRequestedAt: number | null;
  /** Opens (or switches to) a video in fullscreen. */
  openExpanded: (mediaId: string) => void;
  /** Shrinks the fullscreen player into the floating dockable mini window — playback keeps running. */
  minimize: () => void;
  /** Restores the mini window back to fullscreen. */
  expand: () => void;
  /** Stops playback entirely and hides both the fullscreen and mini views. */
  close: () => void;
  setMediaId: (mediaId: string) => void;
  /** Audio is about to play — pause the video if one is open so the two never sound at once. */
  requestPause: () => void;
};

export const useVideoPlayerStore = create<VideoPlayerState>((set) => ({
  mediaId: null,
  mode: 'closed',
  pauseRequestedAt: null,

  openExpanded(mediaId) {
    set({ mediaId, mode: 'expanded' });
  },
  minimize() {
    set((s) => (s.mediaId ? { mode: 'mini' } : s));
  },
  expand() {
    set((s) => (s.mediaId ? { mode: 'expanded' } : s));
  },
  close() {
    set({ mediaId: null, mode: 'closed' });
  },
  setMediaId(mediaId) {
    set({ mediaId });
  },
  requestPause() {
    set((s) => (s.mediaId && s.mode !== 'closed' ? { pauseRequestedAt: Date.now() } : s));
  },
}));
