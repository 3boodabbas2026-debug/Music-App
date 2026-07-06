import { useState } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { GlassPanel } from '../components/ui/GlassPanel';
import { Reveal } from '../components/ui/Reveal';
import { GradientText } from '../components/ui/GradientText';
import { TextField } from '../components/ui/TextField';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { Orb } from '../components/three/Orb';
import { useAuthStore } from '../store/authStore';
import { colors, spacing, typography } from '../theme/tokens';
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
    } catch {
      setError('Incorrect email or password.');
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
        <Reveal>
          <View style={styles.orbWrap}>
            <Orb state="idle" size={150} />
          </View>
          <Text style={styles.eyebrow}>SUPERMEDIA</Text>
          <GradientText style={styles.title}>Welcome back.</GradientText>
          <Text style={styles.subtitle}>Your vault has been waiting.</Text>
        </Reveal>

        <Reveal delay={100}>
        <GlassPanel style={styles.panel}>
          <View style={styles.form}>
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
              placeholder="••••••••"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Log in" onPress={handleLogin} loading={loading} disabled={!email || !password} />
            <Button label="Create an account" variant="ghost" onPress={() => navigation.navigate('Register')} />
          </View>
        </GlassPanel>
        </Reveal>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  orbWrap: { alignItems: 'center', marginBottom: spacing.md },
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
