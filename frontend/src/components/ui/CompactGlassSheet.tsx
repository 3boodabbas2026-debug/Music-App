import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useResponsive } from '../../hooks/useResponsive';
import { colors, glass, motion, radii, spacing, typography } from '../../theme/tokens';
import { GlassPanel } from './GlassPanel';
import { IconButton } from './IconButton';

export type SheetAnchor = { x: number; y: number };

type Props = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  accessibilityLabel: string;
  closeAccessibilityLabel?: string;
  header?: ReactNode;
  eyebrow?: string;
  identity?: ReactNode;
  footer?: ReactNode;
  anchor?: SheetAnchor | null;
  maxWidth?: number;
  maxHeightRatio?: number;
  scrollable?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/**
 * Shared contextual surface for focused controls. It portals above shell
 * chrome, stays content-sized with a bounded scroll region, and uses the
 * same navy glass treatment on mobile and desktop.
 */
export function CompactGlassSheet({
  visible,
  onClose,
  accessibilityLabel,
  closeAccessibilityLabel = 'Close panel',
  header,
  eyebrow,
  identity,
  footer,
  anchor,
  maxWidth = 480,
  maxHeightRatio = 0.78,
  scrollable = false,
  bodyStyle,
  contentContainerStyle,
  testID,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { isDesktop } = useResponsive();
  const [rendered, setRendered] = useState(visible);
  const reduceMotion = useReducedMotion();
  const [panelHeight, setPanelHeight] = useState(0);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const panelRef = useRef<View>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasVisible = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      if (Platform.OS === 'web') openerRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        if (Platform.OS === 'web') {
          const panel = panelRef.current as unknown as HTMLElement | null;
          const first = panel?.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          (first ?? panel)?.focus?.();
        } else {
          const node = findNodeHandle(panelRef.current);
          if (node) AccessibilityInfo.setAccessibilityFocus(node);
        }
      }, 60);
      wasVisible.current = true;
      return () => clearTimeout(timer);
    }
    if (!visible && wasVisible.current) {
      wasVisible.current = false;
      if (Platform.OS === 'web') {
        const opener = openerRef.current;
        setTimeout(() => opener?.isConnected && opener.focus(), 0);
      }
    }
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current as unknown as HTMLElement | null;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, visible]);

  useEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setRendered(true);
      if (reduceMotion) {
        progress.setValue(1);
        return;
      }
      progress.setValue(0);
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: motion.duration.base,
        easing: Easing.bezier(...motion.easing.decelerate),
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }

    if (reduceMotion) {
      progress.setValue(0);
      setRendered(false);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: motion.duration.fast,
      easing: Easing.bezier(...motion.easing.accelerate),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => finished && setRendered(false));
    return () => animation.stop();
  }, [progress, reduceMotion, visible]);

  if (!rendered) return null;

  const sideMargin = spacing.md;
  const panelWidth = Math.min(maxWidth, width - sideMargin * 2);
  const maxHeight = Math.max(240, height * maxHeightRatio - insets.top - insets.bottom);
  const anchorStyle: ViewStyle | null = isDesktop && anchor
    ? (() => {
        const left = Math.max(sideMargin, Math.min(width - panelWidth - sideMargin, anchor.x - panelWidth + 28));
        const below = anchor.y + spacing.sm;
        const measuredHeight = panelHeight || Math.min(maxHeight, 420);
        const top = below + measuredHeight <= height - sideMargin
          ? below
          : Math.max(sideMargin, anchor.y - measuredHeight - spacing.sm);
        return { position: 'absolute', left, top };
      })()
    : null;

  const anchoredLeft = typeof anchorStyle?.left === 'number' ? anchorStyle.left : width / 2 - panelWidth / 2;
  const anchoredTop = typeof anchorStyle?.top === 'number' ? anchorStyle.top : height / 2;
  const desktopOriginX = isDesktop && anchor
    ? Math.max(-28, Math.min(28, anchor.x - (anchoredLeft + panelWidth / 2)))
    : 0;
  const desktopOriginY = isDesktop && anchor ? (anchor.y <= anchoredTop ? -10 : 10) : 0;
  const enterTranslateX = reduceMotion ? 0 : desktopOriginX;
  const enterTranslateY = reduceMotion ? 0 : isDesktop ? desktopOriginY : 42;
  const enterScale = reduceMotion ? 1 : isDesktop ? 0.965 : 1;

  const animatedPanelStyle = {
    opacity: progress,
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [enterTranslateX, 0] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [enterTranslateY, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [enterScale, 1] }) },
    ],
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          isDesktop ? styles.rootDesktop : styles.rootMobile,
          !isDesktop && { paddingBottom: insets.bottom + spacing.md },
        ]}
        accessibilityViewIsModal
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, isDesktop ? 0.76 : 1] }) }]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeAccessibilityLabel}
        />
        <Animated.View
          onLayout={(event) => setPanelHeight(Math.ceil(event.nativeEvent.layout.height))}
          style={[
            styles.animatedPanel,
            { width: panelWidth, maxHeight },
            anchorStyle,
            animatedPanelStyle,
          ]}
        >
          <GlassPanel style={styles.panel} variant="modal">
            <View
              ref={panelRef}
              testID={testID}
              role="dialog"
              tabIndex={-1}
              accessibilityViewIsModal
              accessibilityLabel={accessibilityLabel}
              style={styles.content}
            >
              <View style={styles.headerRow}>
                <View style={styles.headerContent}>
                  {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
                  {header}
                </View>
                <IconButton icon="close" accessibilityLabel={closeAccessibilityLabel} onPress={onClose} />
              </View>
              {identity ? <View style={styles.identity}>{identity}</View> : null}
              <View pointerEvents="none" style={styles.divider} />
              {scrollable ? (
                <ScrollView
                  style={[styles.scrollBody, bodyStyle]}
                  contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {children}
                </ScrollView>
              ) : (
                <View style={[styles.body, bodyStyle]}>{children}</View>
              )}
              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </View>
          </GlassPanel>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.md },
  rootMobile: { justifyContent: 'flex-end', alignItems: 'center' },
  rootDesktop: { justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.md },
  backdrop: { ...StyleSheet.absoluteFill as object, backgroundColor: 'rgba(2,5,10,0.68)' },
  // The full-screen dismiss Pressable is absolutely positioned. Keep the
  // panel in a higher stacking context so its controls remain clickable on
  // React Native Web (and therefore in the Capacitor app).
  animatedPanel: { position: 'relative', flexShrink: 1, zIndex: 1 },
  panel: { width: '100%', maxHeight: '100%', borderRadius: radii.sheet },
  content: { flexShrink: 1, padding: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerContent: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { ...typography.eyebrow, fontSize: 9, lineHeight: 13, color: colors.cyan },
  identity: { marginTop: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm, backgroundColor: glass.strokeStrong },
  body: { flexShrink: 1 },
  scrollBody: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: spacing.sm },
  footer: {
    marginHorizontal: -spacing.md,
    marginBottom: -spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: glass.stroke,
    backgroundColor: glass.fillDeep,
  },
});
