import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import * as authApi from '../../services/api/auth';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';
import { apiErrorMessage } from '../../utils/apiError';
import { Button } from '../ui/Button';
import { CompactGlassSheet } from '../ui/CompactGlassSheet';
import { FormError } from '../ui/FormError';
import { TextField } from '../ui/TextField';

type RecoveryState = 'request' | 'sent' | 'invalid' | 'expired' | 'success';

export function PasswordRecoverySheet({ visible, initialEmail, onClose }: { visible: boolean; initialEmail: string; onClose: () => void }) {
  const [state, setState] = useState<RecoveryState>('request');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && state === 'request') setEmail(initialEmail);
  }, [initialEmail, state, visible]);

  function close() {
    if (loading) return;
    setState('request');
    setError(null);
    setCode('');
    setPassword('');
    setConfirmPassword('');
    onClose();
  }

  async function send() {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.requestPasswordRecovery(email.trim());
      setState('sent');
    } catch (caught) {
      setError(apiErrorMessage(caught, "Recovery isn't available on this server yet. Your request was not sent."));
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    if (!code.trim() || password.length < 8 || password !== confirmPassword || loading) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword(code.trim(), password);
      setState('success');
    } catch (caught) {
      const message = apiErrorMessage(caught, 'That recovery code is invalid. Request a fresh one and try again.');
      const expired = /expired/i.test(message);
      setState(expired ? 'expired' : 'invalid');
      setError(expired ? 'That recovery code has expired. Request a new code to continue.' : message);
    } finally {
      setLoading(false);
    }
  }

  const resetting = state === 'sent' || state === 'invalid' || state === 'expired';
  return (
    <CompactGlassSheet visible={visible} onClose={close} accessibilityLabel="Password recovery" maxWidth={460} scrollable header={<Text style={styles.title}>{state === 'success' ? 'Password reset' : 'Recover your account'}</Text>}>
      <View style={styles.body}>
        {state === 'success' ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Your password was changed successfully.</Text>
            <Text style={styles.copy}>Return to sign in with your new password.</Text>
            <Button label="Back to sign in" onPress={close} />
          </View>
        ) : resetting ? (
          <>
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>{state === 'expired' ? 'Code expired' : state === 'invalid' ? 'Code not accepted' : 'Recovery request sent'}</Text>
              <Text style={styles.copy}>If an account exists for {email}, use the secure code from the recovery message. Codes are single-use.</Text>
            </View>
            <TextField label="Recovery code" value={code} onChangeText={setCode} autoCapitalize="none" credentialType="one-time-code" placeholder="One-time code" />
            <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry credentialType="new-password" placeholder="At least 8 characters" />
            <TextField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry credentialType="new-password" error={confirmPassword.length > 0 && confirmPassword !== password ? 'Passwords do not match.' : undefined} />
            <FormError message={error} />
            <Button label="Set new password" onPress={reset} loading={loading} disabled={!code.trim() || password.length < 8 || password !== confirmPassword} />
            <Button label="Request a fresh code" variant="ghost" onPress={() => { setState('request'); setError(null); }} />
          </>
        ) : (
          <>
            <Text style={styles.copy}>Enter your account email. For privacy, the confirmation looks the same whether or not an account exists.</Text>
            <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" credentialType="username" placeholder="you@example.com" />
            <FormError message={error} />
            <Button label="Send secure recovery code" onPress={send} loading={loading} disabled={!email.trim()} />
          </>
        )}
      </View>
    </CompactGlassSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  body: { gap: spacing.md },
  copy: { ...typography.body, fontSize: 13, color: colors.textSecondary },
  statusCard: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: glass.tintPrimaryStroke, backgroundColor: glass.tintPrimary },
  statusTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
});
