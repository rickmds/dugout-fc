import { Alert } from 'react-native';

// Mobile's equivalent of web's <UpgradePrompt /> card — a native Alert
// instead of a custom modal, matching how every other "you can't do this"
// message in this app is already shown (Alert.alert throughout), rather
// than introducing a one-off modal design just for plan gates.
export function showUpgradePrompt(feature: string, requiredPlan: string, description?: string) {
  Alert.alert(
    `${feature} — ${requiredPlan}+ feature`,
    description ?? `Upgrade your club to the ${requiredPlan} plan or higher to use this.`,
  );
}
