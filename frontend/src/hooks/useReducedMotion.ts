import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

function initialReducedMotion(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    : false;
}

/** Keeps ambient and interactive motion aligned with the device preference. */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
