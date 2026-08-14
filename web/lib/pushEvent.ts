import { supabase } from '@/lib/supabase';

// Shared by every dashboard call site that notifies a team about an event
// change — /api/push-event requires an authenticated org_admin/coach, so
// every caller needs the same access-token header.
export async function sendEventPush(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch('/api/push-event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  });
}
