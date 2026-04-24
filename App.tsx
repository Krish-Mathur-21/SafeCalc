import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { isPinInitialized } from './src/utils/pinManager';
import { getDB } from './src/utils/database';
import { getCurrentUserPhone } from './src/utils/userSession';
import SetupScreen from './src/screens/SetupScreen';
import CalculatorScreen from './src/screens/CalculatorScreen';
import BiometricGateScreen from './src/screens/BiometricGateScreen';
import LedgerScreen from './src/screens/LedgerScreen';
import SplashTransition from './src/screens/SplashTransition';
import AuthScreen from './src/screens/AuthScreen';

type AppState = 'splash' | 'loading' | 'auth' | 'setup' | 'calculator' | 'biometric' | 'ledger';

export default function App() {
  const [appState, setAppState] = useState<AppState>('splash');
  const [unlockMode, setUnlockMode] = useState<'real' | 'duress'>('real');

  const init = useCallback(async () => {
    await getDB();
    const phone = await getCurrentUserPhone();
    if (!phone) {
      setAppState('auth');
      return;
    }
    const initialized = await isPinInitialized();
    setAppState(initialized ? 'calculator' : 'setup');
  }, []);

  const handleAuthenticated = useCallback(async () => {
    const initialized = await isPinInitialized();
    setAppState(initialized ? 'calculator' : 'setup');
  }, []);

  const handleCalculatorUnlock = useCallback((mode: 'real' | 'duress') => {
    setUnlockMode(mode);
    // Duress mode should look normal and skip biometric prompts.
    setAppState(mode === 'duress' ? 'ledger' : 'biometric');
  }, []);

  const handleBiometricSuccess = useCallback(() => setAppState('ledger'), []);

  const handlePanic = useCallback(() => {
    setUnlockMode('real');
    setAppState('calculator');
  }, []);

  const handleForceDecoy = useCallback(() => {
    setUnlockMode('duress');
    setAppState('ledger');
  }, []);

  if (appState === 'splash') return <SplashTransition onDone={init} />;
  if (appState === 'loading') return <View style={styles.bg} />;
  if (appState === 'auth') return <AuthScreen onAuthenticated={handleAuthenticated} />;
  if (appState === 'setup') return <SetupScreen onSetupComplete={() => setAppState('calculator')} />;
  if (appState === 'calculator') return <CalculatorScreen onUnlock={handleCalculatorUnlock} />;
  if (appState === 'biometric') return (
    <BiometricGateScreen mode={unlockMode} onSuccess={handleBiometricSuccess} onFail={handlePanic} />
  );
  if (appState === 'ledger') {
    return <LedgerScreen mode={unlockMode} onPanic={handlePanic} onForceDecoy={handleForceDecoy} />;
  }
  return null;
}

const styles = StyleSheet.create({ bg: { flex: 1, backgroundColor: '#000' } });