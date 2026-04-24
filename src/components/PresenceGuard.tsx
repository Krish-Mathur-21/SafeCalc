import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Modal,
} from 'react-native';

interface Props {
  enabled: boolean;
  onLock: () => void;
  warningSeconds?: number;
  noPresence: boolean;        // driven directly from LedgerScreen state
  onPresenceBack: () => void; // tells LedgerScreen to reset noPresence to false
  children: React.ReactNode;
}

const { width } = Dimensions.get('window');

export default function PresenceGuard({
  enabled,
  onLock,
  warningSeconds = 5,
  noPresence,
  onPresenceBack,
  children,
}: Props) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(warningSeconds);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  // User taps "I'm Here" or presence returns
  const handleDismiss = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    progressAnim.stopAnimation();
    progressAnim.setValue(1);
    setShowWarning(false);
    setCountdown(warningSeconds);
    onPresenceBack(); // tell LedgerScreen to reset noPresence = false
  }, [warningSeconds, progressAnim, onPresenceBack]);

  // React to noPresence changes coming from LedgerScreen
  useEffect(() => {
    if (!enabled) return;

    if (noPresence && !showWarning) {
      // Phone went still — show the warning
      setShowWarning(true);
      setCountdown(warningSeconds);
    }

    if (!noPresence && showWarning) {
      // Presence returned — dismiss automatically
      handleDismiss();
    }
  }, [noPresence, enabled]);

  // Run countdown timer whenever warning becomes visible
  useEffect(() => {
    if (!showWarning) return;

    // Animate progress bar shrinking from 100% to 0%
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: warningSeconds * 1000,
      useNativeDriver: false,
    }).start();

    // Tick the number down every second
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setShowWarning(false);
          progressAnim.setValue(1);
          onLock(); // PANIC — wipe and return to calculator
          return warningSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [showWarning]);

  return (
    <View style={{ flex: 1 }}>
      {/* Render children directly — no cloneElement needed anymore */}
      {children}

      {/* Warning overlay modal */}
      <Modal visible={showWarning} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.card}>

            {/* Countdown ring */}
            <View style={styles.circleOuter}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
            </View>

            {/* Shrinking progress bar */}
            <View style={styles.progressBg}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>

            <Text style={styles.title}>Still there?</Text>
            <Text style={styles.subtitle}>
              App will lock in {countdown} second{countdown !== 1 ? 's' : ''}
            </Text>

            <TouchableOpacity style={styles.btn} onPress={handleDismiss}>
              <Text style={styles.btnText}>I'm Here</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 32,
    width: width * 0.8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  circleOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  countdownNumber: {
    color: '#FF3B30',
    fontSize: 44,
    fontWeight: '200',
  },
  progressBg: {
    width: '100%',
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressFill: {
    height: 4,
    backgroundColor: '#FF3B30',
    borderRadius: 2,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: '#34C759',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  btnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});