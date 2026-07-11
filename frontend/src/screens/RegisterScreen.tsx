import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthLayout } from '../components/ui/AuthLayout';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { REGISTRATION_INVITE_REQUIRED } from '../config';
import { useAuthStore } from '../store/authStore';
import { apiErrorMessage } from '../utils/apiError';
import { colors, typography } from '../theme/tokens';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

export function RegisterScreen({ navigation }: Props) {
  const register = useAuthStore((s) => s.register);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailLooksValid = EMAIL_SHAPE.test(email.trim());
  const passwordLongEnough = password.length >= 8;
  const canSubmit =
    !!displayName.trim() &&
    emailLooksValid &&
    passwordLongEnough &&
    (!REGISTRATION_INVITE_REQUIRED || !!inviteCode.trim());

  // Field-level guidance appears once the user has actually typed something —
  // never scold an untouched form.
  const emailError = email.length > 0 && !emailLooksValid ? 'That doesn’t look like an email address.' : undefined;
  const passwordHint =
    password.length > 0 && !passwordLongEnough
      ? `At least 8 characters — ${8 - password.length} more to go.`
      : undefined;

  async function handleRegister() {
    if (!canSubmit || loading) return;
    setError(null);
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim(), inviteCode.trim());
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create your account.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="JOIN DUSKGLEN"
      title="Make it yours"
      subtitle="Save, identify, and organize music in one private collection."
    >
      <TextField label="Name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        error={emailError}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 8 characters"
        hint={passwordHint}
        onSubmitEditing={handleRegister}
      />
      {REGISTRATION_INVITE_REQUIRED ? (
        <TextField
          label="Invite code"
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
          placeholder="Required for this deployment"
          onSubmitEditing={handleRegister}
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={!displayName.trim() ? 'Enter your name' : !emailLooksValid ? 'Enter a valid email' : !passwordLongEnough ? 'Use at least 8 characters' : REGISTRATION_INVITE_REQUIRED && !inviteCode.trim() ? 'Enter your invite code' : 'Create account'}
        onPress={handleRegister}
        loading={loading}
        disabled={!canSubmit}
      />
      <Button label="Back to login" variant="ghost" onPress={() => navigation.navigate('Login')} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
});
