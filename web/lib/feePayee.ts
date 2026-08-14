import { supabase } from '@/lib/supabase';

// Remembers a coach's "how to pay me directly" note on their profile so it
// pre-fills next time, without a separate settings screen — whatever they
// type when creating a coach-collected fee becomes their new default.
export async function syncPaymentInstructions(profileId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  await supabase.from('profiles').update({ payment_instructions: trimmed }).eq('id', profileId);
}
