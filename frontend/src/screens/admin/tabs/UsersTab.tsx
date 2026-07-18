import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import * as adminApi from '../../../services/api/admin';
import * as authApi from '../../../services/api/auth';
import type { AdminUser } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { CompactGlassSheet } from '../../../components/ui/CompactGlassSheet';
import { ConfirmationPanel } from '../../../components/ui/SignOutConfirmSheet';
import { DataRow } from '../../../components/ui/DataRow';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TextField } from '../../../components/ui/TextField';
import { toast } from '../../../store/toastStore';
import { apiErrorMessage } from '../../../utils/apiError';
import { colors } from '../../../theme/tokens';
import { adminStyles } from '../adminStyles';
import { formatBytes, timeAgo } from '../adminHelpers';
import { AdminListControls, PagedListFooter } from '../components/AdminListControls';

export type UsersQuery = { search: string; role: 'all' | 'admin' | 'user'; sort: 'newest' | 'oldest' | 'email' };

type Props = {
  users: AdminUser[];
  total: number;
  query: UsersQuery;
  loading: boolean;
  currentAdminEmail: string;
  onQueryChange: (query: UsersQuery) => void;
  onLoadMore: () => void;
  onChanged: (user: AdminUser) => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UsersTab({ users, total, query, loading, currentAdminEmail, onQueryChange, onLoadMore, onChanged }: Props) {
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [editingEmailFor, setEditingEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState('');
  const [roleError, setRoleError] = useState<string | null>(null);
  const [acknowledgement, setAcknowledgement] = useState<{ id: string; message: string } | null>(null);

  function closeRoleConfirmation() {
    if (busyId) return;
    setRoleTarget(null);
    setPassword('');
    setRoleError(null);
  }

  async function confirmRoleChange() {
    if (!roleTarget || !password) return;
    setBusyId(roleTarget.id);
    setRoleError(null);
    try {
      await authApi.login(currentAdminEmail, password);
      const nextRole = roleTarget.is_admin ? 'user' : 'admin';
      const updated = await adminApi.updateUser(roleTarget.id, { role: nextRole });
      onChanged(updated);
      const message = nextRole === 'admin' ? `Admin access granted to ${updated.email}` : `Admin access revoked from ${updated.email}`;
      setAcknowledgement({ id: updated.id, message });
      toast(`${message}. The change was logged.`, 'success');
      setRoleTarget(null);
      setPassword('');
    } catch (err) {
      setRoleError(apiErrorMessage(err, "Couldn't verify your password or update that role."));
    } finally {
      setBusyId(null);
    }
  }

  async function saveEmail(user: AdminUser) {
    const email = emailDraft.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    if (email === user.email.toLowerCase()) {
      setEditingEmailFor(null);
      setEmailError(null);
      return;
    }
    setBusyId(user.id);
    setEmailError(null);
    try {
      const updated = await adminApi.updateUser(user.id, { email });
      onChanged(updated);
      setEditingEmailFor(null);
      toast(`Email updated to ${updated.email}`, 'success');
    } catch (err) {
      setEmailError(apiErrorMessage(err, "Couldn't update that email."));
    } finally {
      setBusyId(null);
    }
  }

  const controls = (
    <AdminListControls
      search={searchDraft}
      onSearchChange={setSearchDraft}
      onSearch={() => onQueryChange({ ...query, search: searchDraft.trim() })}
      searchPlaceholder="Search name or email"
      filter={query.role}
      filters={[{ value: 'all', label: 'All roles' }, { value: 'admin', label: 'Admins' }, { value: 'user', label: 'Users' }]}
      onFilterChange={(role) => onQueryChange({ ...query, role })}
      sort={query.sort}
      sorts={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'email', label: 'Email A–Z' }]}
      onSortChange={(sort) => onQueryChange({ ...query, sort })}
      busy={loading && users.length === 0}
    />
  );

  return (
    <>
      {controls}
      {users.length === 0 ? (
        <EmptyState motif="signal" title="No matching users" subtitle="Try a different account search or role filter." icon="people-outline" />
      ) : (
        <View style={adminStyles.list}>
          {users.map((user) => (
            <DataRow
              key={user.id}
              title={user.display_name}
              status={{ label: user.is_admin ? 'Admin' : 'User', tone: user.is_admin ? 'active' : 'neutral' }}
              subtitle={editingEmailFor === user.id ? (
                <View style={adminStyles.emailEditor}>
                  <TextField
                    accessibilityLabel={`Email for ${user.display_name}`}
                    value={emailDraft}
                    onChangeText={(value) => { setEmailDraft(value); setEmailError(null); }}
                    onSubmitEditing={() => void saveEmail(user)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoFocus
                    compact
                    style={adminStyles.emailInput}
                    containerStyle={adminStyles.emailField}
                  />
                  {emailError ? <Text accessibilityLiveRegion="polite" style={adminStyles.fieldError}>{emailError}</Text> : null}
                  <View style={adminStyles.emailActions}>
                    <Button label="Save" onPress={() => void saveEmail(user)} loading={busyId === user.id} style={adminStyles.inlineButton} />
                    <Button label="Cancel" variant="ghost" onPress={() => { setEditingEmailFor(null); setEmailError(null); }} disabled={busyId === user.id} style={adminStyles.inlineButton} />
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit email for ${user.display_name}`}
                  onPress={() => { setEditingEmailFor(user.id); setEmailDraft(user.email); setEmailError(null); }}
                  style={adminStyles.emailEditButton}
                >
                  <Text numberOfLines={1} style={adminStyles.subtitle}>{user.email} <Ionicons name="pencil-outline" size={11} color={colors.textMuted} /></Text>
                </Pressable>
              )}
              meta={(
                <View>
                  <Text style={adminStyles.mutedLine}>{user.media_count} media · {user.job_count} jobs · {formatBytes(user.storage_bytes)}{user.telegram_linked ? ' · Telegram linked' : ''}</Text>
                  {acknowledgement?.id === user.id ? <Text accessibilityLiveRegion="polite" style={adminStyles.acknowledgement}>{acknowledgement.message} · Logged</Text> : null}
                </View>
              )}
              timestamp={user.last_activity_at ? timeAgo(user.last_activity_at) : 'no activity'}
              trailingAction={(
                <Pressable
                  onPress={() => { setRoleTarget(user); setRoleError(null); }}
                  disabled={busyId === user.id}
                  accessibilityRole="button"
                  accessibilityLabel={user.is_admin ? `Review revoking admin from ${user.email}` : `Review granting admin to ${user.email}`}
                  style={[adminStyles.roleButton, user.is_admin && adminStyles.roleButtonActive]}
                >
                  {busyId === user.id ? <ActivityIndicator size="small" color={colors.textSecondary} /> : (
                    <Text style={[adminStyles.roleButtonLabel, user.is_admin && adminStyles.roleButtonLabelActive]}>{user.is_admin ? 'Revoke admin' : 'Make admin'}</Text>
                  )}
                </Pressable>
              )}
            />
          ))}
          <PagedListFooter shown={users.length} total={total} loading={loading} onLoadMore={onLoadMore} />
        </View>
      )}

      <CompactGlassSheet
        visible={!!roleTarget}
        onClose={closeRoleConfirmation}
        accessibilityLabel="Confirm admin role change"
        closeAccessibilityLabel="Cancel role change"
        maxWidth={500}
        eyebrow="Protected action"
        header={<Text style={adminStyles.confirmTitle}>{roleTarget?.is_admin ? 'Revoke admin access?' : 'Grant admin access?'}</Text>}
      >
        {roleTarget ? (
          <ConfirmationPanel
            affectedLabel={roleTarget.email}
            consequence={roleTarget.is_admin
              ? 'This account will lose access to users, jobs, feedback, announcements, and operational logs.'
              : 'This account will be able to manage users, jobs, feedback, announcements, and operational logs.'}
            safeAlternative="Cancel"
            confirmLabel={roleTarget.is_admin ? 'Confirm revoke' : 'Confirm grant'}
            onCancel={closeRoleConfirmation}
            onConfirm={() => void confirmRoleChange()}
            confirmDisabled={!password}
            loading={busyId === roleTarget.id}
            icon={roleTarget.is_admin ? 'shield-outline' : 'shield-checkmark-outline'}
          >
            <TextField
              label="Your current password"
              value={password}
              onChangeText={(value) => { setPassword(value); setRoleError(null); }}
              secureTextEntry
              credentialType="current-password"
              error={roleError ?? undefined}
              hint="Reauthentication is required. This change is recorded in the admin log."
              onSubmitEditing={() => void confirmRoleChange()}
            />
          </ConfirmationPanel>
        ) : null}
      </CompactGlassSheet>
    </>
  );
}
