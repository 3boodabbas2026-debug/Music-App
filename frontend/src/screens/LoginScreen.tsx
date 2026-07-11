import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthLayout } from '../components/ui/AuthLayout';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { useAuthStore } from '../store/authStore';
import { apiErrorMessage } from '../utils/apiError';
import { colors, typography } from '../theme/tokens';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <AuthLayout eyebrow="DUSKGLEN" title="Welcome back" subtitle="Your music, right where you left it.">
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        onSubmitEditing={handleLogin}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        onSubmitEditing={handleLogin}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={!email || !password ? 'Enter email and password' : 'Log in'} onPress={handleLogin} loading={loading} disabled={!email || !password} />
      <Button label="Create an account" variant="ghost" onPress={() => navigation.navigate('Register')} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
});
