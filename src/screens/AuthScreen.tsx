import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import CommonButton from '../components/CommonButton';
import { getApiBaseUrl, sendOtpToPhone, verifyOtpForPhone, signUpWithPhone } from '../utils/demoBankApi';
import { setCurrentUser, setCurrentUserPhoneVerified } from '../utils/userSession';

interface Props {
  onAuthenticated: () => void;
}

function normalizePhone(input: string): string {
  const trimmed = input.replace(/\s+/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  return `+${trimmed}`;
}

export default function AuthScreen({ onAuthenticated }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpMode, setOtpMode] = useState<'supabase' | 'local' | null>(null);
  const [otpNotice, setOtpNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizedPhone = normalizePhone(phone);

  const validatePhone = () => {
    if (!/^\+?[0-9]{10,15}$/.test(normalizedPhone)) {
      Alert.alert('Invalid phone', 'Enter a valid phone number with country code, e.g. +919876543210');
      return false;
    }
    return true;
  };

  const handleSendOtp = async () => {
    if (!validatePhone()) return;
    setLoading(true);
    try {
      const result: any = await sendOtpToPhone(normalizedPhone);
      setOtpSent(true);
      if (result?.mode === 'local' && result?.token) {
        setOtpMode('local');
        setOtp(result.token);
        setOtpNotice(`Demo OTP generated locally. Code: ${result.token}`);
        Alert.alert('Demo OTP generated', `${result.message}\n\nCode: ${result.token}`);
      } else {
        setOtpMode('supabase');
        setOtpNotice(result?.message || 'Check your SMS and enter the code.');
        Alert.alert('OTP sent', result?.message || 'Check your SMS and enter the code.');
      }
    } catch (e: any) {
      Alert.alert(
        'OTP failed',
        `${e?.message || 'Could not send OTP.'}\n\nBackend URL: ${getApiBaseUrl()}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!validatePhone()) return;
    if (!otp.trim()) {
      Alert.alert('OTP required', 'Enter the OTP you received by SMS.');
      return;
    }

    setLoading(true);
    try {
      await verifyOtpForPhone(normalizedPhone, otp.trim(), name.trim() || undefined);
      await setCurrentUser(normalizedPhone, name.trim());
      await setCurrentUserPhoneVerified(true);
      onAuthenticated();
    } catch (e: any) {
      Alert.alert('Verification failed', e?.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoRegister = async () => {
    if (!validatePhone()) return;
    setLoading(true);
    try {
      await signUpWithPhone(normalizedPhone, name.trim() || 'New User');
      await setCurrentUser(normalizedPhone, name.trim());
      await setCurrentUserPhoneVerified(false);
      setOtpMode('local');
      setOtpNotice('Demo mode enabled. Use the locally generated OTP shown after Send OTP.');
      onAuthenticated();
    } catch (e: any) {
      // Demo mode should stay usable even without backend connectivity.
      await setCurrentUser(normalizedPhone, name.trim() || 'New User');
      await setCurrentUserPhoneVerified(false);
      setOtpMode('local');
      setOtpNotice('Demo mode enabled offline. Use the locally generated OTP shown after Send OTP.');
      Alert.alert(
        'Demo mode enabled (offline)',
        `${e?.message || 'Backend is unreachable.'}\n\nContinuing with local profile only.`
      );
      onAuthenticated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Register with phone number to use your own ledger profile.</Text>

          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#666"
            value={name}
            onChangeText={setName}
          />

          <TextInput
            style={styles.input}
            placeholder="Phone number (e.g. +919876543210)"
            placeholderTextColor="#666"
            keyboardType="phone-pad"
            autoCapitalize="none"
            value={phone}
            onChangeText={setPhone}
          />

          {otpSent && (
            <View>
              <TextInput
                style={styles.input}
                placeholder={otpMode === 'local' ? 'Enter demo OTP' : 'Enter OTP'}
                placeholderTextColor="#666"
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={8}
              />
              {otpNotice ? <Text style={styles.otpNotice}>{otpNotice}</Text> : null}
            </View>
          )}

          {!otpSent ? (
            <CommonButton label={loading ? 'Sending...' : 'Send OTP'} onPress={handleSendOtp} disabled={loading} style={styles.btn} />
          ) : (
            <CommonButton label={loading ? 'Verifying...' : 'Verify OTP'} onPress={handleVerifyOtp} disabled={loading} style={styles.btn} />
          )}

          <CommonButton
            label={loading ? 'Please wait...' : 'Continue in Demo Mode'}
            variant="secondary"
            onPress={handleDemoRegister}
            disabled={loading}
            style={styles.btnSecondary}
          />

          <Text style={styles.helper}>If OTP is not configured yet in Supabase, use Demo Mode for now.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 18,
    padding: 18,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#9a9a9a', fontSize: 14, marginBottom: 18, lineHeight: 20 },
  input: {
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303030',
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  btn: { marginTop: 4 },
  btnSecondary: { marginTop: 10 },
  otpNotice: { color: '#34C759', fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 17 },
  helper: { color: '#6f6f6f', fontSize: 12, marginTop: 12 },
});
