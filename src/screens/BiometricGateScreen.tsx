import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, TextInput } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  verifyUnlockPassword,
  hasUnlockPassword,
  canUseContinueBypass,
  markContinueBypassUsed,
} from '../utils/securityPreferences';
import { verifyPin } from '../utils/pinManager';

interface Props {
  mode: 'real' | 'duress';
  onSuccess: () => void;
  onFail: () => void;
}

export default function BiometricGateScreen({ mode, onSuccess, onFail }: Props) {
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  const [showPasswordTab, setShowPasswordTab] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [showContinueBypass, setShowContinueBypass] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(true);
  const successOnceRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const loadAuthOptions = async () => {
      const [has, canContinue] = await Promise.all([
        hasUnlockPassword(),
        canUseContinueBypass(),
      ]);
      if (mounted) {
        setHasPassword(has);
        setShowContinueBypass(canContinue);
        setPasswordLoading(false);
      }
    };
    void loadAuthOptions();
    return () => {
      mounted = false;
    };
  }, []);

  const handlePasswordSubmit = useCallback(async () => {
    if (!passwordInput.trim()) {
      setPasswordError('Enter your password or secret PIN');
      return;
    }

    const entered = passwordInput.trim();

    // First try the dedicated unlock password.
    if (hasPassword) {
      const passwordMatch = await verifyUnlockPassword(entered);
      if (passwordMatch) {
        setPasswordError('');
        if (!successOnceRef.current) {
          successOnceRef.current = true;
          onSuccess();
        }
        return;
      }
    }

    // Always allow real PIN fallback so users can enter even if password wasn't set.
    const pinResult = await verifyPin(entered);
    if (pinResult === 'real') {
      setPasswordError('');
      if (!successOnceRef.current) {
        successOnceRef.current = true;
        onSuccess();
      }
    } else {
      setPasswordError('Incorrect password/PIN');
      setPasswordInput('');
    }
  }, [hasPassword, onSuccess, passwordInput]);

  const faceStatusText = useMemo(() => {
    if (biometricBusy) {
      return 'Waiting for fingerprint verification...';
    }

    if (biometricError) {
      return biometricError;
    }

    return mode === 'real'
      ? 'Use your fingerprint to unlock the ledger'
      : 'Biometric verification in progress';
  }, [biometricBusy, biometricError, mode]);

  const runBiometricAuth = useCallback(async () => {
    setBiometricBusy(true);
    setBiometricError('');

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        setBiometricError('Biometric hardware is not available on this device.');
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        setBiometricError('No biometrics enrolled. Set up a fingerprint in device settings.');
        return;
      }

      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const fingerprintSupported = supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
      if (!fingerprintSupported) {
        setBiometricError('Fingerprint authentication is not supported on this device.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify fingerprint to open ledger',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use device passcode',
        disableDeviceFallback: false,
      });

      if (result.success) {
        if (!successOnceRef.current) {
          successOnceRef.current = true;
          onSuccess();
        }
        return;
      }

      setBiometricError(result.error === 'user_cancel' ? 'Verification canceled.' : 'Fingerprint verification failed.');
    } catch {
      setBiometricError('Biometric verification failed to start. Try again.');
    } finally {
      setBiometricBusy(false);
    }
  }, [onSuccess]);

  const handleRetry = useCallback(async () => {
    setBiometricError('');
    successOnceRef.current = false;
    await runBiometricAuth();
  }, [runBiometricAuth]);

  const handleContinue = useCallback(async () => {
    await markContinueBypassUsed();
    setShowContinueBypass(false);
    if (!successOnceRef.current) {
      successOnceRef.current = true;
      onSuccess();
    }
  }, [onSuccess]);

  useEffect(() => {
    if (showPasswordTab) {
      return;
    }
    void runBiometricAuth();
  }, [runBiometricAuth, showPasswordTab]);

  return (
    <View style={styles.container}>
      {!showPasswordTab && (
        <View style={styles.overlay}>
          <Text style={styles.icon}>🔐</Text>
          <Text style={styles.title}>Fingerprint Verification</Text>
          <Text style={styles.subtitle}>{faceStatusText}</Text>
          {biometricBusy ? <ActivityIndicator color="#34C759" style={{ marginTop: 12 }} /> : null}
        </View>
      )}

      {/* Password tab */}
      {showPasswordTab && (
        <View style={styles.passwordContainer}>
          <Text style={styles.title}>Unlock Manually</Text>
          <Text style={styles.subtitle}>Enter your unlock password or secret PIN</Text>
          
          <TextInput
            style={styles.passwordInput}
            placeholder="Password or Secret PIN"
            placeholderTextColor="#808080"
            secureTextEntry
            value={passwordInput}
            onChangeText={(text) => {
              setPasswordInput(text);
              setPasswordError('');
            }}
            editable={!passwordLoading}
          />
          
          {passwordError ? (
            <Text style={styles.errorText}>{passwordError}</Text>
          ) : null}
          
          <TouchableOpacity
            style={[styles.btn, { marginTop: 20 }]}
            onPress={() => void handlePasswordSubmit()}
            disabled={passwordLoading}
          >
            <Text style={styles.btnText}>{passwordLoading ? 'Loading...' : 'Unlock'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tab buttons and actions */}
      <View style={styles.tabContainer}>
        {!showPasswordTab && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => void handleRetry()} activeOpacity={0.82}>
              <Text style={styles.secondaryText}>Retry Fingerprint</Text>
            </TouchableOpacity>
            {!passwordLoading ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setShowPasswordTab(true);
                  setPasswordInput('');
                  setPasswordError('');
                }}
                activeOpacity={0.82}
              >
                <Text style={styles.secondaryText}>Use Password/PIN</Text>
              </TouchableOpacity>
            ) : null}
            {showContinueBypass ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => void handleContinue()} activeOpacity={0.82}>
                <Text style={styles.secondaryText}>Continue</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.cancelAction} onPress={onFail} activeOpacity={0.82}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {showPasswordTab && !passwordLoading && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setShowPasswordTab(false);
                setPasswordInput('');
                setPasswordError('');
              }}
              activeOpacity={0.82}
            >
              <Text style={styles.secondaryText}>Use Camera</Text>
            </TouchableOpacity>
            {showContinueBypass ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => void handleContinue()} activeOpacity={0.82}>
                <Text style={styles.secondaryText}>Continue</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.cancelAction} onPress={onFail} activeOpacity={0.82}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(5, 5, 5, 0.28)',
  },
  frame: {
    width: 240,
    height: 320,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#c8c8c8',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  icon: {
    fontSize: 60,
    marginBottom: 16,
  },
  permissionCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  btn: {
    marginTop: 24,
    backgroundColor: '#F7F7F7',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnText: {
    color: '#050505',
    fontSize: 16,
    fontWeight: '700',
  },
  actions: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 120,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelAction: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelBtn: {
    marginTop: 12,
  },
  cancelText: {
    color: '#D0D0D0',
    fontSize: 14,
    fontWeight: '600',
  },
  debugText: {
    color: '#FF9500',
    fontSize: 12,
    marginTop: 12,
    fontFamily: 'Menlo',
  },
  passwordContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#050505',
  },
  passwordInput: {
    width: '100%',
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: 16,
  },
  errorText: {
    color: '#FF375F',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  tabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(5, 5, 5, 0.5)',
  },
});