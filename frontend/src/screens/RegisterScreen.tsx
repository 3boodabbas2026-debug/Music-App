import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthLayout } from '../components/ui/AuthLayout';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { REGISTRATION_INVITE_REQUIRED } from '../config';
import { useAuthStore } from '../store/authStore';
import { colors, typography } from '../theme/tokens';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const register = useAuthStore((s) => s.register);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setError(null);
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim(), inviteCode.trim());
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="JOIN WAVECAIRN"
      title="Build your vault."
      subtitle="Downloads, recognitions, and your library — all in one place."
    >
      <TextField label="Name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 8 characters"
      />
      {REGISTRATION_INVITE_REQUIRED ? (
        <TextField
          label="Invite code"
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
          placeholder="Required for this deployment"
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Create account"
        onPress={handleRegister}
        loading={loading}
        disabled={!email || password.length < 8 || !displayName || (REGISTRATION_INVITE_REQUIRED && !inviteCode)}
      />
      <Button label="Back to login" variant="ghost" onPress={() => navigation.navigate('Login')} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
});
