import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import * as adminApi from '../../../services/api/admin';
import type { AdminFeedback } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { toast } from '../../../store/toastStore';
import { apiErrorMessage } from '../../../utils/apiError';
import { colors, spacing } from '../../../theme/tokens';
import { adminStyles } from '../adminStyles';
import { timeAgo } from '../adminHelpers';
import { AdminListControls, PagedListFooter } from '../components/AdminListControls';

export type FeedbackQuery = { search: string; status: 'all' | 'open' | 'resolved'; sort: 'newest' | 'oldest' | 'account' };

export function FeedbackTab({ items, total, query, loading, onQueryChange, onLoadMore, onChanged }: {
  items: AdminFeedback[]; total: number; query: FeedbackQuery; loading: boolean;
  onQueryChange: (query: FeedbackQuery) => void; onLoadMore: () => void; onChanged: (item: AdminFeedback) => void;
}) {
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleStatus(item: AdminFeedback) {
    setBusyId(item.id);
    try {
      onChanged(await adminApi.updateFeedback(item.id, { status: item.status === 'open' ? 'resolved' : 'open' }));
    } catch (err) { toast(apiErrorMessage(err, "Couldn't update that feedback."), 'error'); }
    finally { setBusyId(null); }
  }

  async function saveInternalNote(item: AdminFeedback) {
    const note = (noteDrafts[item.id] ?? '').trim();
    if (!note) return;
    setBusyId(item.id);
    try {
      onChanged(await adminApi.updateFeedback(item.id, { admin_reply: note }));
      toast('Internal note saved', 'success');
    } catch (err) { toast(apiErrorMessage(err, "Couldn't save that internal note."), 'error'); }
    finally { setBusyId(null); }
  }

  return (
    <>
      <AdminListControls
        search={searchDraft} onSearchChange={setSearchDraft} onSearch={() => onQueryChange({ ...query, search: searchDraft.trim() })}
        searchPlaceholder="Search account or feedback text" filter={query.status}
        filters={[{ value: 'all', label: 'All status' }, { value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }]}
        onFilterChange={(status) => onQueryChange({ ...query, status })} sort={query.sort}
        sorts={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'account', label: 'Account A–Z' }]}
        onSortChange={(sort) => onQueryChange({ ...query, sort })} busy={loading && items.length === 0}
      />
      {items.length === 0 ? <EmptyState title="No matching feedback" subtitle="Try another account, message, or status filter." icon="chatbubble-ellipses-outline" /> : (
        <View style={adminStyles.list}>
          {items.map((item) => (
            <GlassPanel key={item.id} style={[adminStyles.row, item.status === 'open' ? adminStyles.rowIntervention : adminStyles.rowHealthy]}>
              <View pointerEvents="none" style={[adminStyles.rowAccent, item.status === 'open' ? adminStyles.rowAccentIntervention : adminStyles.rowAccentHealthy]} />
              <View style={[adminStyles.rowContent, { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[adminStyles.badge, item.status === 'open' && adminStyles.badgeOpen]}><Ionicons name={item.status === 'open' ? 'ellipse' : 'checkmark-circle'} size={16} color={item.status === 'open' ? colors.cyan : colors.textMuted} /></View>
                  <View style={{ flex: 1 }}><Text numberOfLines={1} style={adminStyles.subtitle}>{item.user_email}</Text><Text style={adminStyles.mutedLine}>{timeAgo(item.created_at)}</Text></View>
                  <Pressable onPress={() => void toggleStatus(item)} disabled={busyId === item.id} accessibilityRole="button" accessibilityLabel={item.status === 'open' ? 'Mark feedback resolved' : 'Reopen feedback'} accessibilityState={{ disabled: busyId === item.id }} style={adminStyles.roleButton}>
                    {busyId === item.id ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Text style={adminStyles.roleButtonLabel}>{item.status === 'open' ? 'Mark resolved' : 'Reopen'}</Text>}
                  </Pressable>
                </View>
                <Text style={adminStyles.feedbackMessage}>{item.message}</Text>
                {item.admin_reply ? <Text style={adminStyles.mutedLine}>Internal note (admins only): {item.admin_reply}</Text> : (
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <TextInput accessibilityLabel={`Internal note for feedback from ${item.user_email}`} value={noteDrafts[item.id] ?? ''} onChangeText={(text) => setNoteDrafts((prev) => ({ ...prev, [item.id]: text }))} placeholder="Internal note — not sent to user" placeholderTextColor={colors.textMuted} style={[adminStyles.emailInput, { flex: 1 }]} />
                    <Button label="Save internal note" variant="secondary" disabled={!(noteDrafts[item.id] ?? '').trim() || busyId === item.id} loading={busyId === item.id} onPress={() => void saveInternalNote(item)} style={adminStyles.replyButton} />
                  </View>
                )}
              </View>
            </GlassPanel>
          ))}
          <PagedListFooter shown={items.length} total={total} loading={loading} onLoadMore={onLoadMore} />
        </View>
      )}
    </>
  );
}
