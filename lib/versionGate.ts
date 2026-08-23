import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Dot-separated numeric version comparison — good enough for "1.3.1" style
// versions, no need for a full semver library here.
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// Checks the installed app's own version against app_version_gate. Fails
// open (never blocks) on any error or missing data — a network hiccup or a
// misconfigured row should never lock everyone out of the app.
export async function checkVersionGate(): Promise<boolean> {
  try {
    const installed = Constants.expoConfig?.version;
    if (!installed) return false;

    const { data, error } = await supabase
      .from('app_version_gate')
      .select('min_ios_version, min_android_version')
      .eq('id', 1)
      .single();
    if (error || !data) return false;

    const minVersion = Platform.OS === 'ios' ? data.min_ios_version : data.min_android_version;
    if (!minVersion) return false;

    return compareVersions(installed, minVersion) < 0;
  } catch {
    return false;
  }
}
