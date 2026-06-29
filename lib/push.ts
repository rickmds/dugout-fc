import { supabase } from './supabase';

interface PushOptions {
  teamId: string;
  title: string;
  body: string;
  excludeProfileId?: string;
  data?: Record<string, unknown>;
}

export async function sendTeamPush(opts: PushOptions) {
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        team_id: opts.teamId,
        title: opts.title,
        body: opts.body,
        exclude_profile_id: opts.excludeProfileId,
        data: opts.data ?? {},
      },
    });
  } catch {
    // Push is best-effort — never block the main action
  }
}
