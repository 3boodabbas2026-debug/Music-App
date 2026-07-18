import { Pressable, Text, View } from 'react-native';
import { Button } from '../../../components/ui/Button';
import { TextField } from '../../../components/ui/TextField';
import { adminStyles } from '../adminStyles';

export type ControlOption<T extends string> = { value: T; label: string };

type Props<TFilter extends string, TSort extends string> = {
  search: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  searchPlaceholder: string;
  filter: TFilter;
  filters: ControlOption<TFilter>[];
  onFilterChange: (value: TFilter) => void;
  sort: TSort;
  sorts: ControlOption<TSort>[];
  onSortChange: (value: TSort) => void;
  busy?: boolean;
};

export function AdminListControls<TFilter extends string, TSort extends string>({
  search,
  onSearchChange,
  onSearch,
  searchPlaceholder,
  filter,
  filters,
  onFilterChange,
  sort,
  sorts,
  onSortChange,
  busy,
}: Props<TFilter, TSort>) {
  return (
    <View style={adminStyles.controlsPanel}>
      <View style={adminStyles.searchRow}>
        <View style={adminStyles.searchInputWrap}>
          <TextField
            accessibilityLabel={searchPlaceholder}
            value={search}
            onChangeText={onSearchChange}
            onSubmitEditing={onSearch}
            placeholder={searchPlaceholder}
            returnKeyType="search"
            autoCapitalize="none"
            leadingIcon="search"
            compact
            style={adminStyles.searchInput}
            containerStyle={adminStyles.searchField}
          />
        </View>
        <Button label="Search" variant="secondary" onPress={onSearch} loading={busy} style={adminStyles.searchButton} />
      </View>
      <View style={adminStyles.controlGroup} accessibilityRole="radiogroup">
        <Text style={adminStyles.controlLabel}>Filter</Text>
        <View style={adminStyles.controlChips}>
          {filters.map((option) => (
            <ControlChip
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              onPress={() => onFilterChange(option.value)}
            />
          ))}
        </View>
      </View>
      <View style={adminStyles.controlGroup} accessibilityRole="radiogroup">
        <Text style={adminStyles.controlLabel}>Sort</Text>
        <View style={adminStyles.controlChips}>
          {sorts.map((option) => (
            <ControlChip
              key={option.value}
              label={option.label}
              selected={sort === option.value}
              onPress={() => onSortChange(option.value)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function ControlChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[adminStyles.controlChip, selected && adminStyles.controlChipActive]}
    >
      <Text style={[adminStyles.controlChipLabel, selected && adminStyles.controlChipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export function PagedListFooter({
  shown,
  total,
  loading,
  onLoadMore,
}: {
  shown: number;
  total: number;
  loading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={adminStyles.pagingFooter}>
      <Text style={adminStyles.pagingLabel}>Showing {shown} of {total} matching records</Text>
      {shown < total ? (
        <Button label="Load 50 more" variant="secondary" onPress={onLoadMore} loading={loading} style={adminStyles.loadMoreButton} />
      ) : null}
    </View>
  );
}
