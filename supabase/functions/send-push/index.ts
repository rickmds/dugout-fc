import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  team_id: string;
  title: string;
  body: string;
  exclude_profile_id?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const payload: PushPayload = await req.json();
  const { team_id, title, body, exclude_profile_id, data } = payload;

  // Fetch club slug for deep-link routing
  const { data: teamRow } = await supabase
    .from('teams')
    .select('clubs(slug)')
    .eq('id', team_id)
    .single();
  const clubSlug = (teamRow?.clubs as any)?.slug ?? '';

  const enrichedData = { ...(data ?? {}), club_slug: clubSlug };
  const notifType = (enrichedData.type as string) ?? 'general';

  // Get all team members
  const { data: members } = await supabase
    .from('team_members')
    .select('profile_id')
    .eq('team_id', team_id);

  if (!members?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const profileIds: string[] = members
    .map((m: any) => m.profile_id as string)
    .filter((id: string) => id !== exclude_profile_id);

  if (!profileIds.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  // ── DM notification collapse ──────────────────────────────────────────────
  // For new_dm: if the recipient already has an unread notification for this
  // conversation, update it in place instead of creating a new row.
  // This prevents a 30-message thread generating 30 separate notifications.

  let pushProfileIds = profileIds;

  if (notifType === 'new_dm') {
    const conversationId = (enrichedData.conversation_id as string) ?? null;

    if (conversationId) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id, profile_id')
        .eq('type', 'new_dm')
        .eq('read', false)
        .filter('data->>conversation_id', 'eq', conversationId)
        .in('profile_id', profileIds);

      const existingProfileIds = new Set((existing ?? []).map((r: any) => r.profile_id as string));
      const existingRowIds = (existing ?? []).map((r: any) => r.id as string);

      // Profiles with an existing unread DM notification — silently update title/created_at
      if (existingRowIds.length) {
        await supabase
          .from('notifications')
          .update({ title, body, created_at: new Date().toISOString() })
          .in('id', existingRowIds);
      }

      // Profiles with no existing notification — insert new row + send push
      const newProfileIds = profileIds.filter((id) => !existingProfileIds.has(id));

      if (newProfileIds.length) {
        await supabase.from('notifications').insert(
          newProfileIds.map((profile_id) => ({
            profile_id, type: notifType, title, body, data: enrichedData,
          })),
        );
      }

      // Only push to people receiving their first notification for this conversation
      pushProfileIds = newProfileIds;
    } else {
      // No conversation_id — fall through to normal insert + push
      await supabase.from('notifications').insert(
        profileIds.map((profile_id) => ({
          profile_id, type: notifType, title, body, data: enrichedData,
        })),
      );
    }
  } else {
    // All other notification types — always insert
    await supabase.from('notifications').insert(
      profileIds.map((profile_id) => ({
        profile_id, type: notifType, title, body, data: enrichedData,
      })),
    );
  }

  // ── Push notifications ────────────────────────────────────────────────────

  if (!pushProfileIds.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('profile_id', pushProfileIds);

  if (!tokens?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const messages = tokens.map((t: any) => ({
    to: t.token,
    title,
    body,
    sound: 'default',
    data: enrichedData,
  }));

  // Expo push API accepts batches of up to 100
  const chunks: typeof messages[] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  for (const chunk of chunks) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
  }

  return new Response(JSON.stringify({ sent: messages.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
