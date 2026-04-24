import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  StatusBar, Alert, ScrollView, TextInput,
} from 'react-native';
import { setupPins } from '../utils/pinManager';
import { setUnlockPassword as saveUnlockPassword } from '../utils/securityPreferences';

interface Props {
  onSetupComplete: () => void;
}

export default function SetupScreen({ onSetupComplete }: Props) {
  const [step, setStep] = useState<'real' | 'duress' | 'confirm' | 'password' | 'confirmPassword'>('real');
  const [realPin, setRealPin] = useState('');
  const [duressPin, setDuressPin] = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const [unlockPassword, setUnlockPasswordInput] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const buttons = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const handlePress = (val: string) => {
    if (val === '⌫') {
      setCurrentInput(p => p.slice(0, -1));
    } else if (currentInput.length < 6) {
      setCurrentInput(p => p + val);
    }
  };

  const handleNext = async () => {
    if (step === 'real' || step === 'duress' || step === 'confirm') {
      // PIN steps
      if (currentInput.length < 4) {
        Alert.alert('Too short', 'PIN must be at least 4 digits');
        return;
      }
      if (step === 'real') {
        setRealPin(currentInput);
        setCurrentInput('');
        setStep('duress');
      } else if (step === 'duress') {
        if (currentInput === realPin) {
          Alert.alert('Same PIN', 'Duress PIN must be different from your real PIN');
          return;
        }
        setDuressPin(currentInput);
        setCurrentInput('');
        setStep('confirm');
      } else if (step === 'confirm') {
        if (currentInput !== realPin) {
          Alert.alert('No match', 'PIN confirmation does not match');
          setCurrentInput('');
          return;
        }
        await setupPins(realPin, duressPin);
        setCurrentInput('');
        setStep('password');
      }
    } else if (step === 'password') {
      // Password setup
      if (!unlockPassword.trim()) {
        Alert.alert('Required', 'Enter a password');
        return;
      }
      if (unlockPassword.length < 4) {
        Alert.alert('Too short', 'Password must be at least 4 characters');
        return;
      }
      setStep('confirmPassword');
    } else if (step === 'confirmPassword') {
      if (unlockPassword !== confirmPassword) {
        Alert.alert('Mismatch', 'Passwords do not match');
        setConfirmPassword('');
        return;
      }
      setLoading(true);
      try {
        await saveUnlockPassword(unlockPassword);
        setLoading(false);
        onSetupComplete();
      } catch {
        setLoading(false);
        Alert.alert('Error', 'Failed to save password');
      }
    }
  };

  const titles: Record<string, string> = {
    real: 'Set Your Secret PIN',
    duress: 'Set Your Duress PIN',
    confirm: 'Confirm Your Secret PIN',
    password: 'Set Unlock Password',
    confirmPassword: 'Confirm Unlock Password',
  };

  const subtitles: Record<string, string> = {
    real: 'This unlocks your real financial data',
    duress: 'Entering this PIN shows fake data to an abuser',
    confirm: 'Re-enter your secret PIN to confirm',
    password: 'Fallback if face detection fails. At least 4 characters.',
    confirmPassword: 'Confirm your password',
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{titles[step]}</Text>
        <Text style={styles.subtitle}>{subtitles[step]}</Text>

        {(step === 'real' || step === 'duress' || step === 'confirm') ? (
          <>
            <View style={styles.dotsRow}>
              {[0,1,2,3,4,5].map(i => (
                <View
                  key={i}
                  style={[styles.dot, i < currentInput.length && styles.dotFilled]}
                />
              ))}
            </View>

            <View style={styles.grid}>
              {buttons.map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.btn, btn === '' && styles.btnEmpty]}
                  onPress={() => btn !== '' && handlePress(btn)}
                  disabled={btn === ''}
                >
                  <Text style={styles.btnText}>{btn}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <TextInput
              style={styles.passwordInput}
              placeholder={step === 'password' ? 'Enter password' : 'Confirm password'}
              placeholderTextColor="#555"
              secureTextEntry
              value={step === 'password' ? unlockPassword : confirmPassword}
              onChangeText={step === 'password' ? setUnlockPasswordInput : setConfirmPassword}
              editable={!loading}
            />
          </>
        )}

        <TouchableOpacity
          style={[
            styles.nextBtn,
            (step === 'real' || step === 'duress' || step === 'confirm' ? currentInput.length < 4 : 
             step === 'password' ? !unlockPassword.trim() || unlockPassword.length < 4 :
             unlockPassword !== confirmPassword) && styles.nextBtnDisabled
          ]}
          onPress={handleNext}
          disabled={
            loading ||
            (step === 'real' || step === 'duress' || step === 'confirm' ? currentInput.length < 4 : 
             step === 'password' ? !unlockPassword.trim() || unlockPassword.length < 4 :
             unlockPassword !== confirmPassword)
          }
        >
          <Text style={styles.nextBtnText}>
            {loading ? 'Finishing...' : step === 'confirmPassword' ? 'Complete Setup' : 'Next →'}
          </Text>
        </TouchableOpacity>

        <View style={styles.stepsRow}>
          {['real','duress','confirm','password','confirmPassword'].map((s, i) => (
            <View key={i} style={[styles.stepDot, step === s && styles.stepDotActive]} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 32, maxWidth: 260 },
  dotsRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#444' },
  dotFilled: { backgroundColor: '#34C759', borderColor: '#34C759' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 270, gap: 12, marginBottom: 24 },
  btn: {
    width: 78, height: 78, borderRadius: 39, backgroundColor: '#1c1c1c',
    justifyContent: 'center', alignItems: 'center',
  },
  btnEmpty: { backgroundColor: 'transparent' },
  btnText: { color: '#fff', fontSize: 24, fontWeight: '400' },
  passwordInput: {
    width: '100%',
    maxWidth: 300,
    marginBottom: 32,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: 16,
  },
  nextBtn: {
    backgroundColor: '#34C759', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 48, marginBottom: 24,
  },
  nextBtnDisabled: { backgroundColor: '#1a3d23' },
  nextBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  stepsRow: { flexDirection: 'row', gap: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },
  stepDotActive: { backgroundColor: '#34C759' },
});