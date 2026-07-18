import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import * as offlineMedia from '../../services/storage/offlineMedia';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';
import { apiErrorMessage } from '../../utils/apiError';
import { Button } from '../ui/Button';
import { FormError } from '../ui/FormError';
import { TextField } from '../ui/TextField';

export function AccountSecurityPanel() {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const changePassword = useAuthStore((state) => state.changePassword);
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const [name, setName] = useState(user?.display_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [profilePassword, setProfilePassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [offlineCount, setOfflineCount] = useState(0);
  const [busy, setBusy] = useState<'profile' | 'password' | 'delete' | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.display_name ?? '');
    setEmail(user?.email ?? '');
  }, [user?.display_name, user?.email]);
  useEffect(() => { void offlineMedia.listOffline().then((entries) => setOfflineCount(entries.length)).catch(() => setOfflineCount(0)); }, []);

  async function saveProfile() {
    if (!name.trim() || !email.trim() || !profilePassword || busy) return;
    setBusy('profile');
    setProfileError(null);
    try {
      await updateProfile(name.trim(), email.trim(), profilePassword);
      setProfilePassword('');
      toast('Profile updated', 'success');
    } catch (error) {
      setProfileError(apiErrorMessage(error, "Profile updates aren't available on this server yet."));
    } finally { setBusy(null); }
  }

  async function savePassword() {
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword || busy) return;
    setBusy('password');
    setPasswordError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast('Password changed', 'success');
    } catch (error) {
      setPasswordError(apiErrorMessage(error, "Password changes aren't available on this server yet."));
    } finally { setBusy(null); }
  }

  async function removeAccount() {
    if (!deletePassword || deletePhrase !== 'DELETE' || busy) return;
    setBusy('delete');
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
    } catch (error) {
      setDeleteError(apiErrorMessage(error, "Account deletion isn't available on this server yet."));
      setBusy(null);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <View style={styles.headingBlock}><Text style={styles.title}>Profile details</Text><Text style={styles.copy}>Changing identity details requires your current password.</Text></View>
        <TextField label="Name" value={name} onChangeText={setName} credentialType="name" />
        <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" credentialType="username" />
        <TextField label="Current password" value={profilePassword} onChangeText={setProfilePassword} secureTextEntry credentialType="current-password" />
        <FormError message={profileError} />
        <Button label="Save profile" variant="secondary" onPress={saveProfile} loading={busy === 'profile'} disabled={!name.trim() || !email.trim() || !profilePassword || !!busy} />
      </View>

      <View style={styles.divider} />
      <View style={styles.section}>
        <View style={styles.headingBlock}><Text style={styles.title}>Change password</Text><Text style={styles.copy}>Use a unique 8+ character password. Password-manager-generated values are welcome.</Text></View>
        <TextField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry credentialType="current-password" />
        <TextField label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry credentialType="new-password" hint="A long passphrase or generated password is strongest." />
        <TextField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry credentialType="new-password" error={confirmPassword.length > 0 && confirmPassword !== newPassword ? 'Passwords do not match.' : undefined} />
        <FormError message={passwordError} />
        <Button label="Change password" variant="secondary" onPress={savePassword} loading={busy === 'password'} disabled={!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword || !!busy} />
      </View>

      <View style={styles.divider} />
      <View style={[styles.section, styles.dangerZone]}>
        <View style={styles.headingBlock}><Text style={styles.dangerTitle}>Delete account permanently</Text><Text style={styles.copy}>This removes your account, cloud library, playlists, history, and {offlineCount} offline download{offlineCount === 1 ? '' : 's'} on this device. It cannot be undone.</Text></View>
        <TextField label="Current password" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry credentialType="current-password" />
        <TextField label="Type DELETE to confirm" value={deletePhrase} onChangeText={setDeletePhrase} autoCapitalize="characters" autoCorrect={false} />
        <FormError message={deleteError} />
        <Button label="Permanently delete my account" variant="danger" onPress={removeAccount} loading={busy === 'delete'} disabled={!deletePassword || deletePhrase !== 'DELETE' || !!busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  section: { gap: spacing.md },
  headingBlock: { gap: spacing.xs },
  title: { ...typography.subtitle, color: colors.textPrimary },
  dangerTitle: { ...typography.subtitle, color: colors.danger },
  copy: { ...typography.caption, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: glass.stroke },
  dangerZone: { padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: glass.tintDangerStroke, backgroundColor: glass.tintDanger },
});
