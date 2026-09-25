import { supabaseAdmin } from '@/lib/supabase';

// Minimal sliding-window limiter backed by rate_limit_hits — no
// Redis/external infra in this codebase to reuse. Self-cleaning: each call
// deletes this bucket's own stale rows before counting, so a bucket that
// stops being hit doesn't linger forever.
export async function checkRateLimit(
  supabase: ReturnType<typeof supabaseAdmin>,
  bucket: string,
  opts: { max: number; windowSeconds: number },
): Promise<boolean> {
  const since = new Date(Date.now() - opts.windowSeconds * 1000).toISOString();

  await supabase.from('rate_limit_hits').delete().eq('bucket', bucket).lt('created_at', since);

  const { count } = await supabase
    .from('rate_limit_hits')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .gte('created_at', since);

  if ((count ?? 0) >= opts.max) return false;

  await supabase.from('rate_limit_hits').insert({ bucket });
  return true;
}
