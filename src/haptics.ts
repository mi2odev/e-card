import * as Haptics from 'expo-haptics';

// Every call is fire-and-forget: haptics must never break the game loop.
const safe = (fn: () => Promise<unknown>) => {
  try {
    void fn();
  } catch {
    /* noop */
  }
};

export const tapLight = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const tapMedium = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const tapHeavy = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
export const tick = () => safe(() => Haptics.selectionAsync());
export const win = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const draw = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
export const upset = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
