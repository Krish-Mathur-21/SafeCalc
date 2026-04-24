import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface Props {
  active: boolean;
  onFacesDetected: (count: number) => void;
  checkIntervalMs?: number;
  onNoPresence?: () => void;
  onPresenceBack?: () => void;
}

type FaceDetectionEvent = {
  nativeEvent?: {
    faces?: unknown[];
    face?: unknown[];
    detectedFaces?: unknown[];
  };
};

type FaceCameraProps = React.ComponentProps<typeof CameraView> & {
  onFacesDetected?: (event: FaceDetectionEvent) => void;
  onFaceDetectionError?: (event: unknown) => void;
};

const NativeCameraView = CameraView as React.ComponentType<FaceCameraProps>;

export default function PresenceCamera({
  active,
  onFacesDetected,
  checkIntervalMs = 5000,
  onNoPresence,
  onPresenceBack,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastFaceRef = useRef<number>(Date.now());
  const isMissingRef = useRef(false);
  const requestPendingRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const extractFaceCount = useCallback((event: FaceDetectionEvent | unknown) => {
    // Try multiple ways to extract face count from the event
    if (!event) return 0;

    // Direct array
    if (Array.isArray(event)) {
      return event.length;
    }

    const evt = event as any;

    // Try nativeEvent first
    if (evt.nativeEvent) {
      const ne = evt.nativeEvent;
      if (Array.isArray(ne)) return ne.length;
      if (Array.isArray(ne.faces)) return ne.faces.length;
      if (Array.isArray(ne.face)) return ne.face.length;
      if (Array.isArray(ne.detectedFaces)) return ne.detectedFaces.length;
      if (typeof ne.faceCount === 'number') return ne.faceCount;
    }

    // Try top-level properties
    if (Array.isArray(evt.faces)) return evt.faces.length;
    if (Array.isArray(evt.face)) return evt.face.length;
    if (Array.isArray(evt.detectedFaces)) return evt.detectedFaces.length;
    if (typeof evt.faceCount === 'number') return evt.faceCount;

    return 0;
  }, []);

  const handleFacesDetected = useCallback(
    (event: FaceDetectionEvent) => {
      const count = extractFaceCount(event);

      if (__DEV__) {
        console.log('PresenceCamera face detection:', { count, active });
      }

      if (count > 0) {
        lastFaceRef.current = Date.now();

        if (isMissingRef.current) {
          isMissingRef.current = false;
          onFacesDetected(1);
          onPresenceBack?.();
        }

        return;
      }

      onFacesDetected(0);
    },
    [extractFaceCount, onFacesDetected, onPresenceBack]
  );

  useEffect(() => {
    if (!active) {
      return;
    }

    if (!permission) {
      return;
    }

    if (permission.status === 'undetermined') {
      if (!requestPendingRef.current) {
        requestPendingRef.current = true;
        void requestPermission().finally(() => {
          requestPendingRef.current = false;
        });
      }
      return;
    }

    lastFaceRef.current = Date.now();
    isMissingRef.current = false;

    const interval = setInterval(() => {
      if (Date.now() - lastFaceRef.current >= checkIntervalMs && !isMissingRef.current) {
        isMissingRef.current = true;
        onFacesDetected(0);
        onNoPresence?.();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [active, checkIntervalMs, onFacesDetected, onNoPresence, onPresenceBack, permission, requestPermission]);

  useEffect(() => {
    if (!cameraError || !active) {
      return;
    }

    onNoPresence?.();
  }, [active, cameraError, onNoPresence]);

  if (!active || !permission?.granted) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.hiddenCameraLayer}>
      <NativeCameraView
        style={styles.hiddenCamera}
        facing="front"
        active
        mirror
        onFacesDetected={handleFacesDetected}
        onFaceDetectionError={() => {
          setCameraError('Face detection is not available right now.');
        }}
        onMountError={({ message }) => {
          setCameraError(message || 'Camera could not start.');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenCameraLayer: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  hiddenCamera: {
    width: 1,
    height: 1,
  },
});
