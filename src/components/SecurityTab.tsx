import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Alert, ScrollView,
} from 'react-native';
import { changePins } from '../utils/pinManager';
import { setUnlockPassword } from '../utils/securityPreferences';

interface Props {
  onPanic: () => void;
}

export default function SecurityTab({
  onPanic,
}: Props) {
  const [step, setStep] = useState<'menu' | 'change_pin' | 'change_password'>('menu');
  const [currentPin, setCurrentPin] = useState('');
  const [newRealPin, setNewRealPin] = useState('');
  const [newDuressPin, setNewDuressPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePin = async () => {
    if (currentPin.length < 4 || newRealPin.length < 4 || newDuressPin.length < 4) {
      Alert.alert('Too short', 'All PINs must be at least 4 digits');
      return;
    }
    setLoading(true);
    const result = await changePins(currentPin, newRealPin, newDuressPin);
    setLoading(false);

    if (result === 'wrong_current') {
      Alert.alert('Wrong PIN', 'Your current PIN is incorrect');
    } else if (result === 'same_pins') {
      Alert.alert('Same PINs', 'Real and duress PINs must be different');
    } else {
      Alert.alert('✅ Updated', 'Your PINs have been changed successfully', [
        { text: 'OK', onPress: () => {
          setCurrentPin('');
          setNewRealPin('');
          setNewDuressPin('');
          setStep('menu');
        }},
      ]);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      Alert.alert('Password required', 'Enter a new unlock password');
      return;
    }
    if (newPassword.length < 4) {
      Alert.alert('Too short', 'Password must be at least 4 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await setUnlockPassword(newPassword, passwordHint.trim() || undefined);
      setLoading(false);
      Alert.alert('✅ Updated', 'Your unlock password has been changed', [
        { text: 'OK', onPress: () => {
          setNewPassword('');
          setConfirmPassword('');
          setPasswordHint('');
          setStep('menu');
        }},
      ]);
    } catch {
      setLoading(false);
      Alert.alert('Error', 'Failed to save password');
    }
  };

  if (step === 'change_pin') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => setStep('menu')} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Change PINs</Text>
        <Text style={styles.subtitle}>Enter your current PIN to verify identity first</Text>

        <Text style={styles.label}>Current PIN</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter current PIN"
          placeholderTextColor="#555"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          value={currentPin}
          onChangeText={setCurrentPin}
        />

        <Text style={styles.label}>New Secret PIN</Text>
        <Text style={styles.hint}>This opens your real financial data</Text>
        <TextInput
          style={styles.input}
          placeholder="4–6 digits"
          placeholderTextColor="#555"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          value={newRealPin}
          onChangeText={setNewRealPin}
        />

        <Text style={styles.label}>New Duress PIN</Text>
        <Text style={styles.hint}>This opens fake data under coercion</Text>
        <TextInput
          style={styles.input}
          placeholder="4–6 digits (must differ)"
          placeholderTextColor="#555"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          value={newDuressPin}
          onChangeText={setNewDuressPin}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleChangePin}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? 'Updating...' : 'Update PINs'}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (step === 'change_password') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => setStep('menu')} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Change Unlock Password</Text>
        <Text style={styles.subtitle}>Set a password to unlock the ledger when biometric fails</Text>

        <Text style={styles.label}>New Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter password"
          placeholderTextColor="#555"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor="#555"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <Text style={styles.label}>Password Hint (Optional)</Text>
        <Text style={styles.hint}>Reminder: something only you know</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., My pet's name"
          placeholderTextColor="#555"
          value={passwordHint}
          onChangeText={setPasswordHint}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleChangePassword}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? 'Saving...' : 'Save Password'}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Security</Text>
      <Text style={styles.subtitle}>Manage access and emergency options</Text>

      {/* Change PIN */}
      <TouchableOpacity style={styles.menuItem} onPress={() => setStep('change_pin')} activeOpacity={0.86}>
        <View style={styles.menuItemLeft}>
          <View style={styles.menuIconWrap}>
            <Text style={styles.menuIcon}>🔑</Text>
          </View>
          <View>
            <Text style={styles.menuLabel}>Change PINs</Text>
            <Text style={styles.menuDesc}>Update your real and duress PINs</Text>
          </View>
        </View>
        <Text style={styles.menuArrow}>→</Text>
      </TouchableOpacity>

      {/* Change Password */}
      <TouchableOpacity style={styles.menuItem} onPress={() => setStep('change_password')} activeOpacity={0.86}>
        <View style={styles.menuItemLeft}>
          <View style={styles.menuIconWrap}>
            <Text style={styles.menuIcon}>🔐</Text>
          </View>
          <View>
            <Text style={styles.menuLabel}>Change Unlock Password</Text>
            <Text style={styles.menuDesc}>Fallback if face detection fails</Text>
          </View>
        </View>
        <Text style={styles.menuArrow}>→</Text>
      </TouchableOpacity>

      {/* Panic lock */}
      <TouchableOpacity style={styles.menuItem} onPress={onPanic} activeOpacity={0.86}>
        <View style={styles.menuItemLeft}>
          <View style={styles.menuIconWrap}>
            <Text style={styles.menuIcon}>🔒</Text>
          </View>
          <View>
            <Text style={styles.menuLabel}>Lock Now</Text>
            <Text style={styles.menuDesc}>Immediately return to calculator</Text>
          </View>
        </View>
        <Text style={styles.menuArrow}>→</Text>
      </TouchableOpacity>

      {/* Panic info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Auto-lock triggers</Text>
        <Text style={styles.infoLine}>• App goes to background or minimized</Text>
        <Text style={styles.infoLine}>• Rapid shake 3 times</Text>
        <Text style={styles.infoLine}>• Tap the ✕ button in the header</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20 },
  back: { marginBottom: 16 },
  backText: { color: '#34C759', fontSize: 15 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#666', fontSize: 13, marginBottom: 24 },
  label: { color: '#ccc', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  hint: { color: '#555', fontSize: 12, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1a1a', borderRadius: 12,
    padding: 14, color: '#fff', marginBottom: 16, fontSize: 15,
    letterSpacing: 4,
  },
  btn: {
    backgroundColor: '#34C759', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { backgroundColor: '#1a3d23' },
  btnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  menuItem: {
    backgroundColor: '#1a1a1a', borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  menuIcon: { fontSize: 20, textAlign: 'center', includeFontPadding: false, lineHeight: 22 },
  menuLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  menuDesc: { color: '#666', fontSize: 12, marginTop: 2 },
  menuArrow: { color: '#555', fontSize: 18, marginLeft: 12 },
  infoBox: {
    backgroundColor: '#111', borderRadius: 14,
    padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: '#1e1e1e',
  },
  infoTitle: { color: '#888', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  infoLine: { color: '#555', fontSize: 13, marginBottom: 6 },
});