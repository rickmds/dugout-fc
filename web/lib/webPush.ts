import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails('mailto:rick@mdssoccer.com', publicKey, privateKey);
  configured = true;
}

// Sends to every web-push subscription for the given profiles. Expired/gone
// subscriptions (410/404) are pruned so they don't get retried forever.
export async function sendWebPush(
  profileIds: string[],
  payload: { title: string; body: string; data?: Record<string, unknown> }
) {
  ensureConfigured();
  if (!configured || !profileIds.length) return;

  const db = supabaseAdmin();
  const { data: subs } = await db
    .from('web_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('profile_id', profileIds);

  if (!subs?.length) return;

  const staleIds: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
      }
    })
  );

  if (staleIds.length) {
    await db.from('web_push_subscriptions').delete().in('id', staleIds);
  }
}
