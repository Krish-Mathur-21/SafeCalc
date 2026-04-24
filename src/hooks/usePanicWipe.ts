import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Accelerometer } from 'expo-sensors';

interface PanicWipeOptions {
  onPanic: () => void;
  isInsideHiddenModule: boolean;
}

export function usePanicWipe({ onPanic, isInsideHiddenModule }: PanicWipeOptions) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastShakeRef = useRef<number>(0);
  const shakeCountRef = useRef<number>(0);

  const triggerPanic = useCallback(() => {
    if (isInsideHiddenModule) onPanic();
  }, [isInsideHiddenModule, onPanic]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appStateRef.current === 'active' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        triggerPanic();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [triggerPanic]);

  useEffect(() => {
    if (!isInsideHiddenModule) return;
    Accelerometer.setUpdateInterval(100);
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (acceleration > 2.5) {
        if (now - lastShakeRef.current < 800) {
          shakeCountRef.current += 1;
          if (shakeCountRef.current >= 2) {
            shakeCountRef.current = 0;
            triggerPanic();
          }
        } else {
          shakeCountRef.current = 1;
        }
        lastShakeRef.current = now;
      }
    });
    return () => subscription.remove();
  }, [isInsideHiddenModule, triggerPanic]);
}