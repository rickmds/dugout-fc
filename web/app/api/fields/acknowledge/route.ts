import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

// No-login GET endpoint — coaches click the link in their email
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const closure_id  = searchParams.get('closure_id');
  const coach_email = searchParams.get('coach_email');
  const coach_name  = searchParams.get('coach_name');

  if (!closure_id || !coach_email) {
    return new NextResponse(ackPage('Invalid link', 'This acknowledgement link is missing required information.', false), {
      status: 400, headers: { 'Content-Type': 'text/html' },
    });
  }

  const sb = supabaseAdmin();

  // Fetch closure to verify it exists
  const { data: closure } = await sb
    .from('field_closures')
    .select('id, field_name, club_id')
    .eq('id', closure_id)
    .single();

  if (!closure) {
    return new NextResponse(ackPage('Not found', 'This closure no longer exists.', false), {
      status: 404, headers: { 'Content-Type': 'text/html' },
    });
  }

  // Fetch club for branding
  const { data: club } = await sb
    .from('clubs')
    .select('name, primary_color, logo_url')
    .eq('id', closure.club_id)
    .single();

  const clubName  = club?.name ?? 'Your club';
  const primary   = (club?.primary_color && club.primary_color !== '#000000') ? club.primary_color : '#22C55E';

  // Upsert acknowledgement (idempotent — clicking twice is fine)
  const { error } = await sb
    .from('field_closure_acknowledgements')
    .upsert({
      closure_id,
      coach_email: coach_email.toLowerCase(),
      coach_name: coach_name ?? null,
      acknowledged_at: new Date().toISOString(),
    }, { onConflict: 'closure_id,coach_email' });

  if (error) {
    return new NextResponse(ackPage('Error', 'Something went wrong. Please try again.', false), {
      status: 500, headers: { 'Content-Type': 'text/html' },
    });
  }

  return new NextResponse(
    ackPage(
      `Got it, ${coach_name?.split(' ')[0] ?? 'Coach'}!`,
      `You've confirmed receipt of the <strong>${closure.field_name}</strong> closure notice from <strong>${clubName}</strong>. Your admin has been notified.`,
      true,
      primary,
      club?.logo_url ?? null,
      clubName,
      APP_URL,
    ),
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

function ackPage(title: string, body: string, success: boolean, color = '#22C55E', logoUrl: string | null = null, clubName = '', appUrl = '') {
  const icon = success ? '✅' : '❌';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F0F2F5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #fff; border-radius: 16px; padding: 40px 36px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 900; color: #0F172A; margin-bottom: 10px; }
    p { font-size: 14px; color: #64748B; line-height: 1.7; }
    .badge { display: inline-block; margin-top: 20px; padding: 6px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; color: #fff; background: ${color}; }
  </style>
</head>
<body>
  <div class="card">
    ${logoUrl ? `<img src="${logoUrl}" height="40" style="margin-bottom:16px;">` : ''}
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    ${success ? `<div class="badge">${clubName || 'Acknowledged'}</div>` : ''}
    ${appUrl ? `<p style="margin-top:20px;font-size:12px;color:#CBD5E1;">Powered by <a href="${appUrl}" style="color:#94A3B8;">Pulse FC</a></p>` : ''}
  </div>
</body>
</html>`;
}
