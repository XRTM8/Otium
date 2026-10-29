/**
 * Tactile Micro-Haptic Feedback Utility.
 * Provides subtle physical vibration feedback on supported mobile devices.
 * Completely safe and gracefully silent when unsupported or in desktop environments.
 */

export type HapticStyle = 'selection' | 'light' | 'medium' | 'heavy' | 'boundary' | 'success';

const HAPTIC_PATTERNS: Record<HapticStyle, number | number[]> = {
  // Ultra-light 8ms tick for scrubber steps, theme switches, and slider adjustments
  selection: 8,
  // Crisp 14ms tactile micro-tap for bookmarking and button presses
  light: 14,
  // Standard 24ms tap for mode toggles
  medium: 24,
  // Pronounced 35ms tap
  heavy: 35,
  // Double-tap pulse for bouncing at the start or end of a document
  boundary: [15, 45, 18],
  // Affirmative snap for document save or action completion
  success: [12, 50, 20],
};

export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    const pattern = HAPTIC_PATTERNS[style];
    navigator.vibrate(pattern);
  } catch {
    // Gracefully ignore devices without vibration motors or restricted webviews
  }
}
