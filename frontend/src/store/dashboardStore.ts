import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sma.dashboard.v1';

export type WidgetId =
  | 'continueListening'
  | 'pinned'
  | 'onRepeat'
  | 'queue'
  | 'recent'
  | 'favorites'
  | 'stats'
  | 'telegram'
  | 'offline'
  | 'quickActions';

export type Density = 'compact' | 'spacious';
export type AccentStyle = 'forest' | 'cosmic';

export const WIDGET_LABELS: Record<WidgetId, { title: string; description: string }> = {
  continueListening: { title: 'Continue listening', description: 'Pick up your last session where you left off' },
  pinned: { title: 'Pinned', description: 'Up to six tracks or collections pinned for instant access' },
  onRepeat: { title: 'On repeat', description: 'What you have actually been playing lately' },
  queue: { title: 'Download queue', description: 'Active and recent download jobs' },
  recent: { title: 'Recent downloads', description: 'Freshly added tracks and videos' },
  favorites: { title: 'Favorite collections', description: 'Tracks you have starred' },
  stats: { title: 'Library stats', description: 'Audio, video and auto-named counts' },
  telegram: { title: 'Telegram connection', description: 'Whether Telegram import is linked' },
  offline: { title: 'Offline availability', description: 'Connection status and offline-saved tracks' },
  quickActions: { title: 'Quick actions', description: 'Shortcuts to scan, import and manage' },
};

const DEFAULT_ORDER: WidgetId[] = [
  'continueListening',
  'pinned',
  'onRepeat',
  'queue',
  'recent',
  'stats',
  'favorites',
  'offline',
  'telegram',
  'quickActions',
];

type WidgetConfig = { id: WidgetId; visible: boolean };

type DashboardState = {
  hydrated: boolean;
  order: WidgetConfig[];
  density: Density;
  accentStyle: AccentStyle;
  hydrate: () => Promise<void>;
  toggleWidget: (id: WidgetId) => void;
  moveWidget: (id: WidgetId, direction: -1 | 1) => void;
  setDensity: (density: Density) => void;
  setAccentStyle: (style: AccentStyle) => void;
};

function defaultOrder(): WidgetConfig[] {
  return DEFAULT_ORDER.map((id) => ({ id, visible: true }));
}

async function persist(state: Pick<DashboardState, 'order' | 'density' | 'accentStyle'>) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Dashboard layout is a nicety — never let persistence break the app.
  }
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  hydrated: false,
  order: defaultOrder(),
  density: 'spacious',
  accentStyle: 'forest',

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge in any new widget ids shipped since the user last customised their layout.
        const known = new Set((parsed.order as WidgetConfig[]).map((w) => w.id));
        const merged = [...(parsed.order as WidgetConfig[]), ...defaultOrder().filter((w) => !known.has(w.id))];
        set({ order: merged, density: parsed.density ?? 'spacious', accentStyle: parsed.accentStyle ?? 'forest' });
      }
    } finally {
      set({ hydrated: true });
    }
  },

  toggleWidget(id) {
    const order = get().order.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
    set({ order });
    void persist({ order, density: get().density, accentStyle: get().accentStyle });
  },

  moveWidget(id, direction) {
    const order = [...get().order];
    const index = order.findIndex((w) => w.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    set({ order });
    void persist({ order, density: get().density, accentStyle: get().accentStyle });
  },

  setDensity(density) {
    set({ density });
    void persist({ order: get().order, density, accentStyle: get().accentStyle });
  },

  setAccentStyle(accentStyle) {
    set({ accentStyle });
    void persist({ order: get().order, density: get().density, accentStyle });
  },
}));
