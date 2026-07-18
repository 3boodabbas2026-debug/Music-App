import { create } from 'zustand';

import * as offlineMedia from '../services/storage/offlineMedia';
import { useAuthStore } from './authStore';

type SignOutState = {
  visible: boolean;
  offlineCount: number;
  loading: boolean;
  request: () => Promise<void>;
  cancel: () => void;
  confirm: () => Promise<void>;
};

export const useSignOutStore = create<SignOutState>((set, get) => ({
  visible: false,
  offlineCount: 0,
  loading: false,
  async request() {
    const entries = await offlineMedia.listOffline().catch(() => []);
    set({ visible: true, offlineCount: entries.length });
  },
  cancel() {
    if (!get().loading) set({ visible: false });
  },
  async confirm() {
    if (get().loading) return;
    set({ loading: true });
    try {
      await useAuthStore.getState().logout();
      set({ visible: false, offlineCount: 0 });
    } finally {
      set({ loading: false });
    }
  },
}));

export const requestSignOut = () => useSignOutStore.getState().request();
