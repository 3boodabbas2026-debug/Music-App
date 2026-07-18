import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastState = {
  toasts: Toast[];
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
};

let counter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show(message, tone = 'info') {
    const id = ++counter;
    set({ toasts: [...get().toasts, { id, message, tone }] });
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Imperative helper for non-component call sites. */
export const toast = (message: string, tone: ToastTone = 'info') =>
  useToastStore.getState().show(message, tone);
