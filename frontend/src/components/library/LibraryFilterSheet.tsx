import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { LibraryQuery, LibrarySourceFilter } from '../../services/api/library';
import type { MediaType, Playlist } from '../../services/api/types';
import { toast } from '../../store/toastStore';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';
import { CompactGlassSheet } from '../ui/CompactGlassSheet';

export type LibraryAdvancedFilters = {
  source: LibrarySourceFilter | null;
  mediaType: MediaType | null;
  named: boolean | null;
  favorite: boolean | null;
  minDurationMinutes: string;
  maxDurationMinutes: string;
  addedAfter: string;
  addedBefore: string;
  artist: string;
  playlistId: string | null;
};

export const EMPTY_LIBRARY_FILTERS: LibraryAdvancedFilters = {
  source: null,
  mediaType: null,
  named: null,
  favorite: null,
  minDurationMinutes: '',
  maxDurationMinutes: '',
  addedAfter: '',
  addedBefore: '',
  artist: '',
  playlistId: null,
};

const SOURCE_OPTIONS: { value: LibrarySourceFilter | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'other_url', label: 'Other URL' },
  { value: 'recognized', label: 'Recognized' },
  { value: 'recognized_upload', label: 'Recognized upload' },
  { value: 'uploaded', label: 'Uploaded' },
];

const SOURCE_LABELS: Partial<Record<LibrarySourceFilter, string>> = {
  youtube: 'YouTube',
  telegram: 'Telegram',
  recognized: 'Recognized',
  uploaded: 'Uploaded',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  other_url: 'Other URL',
  recognized_upload: 'Recognized upload',
};

function asDateBoundary(value: string, endOfDay: boolean): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // A date-only value is interpreted in UTC so the same filter is sent from
  // native and web regardless of the device timezone.
  const expanded = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : trimmed;
  const parsed = new Date(expanded);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function durationSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 60) : undefined;
}

/** Convert the user-facing minutes/date fields into the API's exact query
 * parameter contract. Validation happens in the sheet before these values are
 * committed, so callers can safely merge the result with q/tab filters. */
export function advancedFiltersToQuery(filters: LibraryAdvancedFilters): LibraryQuery {
  return {
    source: filters.source ?? undefined,
    media_type: filters.mediaType ?? undefined,
    named: filters.named ?? undefined,
    favorite: filters.favorite ?? undefined,
    min_duration: durationSeconds(filters.minDurationMinutes),
    max_duration: durationSeconds(filters.maxDurationMinutes),
    added_after: asDateBoundary(filters.addedAfter, false),
    added_before: asDateBoundary(filters.addedBefore, true),
    artist: filters.artist.trim() || undefined,
    playlist_id: filters.playlistId ?? undefined,
  };
}

export function libraryFilterCount(filters: LibraryAdvancedFilters): number {
  return Object.values(advancedFiltersToQuery(filters)).filter((value) => value !== undefined).length;
}

export type ActiveFilterChip = { key: keyof LibraryAdvancedFilters; label: string };

export function activeLibraryFilterChips(
  filters: LibraryAdvancedFilters,
  playlists: Playlist[],
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.source) chips.push({ key: 'source', label: `Source: ${SOURCE_LABELS[filters.source] ?? filters.source}` });
  if (filters.mediaType) chips.push({ key: 'mediaType', label: filters.mediaType === 'audio' ? 'Audio' : 'Video' });
  if (filters.named != null) chips.push({ key: 'named', label: filters.named ? 'Named' : 'Unnamed' });
  if (filters.favorite != null) chips.push({ key: 'favorite', label: filters.favorite ? 'Favorites' : 'Not favorites' });
  if (filters.minDurationMinutes.trim()) chips.push({ key: 'minDurationMinutes', label: `At least ${filters.minDurationMinutes.trim()} min` });
  if (filters.maxDurationMinutes.trim()) chips.push({ key: 'maxDurationMinutes', label: `At most ${filters.maxDurationMinutes.trim()} min` });
  if (filters.addedAfter.trim()) chips.push({ key: 'addedAfter', label: `After ${filters.addedAfter.trim()}` });
  if (filters.addedBefore.trim()) chips.push({ key: 'addedBefore', label: `Before ${filters.addedBefore.trim()}` });
  if (filters.artist.trim()) chips.push({ key: 'artist', label: `Artist: ${filters.artist.trim()}` });
  if (filters.playlistId) {
    const name = playlists.find((playlist) => playlist.id === filters.playlistId)?.name ?? 'Playlist';
    chips.push({ key: 'playlistId', label: `In ${name}` });
  }
  return chips;
}

function ChoiceRow<T extends string | boolean | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={styles.choiceWrap}
        accessibilityRole="radiogroup"
        accessibilityLabel={`${label} filter`}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={`${option.value}`}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              accessibilityHint="Choose this option, then continue through the filter controls"
              style={[styles.choice, selected && styles.choiceActive]}
            >
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FilterGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.workbenchGroup}>
      <View style={styles.groupHeading}>
        <View style={styles.groupIcon}>
          <Ionicons name={icon} size={14} color={colors.cyan} />
        </View>
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function LibraryFilterSheet({
  visible,
  value,
  playlists,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: LibraryAdvancedFilters;
  playlists: Playlist[];
  onClose: () => void;
  onApply: (filters: LibraryAdvancedFilters) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  function patch(next: Partial<LibraryAdvancedFilters>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function apply() {
    const min = draft.minDurationMinutes.trim() ? Number(draft.minDurationMinutes) : null;
    const max = draft.maxDurationMinutes.trim() ? Number(draft.maxDurationMinutes) : null;
    if ((min != null && (!Number.isFinite(min) || min < 0)) || (max != null && (!Number.isFinite(max) || max < 0))) {
      toast('Duration must be a positive number of minutes.', 'error');
      return;
    }
    if (min != null && max != null && min > max) {
      toast('Minimum duration cannot be longer than the maximum.', 'error');
      return;
    }
    const after = draft.addedAfter.trim() ? asDateBoundary(draft.addedAfter, false) : undefined;
    const before = draft.addedBefore.trim() ? asDateBoundary(draft.addedBefore, true) : undefined;
    if ((draft.addedAfter.trim() && !after) || (draft.addedBefore.trim() && !before)) {
      toast('Use YYYY-MM-DD for date filters.', 'error');
      return;
    }
    if (after && before && after > before) {
      toast('The added-after date must come before the added-before date.', 'error');
      return;
    }
    onApply(draft);
    onClose();
  }

  const draftFilterCount = libraryFilterCount(draft);

  return (
    <CompactGlassSheet
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Advanced library filters"
      closeAccessibilityLabel="Close library filters"
      maxWidth={560}
      maxHeightRatio={0.88}
      scrollable
      contentContainerStyle={styles.workbench}
      header={
        <View style={styles.header}>
          <View style={styles.headerIcon}><Ionicons name="options" size={18} color={colors.cyan} /></View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Filter library</Text>
            <Text style={styles.subtitle}>Filters combine to narrow the server result.</Text>
          </View>
        </View>
      }
      footer={
        <View style={styles.footer}>
          <View style={styles.footerSummary} accessibilityLiveRegion="polite">
            <Text style={styles.footerCount}>{draftFilterCount}</Text>
            <View style={styles.footerSummaryCopy}>
              <Text style={styles.footerSummaryTitle}>
                {draftFilterCount} {draftFilterCount === 1 ? 'filter' : 'filters'} will apply
              </Text>
              <Text style={styles.footerSummaryHint}>Changes stay in draft until you apply them.</Text>
            </View>
          </View>
          <View style={styles.footerActions}>
            <Pressable onPress={() => setDraft(EMPTY_LIBRARY_FILTERS)} style={styles.resetButton}>
              <Text style={styles.resetLabel}>Reset</Text>
            </Pressable>
            <Pressable onPress={apply} style={styles.applyButton}>
              <Ionicons name="checkmark" size={17} color={colors.textInverse} />
              <Text style={styles.applyLabel}>Apply filters</Text>
            </Pressable>
          </View>
        </View>
      }
    >
      <FilterGroup title="Origin" icon="cloud-outline">
        <ChoiceRow
          label="Source"
          value={draft.source}
          options={SOURCE_OPTIONS}
          onChange={(source) => patch({ source })}
        />
      </FilterGroup>

      <FilterGroup title="Media & naming" icon="albums-outline">
        <ChoiceRow
          label="Media type"
          value={draft.mediaType}
          options={[
            { value: null, label: 'Any' },
            { value: 'audio', label: 'Audio' },
            { value: 'video', label: 'Video' },
          ]}
          onChange={(mediaType) => patch({ mediaType })}
        />
        <ChoiceRow
          label="Naming"
          value={draft.named}
          options={[
            { value: null, label: 'Any' },
            { value: true, label: 'Named' },
            { value: false, label: 'Unnamed' },
          ]}
          onChange={(named) => patch({ named })}
        />
        <ChoiceRow
          label="Favorites"
          value={draft.favorite}
          options={[
            { value: null, label: 'Any' },
            { value: true, label: 'Favorites' },
            { value: false, label: 'Not favorites' },
          ]}
          onChange={(favorite) => patch({ favorite })}
        />
      </FilterGroup>

      <FilterGroup title="Duration" icon="time-outline">
        <View style={styles.fieldGroupLast}>
          <Text style={styles.fieldLabel}>Duration in minutes</Text>
          <View style={styles.inputRow}>
          <TextInput
            value={draft.minDurationMinutes}
            onChangeText={(minDurationMinutes) => patch({ minDurationMinutes })}
            placeholder="Minimum"
            accessibilityLabel="Minimum duration in minutes"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.cyan}
            style={styles.input}
          />
          <TextInput
            value={draft.maxDurationMinutes}
            onChangeText={(maxDurationMinutes) => patch({ maxDurationMinutes })}
            placeholder="Maximum"
            accessibilityLabel="Maximum duration in minutes"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.cyan}
            style={styles.input}
          />
          </View>
        </View>
      </FilterGroup>

      <FilterGroup title="Date added" icon="calendar-outline">
        <View style={styles.fieldGroupLast}>
          <Text style={styles.fieldLabel}>Archive range</Text>
          <View style={styles.inputRow}>
          <TextInput
            value={draft.addedAfter}
            onChangeText={(addedAfter) => patch({ addedAfter })}
            placeholder="After YYYY-MM-DD"
            accessibilityLabel="Added after date"
            autoCapitalize="none"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.cyan}
            style={styles.input}
          />
          <TextInput
            value={draft.addedBefore}
            onChangeText={(addedBefore) => patch({ addedBefore })}
            placeholder="Before YYYY-MM-DD"
            accessibilityLabel="Added before date"
            autoCapitalize="none"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.cyan}
            style={styles.input}
          />
          </View>
        </View>
      </FilterGroup>

      <FilterGroup title="Artist" icon="person-outline">
        <View style={styles.fieldGroupLast}>
          <Text style={styles.fieldLabel}>Artist contains</Text>
          <TextInput
            value={draft.artist}
            onChangeText={(artist) => patch({ artist })}
            placeholder="Artist name"
            autoCapitalize="none"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.cyan}
            style={styles.input}
          />
        </View>
      </FilterGroup>

      <FilterGroup title="Playlist" icon="list-outline">
        <View style={styles.fieldGroupLast}>
          <Text style={styles.fieldLabel}>Playlist membership</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.playlistRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Playlist membership filter"
        >
          <Pressable
            onPress={() => patch({ playlistId: null })}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.playlistId == null }}
            style={[styles.choice, draft.playlistId == null && styles.choiceActive]}
          >
            <Text style={[styles.choiceLabel, draft.playlistId == null && styles.choiceLabelActive]}>Any playlist</Text>
          </Pressable>
          {playlists.map((playlist) => {
            const selected = playlist.id === draft.playlistId;
            return (
              <Pressable
                key={playlist.id}
                onPress={() => patch({ playlistId: playlist.id })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={[styles.choice, selected && styles.choiceActive]}
              >
                <Ionicons name="list" size={13} color={selected ? colors.cyan : colors.textMuted} />
                <Text numberOfLines={1} style={[styles.choiceLabel, selected && styles.choiceLabelActive]}>{playlist.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        </View>
      </FilterGroup>
    </CompactGlassSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.tintPrimary,
  },
  headerText: { flex: 1 },
  title: { ...typography.title, fontSize: 20, lineHeight: 25, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textMuted },
  workbench: { gap: spacing.sm },
  workbenchGroup: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: glass.stroke,
    backgroundColor: glass.fillDeep,
  },
  groupHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  groupIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: glass.tintPrimary,
  },
  groupTitle: { ...typography.eyebrow, fontSize: 10, letterSpacing: 1.35, color: colors.textSecondary },
  fieldGroup: { gap: spacing.sm, marginBottom: spacing.lg },
  fieldGroupLast: { gap: spacing.sm },
  fieldLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 1.2, color: colors.textMuted },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    minHeight: 36,
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  choiceActive: { backgroundColor: glass.tintPrimary, borderColor: glass.tintPrimaryStroke },
  choiceLabel: { ...typography.caption, color: colors.textSecondary },
  choiceLabelActive: { color: colors.cyan, fontFamily: 'Sora_600SemiBold' },
  inputRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    ...typography.body,
    minWidth: 150,
    flexGrow: 1,
    flexBasis: 0,
    color: colors.textPrimary,
    backgroundColor: glass.fillDeep,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  playlistRow: { gap: spacing.sm, paddingRight: spacing.md },
  footer: { gap: spacing.md },
  footerSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footerCount: {
    ...typography.numeric,
    minWidth: 34,
    height: 34,
    textAlign: 'center',
    lineHeight: 34,
    color: colors.textInverse,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
  },
  footerSummaryCopy: { flex: 1 },
  footerSummaryTitle: { ...typography.subtitle, fontSize: 13, color: colors.textPrimary },
  footerSummaryHint: { ...typography.caption, fontSize: 10, color: colors.textMuted },
  footerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  resetButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.md },
  resetLabel: { ...typography.subtitle, fontSize: 13, color: colors.textSecondary },
  applyButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.cyan,
  },
  applyLabel: { ...typography.subtitle, fontSize: 13, color: colors.textInverse },
});
