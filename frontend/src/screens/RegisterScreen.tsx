import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthLayout } from '../components/ui/AuthLayout';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { FormError } from '../components/ui/FormError';
import { REGISTRATION_INVITE_REQUIRED } from '../config';
import { useAuthStore } from '../store/authStore';
import { apiErrorMessage } from '../utils/apiError';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;
const COMMON_DOMAIN_TYPOS: Record<string, string> = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'hotnail.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com' };
const COMMON_PASSWORDS = new Set(['password', 'password123', '12345678', 'qwerty123', 'letmein123']);

export function RegisterScreen({ navigation }: Props) {
  const register = useAuthStore((s) => s.register);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailLooksValid = EMAIL_SHAPE.test(email.trim());
  const passwordLongEnough = password.length >= 8;
  const passwordsMatch = password === confirmPassword;
  const emailDomain = email.trim().toLowerCase().split('@')[1] ?? '';
  const suggestedDomain = COMMON_DOMAIN_TYPOS[emailDomain];
  const variedPassword = /[a-z]/i.test(password) && /[^a-z]/i.test(password);
  const commonPassword = COMMON_PASSWORDS.has(password.toLowerCase());
  const canSubmit =
    !!displayName.trim() &&
    emailLooksValid &&
    passwordLongEnough &&
    !!confirmPassword &&
    passwordsMatch &&
    (!REGISTRATION_INVITE_REQUIRED || !!inviteCode.trim());

  // Field-level guidance appears once the user has actually typed something —
  // never scold an untouched form.
  const emailError = email.length > 0 && !emailLooksValid ? 'That doesn’t look like an email address.' : undefined;
  const passwordHint =
    password.length > 0 && !passwordLongEnough
      ? `At least 8 characters — ${8 - password.length} more to go.`
      : commonPassword
        ? 'This password is widely used. Choose a unique phrase or use your password manager.'
        : password.length > 0 && !variedPassword
          ? 'A longer passphrase or a password-manager-generated value is safer than one repeated pattern.'
          : password.length > 0
            ? 'Good start. Unique, generated passwords are strongest; Starhollow never blocks password-manager values.'
            : 'Use 8+ characters. A unique generated password or long passphrase is recommended.';
  const confirmError = confirmPassword.length > 0 && !passwordsMatch ? 'Passwords do not match — check for a typo.' : undefined;

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
      eyebrow="JOIN STARHOLLOW"
      title="Make it yours"
      subtitle="Save, identify, and organize music in one private collection."
    >
      <TextField label="Name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" credentialType="name" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        error={emailError}
        hint={suggestedDomain ? `Did you mean ${email.trim().split('@')[0]}@${suggestedDomain}?` : undefined}
        credentialType="username"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 8 characters"
        hint={passwordHint}
        credentialType="new-password"
      />
      <TextField
        label="Confirm password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        credentialType="new-password"
        placeholder="Type it again"
        error={confirmError}
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
          credentialType="one-time-code"
        />
      ) : null}
      <FormError message={error} />
      <Button
        label={!displayName.trim() ? 'Enter your name' : !emailLooksValid ? 'Enter a valid email' : !passwordLongEnough ? 'Use at least 8 characters' : !confirmPassword ? 'Confirm your password' : !passwordsMatch ? 'Passwords must match' : REGISTRATION_INVITE_REQUIRED && !inviteCode.trim() ? 'Enter your invite code' : 'Create account'}
        onPress={handleRegister}
        loading={loading}
        disabled={!canSubmit}
      />
      <Button label="Back to login" variant="ghost" onPress={() => navigation.navigate('Login')} />
    </AuthLayout>
  );
}
