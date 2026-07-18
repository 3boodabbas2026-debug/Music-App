import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLatestAnnouncement } from '../../hooks/useAnnouncements';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { useToastStore } from '../../store/toastStore';
import { spacing } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AnnouncementBanner } from './AnnouncementBanner';
import { Toaster } from './Toaster';
import { UpdateBanner } from './UpdateBanner';

type Notice = { key: string; priority: number; render: () => ReactNode };

function NoticeSlot({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) { progress.setValue(1); return; }
    Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress, reduceMotion]);
  return (
    <Animated.View style={[styles.slot, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** One safe-area-aware lane that reserves space for every global notice. */
export function GlobalNoticeStack() {
  const insets = useSafeAreaInsets();
  const update = useAppUpdate();
  const { announcement, dismiss: dismissAnnouncement } = useLatestAnnouncement();
  const toasts = useToastStore((state) => state.toasts);
  const [dismissedUpdateId, setDismissedUpdateId] = useState<string | null>(null);

  const notices = useMemo(() => {
    const candidates: Array<Notice | null> = [
      update.available && update.id !== dismissedUpdateId
        ? {
            key: `update-${update.id}`,
            priority: 100,
            render: () => <UpdateBanner update={update} onDismiss={() => setDismissedUpdateId(update.id)} />,
          }
        : null,
      announcement
        ? {
            key: `announcement-${announcement.id}`,
            priority: 90,
            render: () => <AnnouncementBanner announcement={announcement} onDismiss={dismissAnnouncement} />,
          }
        : null,
      ...toasts.map((toast, index) => ({
        key: `toast-${toast.id}`,
        priority: (toast.tone === 'error' ? 80 : toast.tone === 'success' ? 70 : 60) - index,
        render: () => <Toaster toast={toast} />,
      })),
    ];
    return candidates
      .filter((notice): notice is Notice => notice !== null)
      .sort((a, b) => b.priority - a.priority);
  }, [announcement, dismissAnnouncement, dismissedUpdateId, toasts, update]);

  if (notices.length === 0) return null;
  const visibleNotices = notices.slice(0, 3);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.lane, { paddingTop: insets.top + spacing.sm }]}
      accessibilityLabel={`${notices.length} app ${notices.length === 1 ? 'notice' : 'notices'}`}
    >
      {visibleNotices.map((notice) => <NoticeSlot key={notice.key}>{notice.render()}</NoticeSlot>)}
    </View>
  );
}

const styles = StyleSheet.create({
  lane: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
    zIndex: 1200,
  },
  slot: { width: '100%', maxWidth: 500, alignItems: 'center' },
});
