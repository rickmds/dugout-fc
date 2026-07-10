import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

type CoachInput = { full_name: string; email: string; team_id: string | null; team_name: string };

export async function POST(req: NextRequest) {
  const { coaches, club_id, clubName, clubColor } = await req.json() as {
    coaches: CoachInput[];
    club_id: string;
    clubName: string;
    clubColor: string;
  };

  if (!coaches?.length) return NextResponse.json({ sent: 0 });

  const accent = clubColor && clubColor !== '#000000' && clubColor !== '#ffffff' ? clubColor : '#22C55E';
  const year   = new Date().getFullYear();
  const results: { email: string; status: 'ok' | 'error'; error?: string }[] = [];

  for (const coach of coaches) {
    try {
      // 1. Create auth user (or find existing)
      let userId: string | null = null;
      const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
        email:         coach.email,
        email_confirm: false,
        user_metadata: { full_name: coach.full_name },
      });

      if (createErr) {
        const { data: { users } } = await adminSupabase.auth.admin.listUsers();
        const existing = users.find(u => u.email?.toLowerCase() === coach.email.toLowerCase());
        if (existing) userId = existing.id;
        else { results.push({ email: coach.email, status: 'error', error: createErr.message }); continue; }
      } else {
        userId = created.user.id;
      }

      if (!userId) { results.push({ email: coach.email, status: 'error', error: 'No user ID' }); continue; }

      // 2. Upsert profile with coach role
      await adminSupabase.from('profiles').upsert(
        { id: userId, full_name: coach.full_name, role: 'coach', club_id },
        { onConflict: 'id', ignoreDuplicates: false }
      );

      // 3. Add to team_members so dashboard shows them as assigned
      if (coach.team_id) {
        await adminSupabase.from('team_members').upsert(
          { team_id: coach.team_id, profile_id: userId, role: 'coach' },
          { onConflict: 'team_id,profile_id', ignoreDuplicates: true }
        );
      }

      // 4. Generate password-setup link (no email sent by Supabase)
      const { data: linkData } = await adminSupabase.auth.admin.generateLink({
        type:    'recovery',
        email:   coach.email,
        options: { redirectTo: 'https://pulse-fc.app/dashboard' },
      });
      const setupLink = linkData?.properties?.action_link ?? 'https://pulse-fc.app/login';

      // 5. Send branded email with setup link
      const teamLine = coach.team_name ? `for <strong>${coach.team_name}</strong> ` : '';
      await resend.emails.send({
        from:    `${clubName} <info@pulse-fc.app>`,
        to:      coach.email,
        subject: `You've been added as a coach at ${clubName}`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr><td style="height:4px;background:${accent};"></td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.2px;">You've been added as a coach</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#0f172a;line-height:1.3;">Welcome to ${clubName}, ${coach.full_name.split(' ')[0]}! 👋</h1>
          <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.7;">
            You've been set up as a coach ${teamLine}at <strong style="color:${accent};">${clubName}</strong> on Pulse FC.
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
            Click below to set your password — your team's roster, schedule, and roster are already set up and waiting.
          </p>
          <a href="${setupLink}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;">Set up my account →</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            ${clubName} uses <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a> for club management. &copy; ${year} ${clubName}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });

      results.push({ email: coach.email, status: 'ok' });
    } catch (err) {
      console.error(`[invite-coach] ${coach.email}:`, err);
      results.push({ email: coach.email, status: 'error', error: String(err) });
    }
  }

  return NextResponse.json({
    sent:   results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'error').length,
    results,
  });
}
