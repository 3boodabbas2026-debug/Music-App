import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import * as adminApi from '../../../services/api/admin';
import type { AdminUser } from '../../../services/api/admin';
import { EmptyState } from '../../../components/ui/EmptyState';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { toast } from '../../../store/toastStore';
import { apiErrorMessage } from '../../../utils/apiError';
import { colors } from '../../../theme/tokens';
import { adminStyles } from '../adminStyles';
import { formatBytes, timeAgo } from '../adminHelpers';

export function UsersTab({ users, onChanged }: { users: AdminUser[]; onChanged: (user: AdminUser) => void }) {
  const [editingEmailFor, setEditingEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleRole(user: AdminUser) {
    setBusyId(user.id);
    try {
      const updated = await adminApi.updateUser(user.id, { role: user.is_admin ? 'user' : 'admin' });
      onChanged(updated);
    } catch (err: any) {
      toast(apiErrorMessage(err, "Couldn't update that user"), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function saveEmail(user: AdminUser) {
    if (!emailDraft.trim() || emailDraft.trim() === user.email) {
      setEditingEmailFor(null);
      return;
    }
    setBusyId(user.id);
    try {
      const updated = await adminApi.updateUser(user.id, { email: emailDraft.trim() });
      onChanged(updated);
      toast('Email updated', 'success');
    } catch (err: any) {
      toast(apiErrorMessage(err, "Couldn't update that email"), 'error');
    } finally {
      setBusyId(null);
      setEditingEmailFor(null);
    }
  }

  if (users.length === 0) {
    return <EmptyState title="No users yet" subtitle="Registered accounts will show up here." icon="people-outline" />;
  }
  return (
    <View style={adminStyles.list}>
      {users.map((user) => (
        <GlassPanel key={user.id} style={adminStyles.row}>
          <View style={[adminStyles.rowContent, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text numberOfLines={1} style={adminStyles.title}>
                  {user.display_name}
                </Text>
                {user.is_admin && (
                  <View style={adminStyles.adminBadge}>
                    <Text style={adminStyles.adminBadgeLabel}>ADMIN</Text>
                  </View>
                )}
              </View>
              {editingEmailFor === user.id ? (
                <TextInput
                  accessibilityLabel={`Email for ${user.display_name}`}
                  value={emailDraft}
                  onChangeText={setEmailDraft}
                  onBlur={() => saveEmail(user)}
                  onSubmitEditing={() => saveEmail(user)}
                  autoCapitalize="none"
                  autoFocus
                  style={adminStyles.emailInput}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit email for ${user.display_name}`}
                  onPress={() => {
                    setEditingEmailFor(user.id);
                    setEmailDraft(user.email);
                  }}
                  style={adminStyles.emailEditButton}
                >
                  <Text numberOfLines={1} style={adminStyles.subtitle}>
                    {user.email} <Ionicons name="pencil-outline" size={11} color={colors.textMuted} />
                  </Text>
                </Pressable>
              )}
              <Text style={adminStyles.mutedLine}>
                {user.media_count} media · {user.job_count} jobs · {formatBytes(user.storage_bytes)}
                {user.telegram_linked ? ' · Telegram linked' : ''}
              </Text>
              <Text style={adminStyles.mutedLine}>
                {user.last_activity_at ? timeAgo(user.last_activity_at) : 'no activity'}
              </Text>
            </View>
            <Pressable
              onPress={() => toggleRole(user)}
              disabled={busyId === user.id}
              accessibilityRole="button"
              accessibilityLabel={user.is_admin ? `Revoke admin from ${user.display_name}` : `Make ${user.display_name} an admin`}
              accessibilityState={{ disabled: busyId === user.id }}
              style={[adminStyles.roleButton, user.is_admin && adminStyles.roleButtonActive]}
            >
              {busyId === user.id ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={[adminStyles.roleButtonLabel, user.is_admin && adminStyles.roleButtonLabelActive]}>
                  {user.is_admin ? 'Revoke admin' : 'Make admin'}
                </Text>
              )}
            </Pressable>
          </View>
        </GlassPanel>
      ))}
    </View>
  );
}
