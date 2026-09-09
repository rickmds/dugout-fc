import { supabaseAdmin } from '@/lib/supabase';

// Staff/coach/admin notifications (and a few parent ones reached only via
// player_guardians, not an invites.email row) only ever have profile ids in
// scope, not emails. profiles.id === the auth user id in this schema, so
// listUsers + a local filter is the lookup — same one already duplicated
// across a few routes before this got pulled out.
export async function resolveProfileEmails(
  supabase: ReturnType<typeof supabaseAdmin>,
  profileIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!profileIds.length) return map;
  const idSet = new Set(profileIds);
  // listUsers paginates at 1000/page — clubs are nowhere near that size
  // today, but loop rather than silently truncating if that ever changes.
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000, page });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (idSet.has(u.id) && u.email) map.set(u.id, u.email);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  return map;
}
