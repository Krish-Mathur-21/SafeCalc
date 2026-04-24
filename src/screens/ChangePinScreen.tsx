import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, Alert, ScrollView,
} from 'react-native';
import { verifyPin, setupPins } from '../utils/pinManager';

interface Props {
  onDone: () => void;
  onPanic: () => void;
}

type Step = 'verify' | 'newReal' | 'newDuress' | 'confirm';

export default function ChangePinScreen({ onDone, onPanic }: Props) {
  const [step, setStep] = useState<Step>('verify');
  const [input, setInput] = useState('');
  const [newRealPin, setNewRealPin] = useState('');
  const [newDuressPin, setNewDuressPin] = useState('');

  const buttons = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const handlePress = (val: string) => {
    if (val === '⌫') { setInput(p => p.slice(0, -1)); return; }
    if (input.length < 6) setInput(p => p + val);
  };

  const handleNext = async () => {
    if (input.length < 4) { Alert.alert('Too short', 'PIN must be at least 4 digits'); return; }

    if (step === 'verify') {
      const result = await verifyPin(input);
      if (result === 'wrong') {
        Alert.alert('Wrong PIN', 'Current PIN is incorrect');
        setInput('');
        return;
      }
      setInput('');
      setStep('newReal');

    } else if (step === 'newReal') {
      setNewRealPin(input);
      setInput('');
      setStep('newDuress');

    } else if (step === 'newDuress') {
      if (input === newRealPin) {
        Alert.alert('Same PIN', 'Duress PIN must be different from your real PIN');
        setInput('');
        return;
      }
      setNewDuressPin(input);
      setInput('');
      setStep('confirm');

    } else if (step === 'confirm') {
      if (input !== newRealPin) {
        Alert.alert('No match', 'PIN does not match');
        setInput('');
        return;
      }
      await setupPins(newRealPin, newDuressPin);
      Alert.alert('✅ Done', 'Your PINs have been changed successfully', [
        { text: 'OK', onPress: onDone },
      ]);
    }
  };

  const titles: Record<Step, string> = {
    verify: 'Enter Current PIN',
    newReal: 'Set New Secret PIN',
    newDuress: 'Set New Duress PIN',
    confirm: 'Confirm New Secret PIN',
  };

  const subtitles: Record<Step, string> = {
    verify: 'Verify your identity before changing',
    newReal: 'This will be your new unlock PIN',
    newDuress: 'Entering this shows fake data to others',
    confirm: 'Re-enter your new secret PIN',
  };

  const stepIndex: Record<Step, number> = { verify: 0, newReal: 1, newDuress: 2, confirm: 3 };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onPanic}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change PIN</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{titles[step]}</Text>
        <Text style={styles.subtitle}>{subtitles[step]}</Text>

        {/* PIN dots */}
        <View style={styles.dotsRow}>
          {[0,1,2,3,4,5].map(i => (
            <View key={i} style={[styles.dot, i < input.length && styles.dotFilled]} />
          ))}
        </View>

        {/* Keypad */}
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

        <TouchableOpacity
          style={[styles.nextBtn, input.length < 4 && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={input.length < 4}
        >
          <Text style={styles.nextBtnText}>
            {step === 'confirm' ? '✓ Save New PIN' : 'Next →'}
          </Text>
        </TouchableOpacity>

        {/* Step progress */}
        <View style={styles.stepsRow}>
          {[0,1,2,3].map(i => (
            <View key={i} style={[
              styles.stepDot,
              i === stepIndex[step] && styles.stepDotActive,
              i < stepIndex[step] && styles.stepDotDone,
            ]} />
          ))}
        </View>

        {step === 'verify' && (
          <Text style={styles.warning}>
            ⚠️ After changing PIN, old PIN will stop working immediately
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  backText: { color: '#ff9f0a', fontSize: 16 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 32, maxWidth: 260 },
  dotsRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#444' },
  dotFilled: { backgroundColor: '#ff9f0a', borderColor: '#ff9f0a' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 270, gap: 12, marginBottom: 24 },
  btn: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: '#1c1c1c', justifyContent: 'center', alignItems: 'center',
  },
  btnEmpty: { backgroundColor: 'transparent' },
  btnText: { color: '#fff', fontSize: 24, fontWeight: '400' },
  nextBtn: {
    backgroundColor: '#ff9f0a', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 48, marginBottom: 24,
  },
  nextBtnDisabled: { backgroundColor: '#332200' },
  nextBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  stepsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },
  stepDotActive: { backgroundColor: '#ff9f0a', width: 24 },
  stepDotDone: { backgroundColor: '#34C759' },
  warning: {
    color: '#666', fontSize: 12, textAlign: 'center',
    maxWidth: 260, lineHeight: 18,
  },
});