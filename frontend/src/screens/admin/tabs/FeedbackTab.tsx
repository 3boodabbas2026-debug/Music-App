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

export function FeedbackTab({ items, onChanged }: { items: AdminFeedback[]; onChanged: (item: AdminFeedback) => void }) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleStatus(item: AdminFeedback) {
    setBusyId(item.id);
    try {
      const updated = await adminApi.updateFeedback(item.id, {
        status: item.status === 'open' ? 'resolved' : 'open',
      });
      onChanged(updated);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't update that feedback."), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function sendReply(item: AdminFeedback) {
    const reply = (replyDrafts[item.id] ?? '').trim();
    if (!reply) return;
    setBusyId(item.id);
    try {
      const updated = await adminApi.updateFeedback(item.id, { admin_reply: reply });
      onChanged(updated);
      toast('Reply saved', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't save that reply."), 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <EmptyState title="No feedback yet" subtitle="Notes and bug reports users send in will show up here." icon="chatbubble-ellipses-outline" />;
  }
  return (
    <View style={adminStyles.list}>
      {items.map((item) => (
        <GlassPanel key={item.id} style={adminStyles.row}>
          <View style={[adminStyles.rowContent, { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[adminStyles.badge, item.status === 'open' && adminStyles.badgeOpen]}>
                <Ionicons
                  name={item.status === 'open' ? 'ellipse' : 'checkmark-circle'}
                  size={16}
                  color={item.status === 'open' ? colors.cyan : colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={adminStyles.subtitle}>
                  {item.user_email}
                </Text>
                <Text style={adminStyles.mutedLine}>{timeAgo(item.created_at)}</Text>
              </View>
              <Pressable
                onPress={() => toggleStatus(item)}
                disabled={busyId === item.id}
                accessibilityRole="button"
                accessibilityLabel={item.status === 'open' ? 'Mark feedback resolved' : 'Reopen feedback'}
                accessibilityState={{ disabled: busyId === item.id }}
                style={adminStyles.roleButton}
              >
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text style={adminStyles.roleButtonLabel}>{item.status === 'open' ? 'Mark resolved' : 'Reopen'}</Text>
                )}
              </Pressable>
            </View>
            <Text style={adminStyles.feedbackMessage}>{item.message}</Text>
            {item.admin_reply ? (
              <Text style={adminStyles.mutedLine}>Reply: {item.admin_reply}</Text>
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TextInput
                  accessibilityLabel={`Reply to ${item.user_email}`}
                  value={replyDrafts[item.id] ?? ''}
                  onChangeText={(text) => setReplyDrafts((prev) => ({ ...prev, [item.id]: text }))}
                  placeholder="Reply (optional)"
                  placeholderTextColor={colors.textMuted}
                  style={[adminStyles.emailInput, { flex: 1 }]}
                />
                <Button
                  label="Send reply"
                  variant="secondary"
                  disabled={!(replyDrafts[item.id] ?? '').trim() || busyId === item.id}
                  loading={busyId === item.id}
                  onPress={() => sendReply(item)}
                  style={adminStyles.replyButton}
                />
              </View>
            )}
          </View>
        </GlassPanel>
      ))}
    </View>
  );
}
