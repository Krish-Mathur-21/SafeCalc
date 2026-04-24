import { useEffect, useRef } from 'react';
import { Gyroscope } from 'expo-sensors';

interface Props {
  active: boolean;
  onFacesDetected: (count: number) => void;
  // These are injected by PresenceGuard via cloneElement
  onNoPresence?: () => void;
  onPresenceBack?: () => void;
}

export default function PresenceCamera({
  active,
  onFacesDetected,
  onNoPresence,
  onPresenceBack,
}: Props) {
  const lastMotionRef = useRef<number>(Date.now());
  const isStillRef = useRef(false);   // tracks if we already triggered "no presence"
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (!active) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      return;
    }

    Gyroscope.setUpdateInterval(500);

    subscriptionRef.current = Gyroscope.addListener(({ x, y, z }) => {
      const motion = Math.abs(x) + Math.abs(y) + Math.abs(z);

      if (motion > 0.02) {
        // Movement detected = human holding phone
        lastMotionRef.current = Date.now();

        if (isStillRef.current) {
          // Phone was still, now moving again → presence returned
          isStillRef.current = false;
          onFacesDetected(1);
          onPresenceBack?.();
        }
      } else {
        const stillDuration = Date.now() - lastMotionRef.current;

        if (stillDuration > 8000 && !isStillRef.current) {
          // Still for 8+ seconds and haven't triggered yet
          isStillRef.current = true;
          onFacesDetected(0);
          onNoPresence?.();
        }
      }
    });

    return () => {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [active, onFacesDetected, onNoPresence, onPresenceBack]);

  return null;
}