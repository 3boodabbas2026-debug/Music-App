import { useState } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { GlassPanel } from '../components/ui/GlassPanel';
import { GradientText } from '../components/ui/GradientText';
import { TextField } from '../components/ui/TextField';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { REGISTRATION_INVITE_REQUIRED } from '../config';
import { useAuthStore } from '../store/authStore';
import { colors, spacing, typography } from '../theme/tokens';
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
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>JOIN SUPERMEDIA</Text>
        <GradientText style={styles.title}>Build your vault.</GradientText>
        <Text style={styles.subtitle}>Downloads, recognitions, and your library — all in one place.</Text>

        <GlassPanel style={styles.panel}>
          <View style={styles.form}>
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
          </View>
        </GlassPanel>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  eyebrow: { ...typography.eyebrow, color: colors.cyan, textAlign: 'center', marginBottom: spacing.xs },
  title: { ...typography.mega, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  panel: {},
  form: { padding: spacing.lg, gap: spacing.md },
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
});
