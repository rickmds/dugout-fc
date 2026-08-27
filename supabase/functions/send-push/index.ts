import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Without this, a browser calling this function cross-origin (the web
// dashboard on pulse-fc.app calling *.supabase.co) sends a CORS preflight
// OPTIONS request first — with no Access-Control-Allow-Origin header to
// satisfy it, the browser silently blocks the real POST before it's ever
// sent. curl and the mobile app's fetch don't enforce this, which is why
// this bug was invisible from either of those and only ever bit web-
// dashboard-triggered pushes (e.g. announcements never notifying anyone).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  team_id?: string;
  profile_ids?: string[];
  title: string;
  body: string;
  exclude_profile_id?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const payload: PushPayload & { type?: string } = await req.json();
  const { team_id, profile_ids: directProfileIds, title, body, exclude_profile_id, data, type: notifType } = payload;

  // Fetch club slug for deep-link routing (from team_id if provided)
  let clubSlug = '';
  if (team_id) {
    const { data: teamRow } = await supabase
      .from('teams')
      .select('clubs(slug)')
      .eq('id', team_id)
      .single();
    clubSlug = (teamRow?.clubs as any)?.slug ?? '';
  }

  // Prefer top-level type, fall back to type already inside data, then 'general'
  const resolvedType = notifType ?? (data as any)?.type ?? 'general';
  // Prefer slug resolved from team_id; fall back to one already in data
  const finalClubSlug = clubSlug || (data as any)?.club_slug || '';
  const enrichedData = { ...(data ?? {}), type: resolvedType, club_slug: finalClubSlug };

  // Resolve profile IDs — either explicit list or all team members
  let profileIds: string[];
  if (directProfileIds?.length) {
    profileIds = directProfileIds.filter((id) => id !== exclude_profile_id);
  } else if (team_id) {
    const { data: members } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', team_id);
    if (!members?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: CORS });
    profileIds = members
      .map((m: any) => m.profile_id as string)
      .filter((id: string) => id !== exclude_profile_id);
  } else {
    return new Response(JSON.stringify({ error: 'team_id or profile_ids required' }), { status: 400, headers: CORS });
  }

  if (!profileIds.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  // ── DM notification collapse ──────────────────────────────────────────────
  // For new_dm: if the recipient already has an unread notification for this
  // conversation, update it in place instead of creating a new row.
  // This prevents a 30-message thread generating 30 separate notifications.

  let pushProfileIds = profileIds;

  if (resolvedType === 'new_dm') {
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
            profile_id, type: resolvedType, title, body, data: enrichedData,
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
        profile_id, type: resolvedType, title, body, data: enrichedData,
      })),
    );
  }

  // ── Push notifications ────────────────────────────────────────────────────

  if (!pushProfileIds.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: CORS });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('profile_id', pushProfileIds);

  if (!tokens?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: CORS });

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

  // Tokens Expo reports as DeviceNotRegistered (uninstalled, signed out on a
  // shared device, replaced phone) get pruned instead of sitting in
  // push_tokens forever and getting retried on every future send.
  const deadTokens: string[] = [];
  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = await res.json().catch(() => null) as { data?: Array<{ status: string; details?: { error?: string } }> } | null;
      json?.data?.forEach((ticket, idx) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(chunk[idx].to);
        }
      });
    } catch (err) {
      console.warn('[send-push] batch send failed:', err);
    }
  }
  if (deadTokens.length) {
    await supabase.from('push_tokens').delete().in('token', deadTokens);
  }

  return new Response(JSON.stringify({ sent: messages.length }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
