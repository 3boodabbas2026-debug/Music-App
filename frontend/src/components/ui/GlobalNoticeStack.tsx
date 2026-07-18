import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLatestAnnouncement } from '../../hooks/useAnnouncements';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { useToastStore } from '../../store/toastStore';
import { spacing } from '../../theme/tokens';
import { AnnouncementBanner } from './AnnouncementBanner';
import { Toaster } from './Toaster';
import { UpdateBanner } from './UpdateBanner';

type Notice = { key: string; priority: number; render: () => ReactNode };

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
      {visibleNotices.map((notice) => <View key={notice.key} style={styles.slot}>{notice.render()}</View>)}
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
