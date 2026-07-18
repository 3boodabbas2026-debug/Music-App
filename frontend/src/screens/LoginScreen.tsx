import { useEffect, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthLayout } from '../components/ui/AuthLayout';
import { PasswordRecoverySheet } from '../components/auth/PasswordRecoverySheet';
import { Button } from '../components/ui/Button';
import { PressableScale } from '../components/ui/PressableScale';
import { Reveal } from '../components/ui/Reveal';
import { TextField } from '../components/ui/TextField';
import { FormError } from '../components/ui/FormError';
import { useAuthStore } from '../store/authStore';
import { apiErrorMessage } from '../utils/apiError';
import { colors, typography } from '../theme/tokens';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const login = useAuthStore((s) => s.login);
  const pendingAccountEmail = useAuthStore((s) => s.pendingAccountEmail);
  const rememberedAccounts = useAuthStore((s) => s.rememberedAccounts);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  useEffect(() => {
    if (pendingAccountEmail) setEmail(pendingAccountEmail);
  }, [pendingAccountEmail]);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not log you in. Check your connection and try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout eyebrow="STARHOLLOW" title="Welcome back" subtitle="Your music, right where you left it.">
      {pendingAccountEmail ? (
        <Text style={styles.switching}>Switching account · sign in to keep every library private</Text>
      ) : null}
      {!pendingAccountEmail && rememberedAccounts.length > 0 ? (
        <View style={styles.rememberedBlock}>
          <Text style={styles.rememberedLabel}>ACCOUNTS ON THIS DEVICE</Text>
          <View style={styles.rememberedRow}>
            {rememberedAccounts.map((account, index) => (
              <Reveal key={account.user.id} delay={Math.min(index, 3) * 40} distance={6}>
                <PressableScale
                  onPress={() => {
                    setEmail(account.user.email);
                    setPassword('');
                    setError(null);
                  }}
                  accessibilityLabel={`Sign in as ${account.user.display_name}`}
                  accessibilityState={{ selected: email.trim().toLowerCase() === account.user.email.toLowerCase() }}
                  scaleTo={0.985}
                  hoverScaleTo={1.005}
                  style={[
                    styles.rememberedAccount,
                    email.trim().toLowerCase() === account.user.email.toLowerCase() && styles.rememberedSelected,
                  ]}
                >
                  <Text style={styles.rememberedInitial}>
                    {account.user.display_name.trim().charAt(0).toUpperCase() || '?'}
                  </Text>
                  <View style={styles.rememberedCopy}>
                    <Text numberOfLines={1} style={styles.rememberedName}>{account.user.display_name}</Text>
                    <Text numberOfLines={1} style={styles.rememberedEmail}>{account.user.email}</Text>
                  </View>
                </PressableScale>
              </Reveal>
            ))}
          </View>
        </View>
      ) : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        onSubmitEditing={handleLogin}
        credentialType="username"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        onSubmitEditing={handleLogin}
        credentialType="current-password"
      />
      <FormError message={error} />
      <Button label={!email || !password ? 'Enter email and password' : 'Log in'} onPress={handleLogin} loading={loading} disabled={!email || !password} />
      <Button label="Forgot password?" variant="ghost" onPress={() => setRecoveryOpen(true)} />
      <Button label="Create an account" variant="ghost" onPress={() => navigation.navigate('Register')} />
      <PasswordRecoverySheet visible={recoveryOpen} initialEmail={email} onClose={() => setRecoveryOpen(false)} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  switching: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  rememberedBlock: { gap: 6 },
  rememberedLabel: { ...typography.eyebrow, fontSize: 9, color: colors.textMuted },
  rememberedRow: { gap: 6 },
  rememberedAccount: {
    width: '100%',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  rememberedSelected: {
    borderColor: colors.cyan,
    backgroundColor: colors.surfaceElevated,
  },
  rememberedInitial: { ...typography.subtitle, width: 26, textAlign: 'center', color: colors.cyan },
  rememberedCopy: { flex: 1, minWidth: 0 },
  rememberedName: { ...typography.body, fontSize: 13, color: colors.textPrimary },
  rememberedEmail: { ...typography.caption, fontSize: 11, color: colors.textMuted },
});
