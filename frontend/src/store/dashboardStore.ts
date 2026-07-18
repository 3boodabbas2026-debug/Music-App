import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sh.dashboard.v1';

export type WidgetId =
  | 'import'
  | 'inProgress'
  | 'continue'
  | 'recent'
  | 'pinned'
  | 'offline'
  | 'stats'
  | 'quickActions';

export type DashboardDensity = 'spacious' | 'compact';
export type DashboardAccent = 'forest' | 'cosmic';

export const WIDGET_META: Record<WidgetId, { label: string; description: string }> = {
  import: { label: 'Import a link', description: 'Paste a link and pull it into your library' },
  inProgress: { label: 'In progress', description: 'Live download and recognition jobs' },
  continue: { label: 'Continue listening', description: 'Pick up the track you left off' },
  recent: { label: 'Recently added', description: 'The newest arrivals in your hollow' },
  pinned: { label: 'Pinned', description: 'Your hand-picked quick-access shelf' },
  offline: { label: 'Offline shelf', description: 'What is saved on this device, and your connection' },
  stats: { label: 'Listening stats', description: 'Library counts and minutes listened' },
  quickActions: { label: 'Quick actions', description: 'Shortcuts to Identify, Telegram, Replay and Activity' },
};

export const DEFAULT_ORDER: WidgetId[] = [
  'import',
  'inProgress',
  'continue',
  'recent',
  'pinned',
  'offline',
  'stats',
  'quickActions',
];

type DashboardState = {
  hydrated: boolean;
  /** Render order of every widget, visible or not. Always a permutation of DEFAULT_ORDER. */
  order: WidgetId[];
  hidden: WidgetId[];
  density: DashboardDensity;
  accent: DashboardAccent;
  hydrate: () => Promise<void>;
  toggleWidget: (id: WidgetId) => void;
  moveWidget: (id: WidgetId, direction: -1 | 1) => void;
  setDensity: (density: DashboardDensity) => void;
  setAccent: (accent: DashboardAccent) => void;
  reset: () => void;
  resetSession: () => Promise<void>;
};

type Persisted = Pick<DashboardState, 'order' | 'hidden' | 'density' | 'accent'>;

async function persist(state: Persisted) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Dashboard layout is a preference — never let persistence break the app.
  }
}

/** Drops unknown ids and appends any widgets added after the user last saved,
 * so a stored layout survives app updates that introduce new widgets. */
function normalizeOrder(saved: unknown): WidgetId[] {
  const known = Array.isArray(saved) ? (saved.filter((id) => DEFAULT_ORDER.includes(id as WidgetId)) as WidgetId[]) : [];
  const missing = DEFAULT_ORDER.filter((id) => !known.includes(id));
  return [...known, ...missing];
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  hydrated: false,
  order: DEFAULT_ORDER,
  hidden: [],
  density: 'spacious',
  accent: 'forest',

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Persisted>;
        set({
          order: normalizeOrder(saved.order),
          hidden: Array.isArray(saved.hidden)
            ? (saved.hidden.filter((id) => DEFAULT_ORDER.includes(id as WidgetId)) as WidgetId[])
            : [],
          density: saved.density === 'compact' ? 'compact' : 'spacious',
          accent: saved.accent === 'cosmic' ? 'cosmic' : 'forest',
        });
      }
    } finally {
      set({ hydrated: true });
    }
  },

  toggleWidget(id) {
    const hidden = get().hidden.includes(id) ? get().hidden.filter((item) => item !== id) : [...get().hidden, id];
    set({ hidden });
    const { order, density, accent } = get();
    void persist({ order, hidden, density, accent });
  },

  moveWidget(id, direction) {
    const order = [...get().order];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    set({ order });
    const { hidden, density, accent } = get();
    void persist({ order, hidden, density, accent });
  },

  setDensity(density) {
    set({ density });
    const { order, hidden, accent } = get();
    void persist({ order, hidden, density, accent });
  },

  setAccent(accent) {
    set({ accent });
    const { order, hidden, density } = get();
    void persist({ order, hidden, density, accent });
  },

  reset() {
    const { accent } = get();
    set({ order: DEFAULT_ORDER, hidden: [], density: 'spacious' });
    void persist({ order: DEFAULT_ORDER, hidden: [], density: 'spacious', accent });
  },

  async resetSession() {
    set({ hydrated: false, order: DEFAULT_ORDER, hidden: [], density: 'spacious', accent: 'forest' });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // In-memory account data is already gone; storage cleanup is best-effort.
    }
  },
}));
