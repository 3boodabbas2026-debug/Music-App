import { create } from 'zustand';

type UiState = {
  /** Mobile-only bottom navigation state. Kept global so screen clearance can follow the visible dock. */
  dockCollapsed: boolean;
  toggleDockCollapsed: () => void;
  /** Height occupied by a focused screen's contextual bottom bar. Both audio
   * and video mini players consume this so neither can cover bulk actions. */
  bottomOverlayOffset: number;
  setBottomOverlayOffset: (offset: number) => void;
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  /** The compact account popover opened from the desktop rail's account row — never the full sidebar. */
  accountMenuOpen: boolean;
  toggleAccountMenu: () => void;
  closeAccountMenu: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  dockCollapsed: false,
  toggleDockCollapsed: () => set((state) => ({ dockCollapsed: !state.dockCollapsed })),
  bottomOverlayOffset: 0,
  setBottomOverlayOffset: (offset) => set({ bottomOverlayOffset: Math.max(0, offset) }),

  sidebarOpen: false,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),

  accountMenuOpen: false,
  toggleAccountMenu: () => set((s) => ({ accountMenuOpen: !s.accountMenuOpen })),
  closeAccountMenu: () => set({ accountMenuOpen: false }),
}));
