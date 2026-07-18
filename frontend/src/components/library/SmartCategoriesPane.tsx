import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Media } from '../../services/api/types';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';
import {
  groupMediaByCategory,
  MEDIA_CATEGORIES,
  type MediaCategoryId,
} from '../../utils/mediaCategory';
import { Artwork } from '../ui/Artwork';
import { GlassPanel } from '../ui/GlassPanel';
import { PressableScale } from '../ui/PressableScale';
import { EmptyState } from '../ui/EmptyState';

type Props = {
  items: readonly Media[];
  bottomClearance: number;
  onSelect: (category: MediaCategoryId) => void;
  onNameTracks: () => void;
  onReturnAll: () => void;
};

export function SmartCategoriesPane({ items, bottomClearance, onSelect, onNameTracks, onReturnAll }: Props) {
  const { width } = useWindowDimensions();
  const groups = groupMediaByCategory(items);
  const columns = width >= 980 ? 3 : 2;
  const gap = spacing.md;
  const horizontalPadding = 0;
  const availableWidth = Math.min(width, 1160) - spacing.xl * 2 - horizontalPadding * 2;
  const cardWidth = Math.max(150, (availableWidth - gap * (columns - 1)) / columns);
  const hasCategories = MEDIA_CATEGORIES.some((category) => groups[category.id].length > 0);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: bottomClearance }]}
    >
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons name="sparkles" size={18} color={colors.cyan} />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.introTitle}>Smart categories</Text>
          <Text style={styles.introBody}>
            Live views from recognized genre details. Nothing is moved and no playlists are created behind your back.
          </Text>
        </View>
      </View>

      {!hasCategories ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="pricetags-outline"
            motif="shelf"
            title="Categories need track details"
            subtitle="Star Hollow builds these views from genre metadata. Name recognized tracks or edit their Genre field to create categories."
            actionLabel="Name tracks"
            onAction={onNameTracks}
          />
          <PressableScale
            onPress={onReturnAll}
            accessibilityLabel="Return to all library tracks"
            style={styles.returnButton}
          >
            <Text style={styles.returnLabel}>Return to All</Text>
          </PressableScale>
        </View>
      ) : <View style={styles.grid}>
        {MEDIA_CATEGORIES.map((category) => {
          const categoryItems = groups[category.id];
          if (categoryItems.length === 0) return null;
          const portraits = [
            categoryItems.find((item) => item.thumbnail_url) ?? categoryItems[0],
            categoryItems[1] ?? categoryItems[0],
            categoryItems[2] ?? categoryItems[1] ?? categoryItems[0],
          ];
          return (
            <PressableScale
              key={category.id}
              onPress={() => onSelect(category.id)}
              accessibilityLabel={`${category.label}, ${categoryItems.length} item${categoryItems.length === 1 ? '' : 's'}`}
              scaleTo={0.985}
              style={{ width: cardWidth }}
            >
              <GlassPanel style={styles.card}>
                <View style={styles.portrait}>
                  <View style={styles.dominantCover}>
                    <Artwork media={portraits[0]} size="100%" borderRadius={radii.cover} />
                  </View>
                  <View style={styles.echoColumn}>
                    <View style={styles.echoCover}>
                      <Artwork media={portraits[1]} size="100%" borderRadius={radii.cover} />
                    </View>
                    <View style={styles.echoCover}>
                      <Artwork media={portraits[2]} size="100%" borderRadius={radii.cover} />
                    </View>
                  </View>
                  <View style={styles.glyphWell}>
                    <Ionicons
                      name={category.icon as keyof typeof Ionicons.glyphMap}
                      size={17}
                      color={colors.cyan}
                    />
                  </View>
                </View>
                <View style={styles.cardCopy}>
                  <View style={styles.cardTitleRow}>
                    <Text numberOfLines={1} style={styles.cardTitle}>{category.label}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                  </View>
                  <Text numberOfLines={2} style={styles.cardDescription}>{category.description}</Text>
                  <Text style={styles.cardCount}>{categoryItems.length} item{categoryItems.length === 1 ? '' : 's'} in this view</Text>
                </View>
              </GlassPanel>
            </PressableScale>
          );
        })}
      </View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.sm },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
    borderRadius: radii.lg,
    backgroundColor: glass.tintPrimary,
  },
  introIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.fillBright,
  },
  introCopy: { flex: 1, gap: 2 },
  introTitle: { ...typography.subtitle, color: colors.textPrimary },
  introBody: { ...typography.caption, color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  returnButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  returnLabel: { ...typography.subtitle, fontSize: 13, color: colors.cyan },
  card: {
    minHeight: 238,
    alignItems: 'stretch',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(8,28,28,0.46)',
  },
  portrait: {
    position: 'relative',
    height: 122,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    overflow: 'hidden',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
    backgroundColor: glass.fillDeep,
  },
  dominantCover: { flex: 1.7, minWidth: 0, overflow: 'hidden', borderRadius: radii.cover },
  echoColumn: { flex: 1, minWidth: 0, gap: 4 },
  echoCover: { flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: radii.cover },
  glyphWell: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
    backgroundColor: 'rgba(5,18,22,0.82)',
  },
  cardCopy: { flex: 1, minWidth: 0, gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  cardTitle: { ...typography.subtitle, color: colors.textPrimary, flex: 1 },
  cardCount: { ...typography.caption, paddingHorizontal: spacing.xs, marginTop: spacing.xs, fontSize: 10, color: colors.cyan },
  cardDescription: { ...typography.caption, paddingHorizontal: spacing.xs, color: colors.textMuted },
});
