import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

const DAY_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_FULL: Record<string,string> = { Mon:'MONDAY', Tue:'TUESDAY', Wed:'WEDNESDAY', Thu:'THURSDAY', Fri:'FRIDAY', Sat:'SATURDAY', Sun:'SUNDAY' };

function fmt12(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m}${hr >= 12 ? 'pm' : 'am'}`;
}

function darken(hex: string, amount = 30): string {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

type SlotRow = { team: string|null; day_of_week: string; start_time: string|null; end_time: string|null; field_name: string|null; sub_zone: string|null };
type PlayerRow = { first_name: string; last_name: string; jersey_number: number|null; positions: string[]|null; dob: string|null; gender: string|null; town: string|null; parent_name: string|null; email_primary: string|null; email_secondary: string|null; phone: string|null };

function buildPracticeHtml(slots: SlotRow[], teamNames: string[], brandColor: string, coachName: string, season: string, teamsBullet: string): string {
  const relevant = slots.filter(s => s.team && teamNames.includes(s.team));

  const daysToShow = DAY_ORDER.filter(d => {
    if (['Mon','Tue','Wed','Thu','Fri'].includes(d)) return true;
    return relevant.some(s => s.day_of_week === d);
  });

  const cols = daysToShow.map(day => {
    const daySlots = relevant
      .filter(s => s.day_of_week === day)
      .sort((a,b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    return { day, daySlots };
  });

  const colW = Math.floor(100 / daysToShow.length);

  const headerCells = cols.map(c => `
    <td width="${colW}%" style="padding:10px 8px 8px;vertical-align:top;background:#F8FAFC;border-radius:6px 6px 0 0;border:1px solid #E2E8F0;border-bottom:none;">
      <span style="font-size:10px;font-weight:800;color:${c.daySlots.length > 0 ? brandColor : '#94A3B8'};text-transform:uppercase;letter-spacing:1px;">${DAY_FULL[c.day]}</span>
      <span style="display:block;font-size:10px;color:#94A3B8;margin-top:2px;">${c.daySlots.length > 0 ? `${c.daySlots.length} session${c.daySlots.length !== 1 ? 's' : ''}` : '—'}</span>
    </td>`).join('');

  const bodyCells = cols.map(c => {
    const inner = c.daySlots.length > 0
      ? c.daySlots.map(s => `
          <div style="border-left:3px solid ${brandColor};padding:6px 8px;margin-bottom:8px;background:#fff;border-radius:0 4px 4px 0;border:1px solid #E2E8F0;border-left:3px solid ${brandColor};">
            <span style="display:block;font-size:13px;font-weight:700;color:#0F172A;">${fmt12(s.start_time)}–${fmt12(s.end_time)}</span>
            <span style="display:block;font-size:11px;color:#64748B;margin-top:2px;">${s.team}</span>
          </div>`).join('')
      : `<span style="font-size:12px;color:#CBD5E1;font-style:italic;">No practices</span>`;
    return `<td width="${colW}%" style="padding:8px;vertical-align:top;background:#F8FAFC;border-radius:0 0 6px 6px;border:1px solid #E2E8F0;border-top:none;">${inner}</td>`;
  }).join('');

  return `
    <div style="margin-bottom:32px;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
      <!-- Header -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:${brandColor};padding:14px 20px;width:60%;">
            <span style="display:block;font-size:10px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:2px;margin-bottom:2px;">Practice Schedule</span>
            <span style="display:block;font-size:17px;font-weight:900;color:#fff;">${coachName}</span>
            <span style="display:block;font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">${teamsBullet}</span>
          </td>
          <td style="background:${darken(brandColor)};padding:14px 20px;text-align:right;width:40%;">
            <span style="display:block;font-size:10px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:2px;">Season</span>
            <span style="display:block;font-size:15px;font-weight:800;color:#fff;">${season}</span>
            <span style="display:block;font-size:11px;color:rgba(255,255,255,0.65);margin-top:2px;">Weekly view</span>
          </td>
        </tr>
      </table>
      <!-- Day columns -->
      <div style="padding:16px;">
        <table width="100%" cellpadding="0" cellspacing="4" border="0">
          <tr>${headerCells}</tr>
          <tr>${bodyCells}</tr>
        </table>
      </div>
    </div>`;
}

function playerCard(p: PlayerRow, num: number, brandColor: string): string {
  const dob = p.dob ? new Date(p.dob).toISOString().split('T')[0] : null;
  const meta = [p.gender, dob ? `DOB ${dob}` : null, p.town].filter(Boolean).join(' · ');
  const emails = [p.email_primary, p.email_secondary].filter(Boolean).join(',\n');
  return `
    <div style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;height:100%;">
      <!-- Player name row -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #F1F5F9;">
        <tr>
          <td width="36" style="padding:10px 0 10px 12px;vertical-align:top;">
            <div style="width:28px;height:28px;border-radius:50%;background:${brandColor};color:#fff;font-size:12px;font-weight:800;text-align:center;line-height:28px;">${num}</div>
          </td>
          <td style="padding:10px 12px 10px 8px;vertical-align:top;">
            <span style="display:block;font-size:14px;font-weight:800;color:#0F172A;">${p.first_name} ${p.last_name}</span>
            ${meta ? `<span style="display:block;font-size:11px;color:#94A3B8;margin-top:2px;">${meta}</span>` : ''}
          </td>
        </tr>
      </table>
      <!-- Contact -->
      <div style="padding:10px 12px;">
        <span style="display:block;font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:3px;">PARENT</span>
        <span style="display:block;font-size:13px;color:#374151;margin-bottom:7px;">${p.parent_name ?? '—'}</span>
        <span style="display:block;font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:3px;">EMAIL</span>
        <span style="display:block;font-size:12px;color:#374151;margin-bottom:7px;">${emails || '—'}</span>
        <span style="display:block;font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:3px;">PHONE</span>
        <span style="display:block;font-size:13px;color:#374151;">${p.phone ?? '—'}</span>
      </div>
    </div>`;
}

function buildRosterHtml(players: PlayerRow[], teamName: string, role: string, coachName: string, brandColor: string, season: string): string {
  const pairs: PlayerRow[][] = [];
  for (let i = 0; i < players.length; i += 2) {
    pairs.push(players.slice(i, i + 2));
  }
  const rows = pairs.map((pair, pi) => `
    <tr>
      <td width="50%" style="vertical-align:top;padding:0 6px 12px 0;">${playerCard(pair[0], pi*2+1, brandColor)}</td>
      <td width="50%" style="vertical-align:top;padding:0 0 12px 6px;">${pair[1] ? playerCard(pair[1], pi*2+2, brandColor) : ''}</td>
    </tr>`).join('');

  return `
    <div style="margin-bottom:32px;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
      <!-- Header -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:${brandColor};padding:14px 20px;width:55%;">
            <span style="display:block;font-size:10px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:2px;margin-bottom:2px;">Team Roster</span>
            <span style="display:block;font-size:20px;font-weight:900;color:#fff;">${teamName}</span>
            <span style="display:block;font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;">${season}</span>
          </td>
          <td style="background:${darken(brandColor)};padding:14px 20px;text-align:right;width:45%;">
            <span style="display:block;font-size:10px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:2px;">${role.toUpperCase()}</span>
            <span style="display:block;font-size:16px;font-weight:800;color:#fff;">${coachName}</span>
          </td>
        </tr>
      </table>
      <!-- Roster grid -->
      <div style="padding:16px 20px;">
        <span style="display:block;font-size:13px;color:#94A3B8;margin-bottom:14px;">${players.length} players</span>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </div>
    </div>`;
}

// POST /api/tryout/send-coach-packet
// body: { coach_ids: string[], club_id: string, season_label: string }
export async function POST(req: NextRequest) {
  const { coach_ids, club_id, season_label } = await req.json();
  if (!coach_ids?.length || !club_id) {
    return NextResponse.json({ error: 'coach_ids and club_id required' }, { status: 400 });
  }

  const db = sb();

  const { data: club } = await db.from('clubs').select('name, primary_color, logo_url').eq('id', club_id).single();
  const clubName   = club?.name ?? 'Your Club';
  const brandColor = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const { data: coaches } = await db
    .from('tryout_coaches')
    .select('id, full_name, email')
    .in('id', coach_ids)
    .eq('club_id', club_id);

  if (!coaches?.length) return NextResponse.json({ error: 'No coaches found' }, { status: 404 });

  const { data: allTeams } = await db
    .from('tryout_teams')
    .select('id, name, age_group, gender, color, head_coach_id')
    .eq('club_id', club_id);

  const { data: allSlots } = await db
    .from('tryout_practice_slots')
    .select('team, day_of_week, start_time, end_time, field_name, sub_zone')
    .eq('club_id', club_id)
    .eq('season_label', season_label);

  const { data: allAssignments } = await db
    .from('tryout_coach_assignments')
    .select('coach_id, team, role')
    .eq('club_id', club_id);

  const results: { coach_id: string; ok: boolean; error?: string }[] = [];

  for (const coach of coaches) {
    if (!coach.email) {
      results.push({ coach_id: coach.id, ok: false, error: 'No email address' });
      continue;
    }

    // Determine teams
    const assignments = (allAssignments ?? []).filter(a => a.coach_id === coach.id);
    const headViaAssign = assignments.filter(a => a.role === 'head').map(a => a.team);
    const headViaTeams  = (allTeams ?? []).filter(t => t.head_coach_id === coach.id).map(t => t.name);
    const assistTeams   = assignments.filter(a => a.role === 'assistant').map(a => a.team);
    const headTeamNames = [...new Set([...headViaAssign, ...headViaTeams])];
    const allTeamNames  = [...new Set([...headTeamNames, ...assistTeams])];

    if (allTeamNames.length === 0) {
      results.push({ coach_id: coach.id, ok: false, error: 'No teams assigned' });
      continue;
    }

    // Cover: teams list
    const teamsListHtml = allTeamNames.map(tn => {
      const isHead = headTeamNames.includes(tn);
      return `<tr>
        <td style="padding:5px 0;font-size:14px;font-weight:700;color:#0F172A;">&#8226; ${tn}</td>
        <td style="padding:5px 0;font-size:13px;color:#94A3B8;text-align:right;">${isHead ? 'Head Coach' : 'Assistant Coach'}</td>
      </tr>`;
    }).join('');

    // Practice schedule
    const practiceHtml = buildPracticeHtml(
      (allSlots ?? []) as SlotRow[],
      allTeamNames,
      brandColor,
      coach.full_name,
      season_label,
      allTeamNames.join(' • ')
    );

    // Roster per team
    let rostersHtml = '';
    for (const teamName of allTeamNames) {
      const isHead = headTeamNames.includes(teamName);
      const role = isHead ? 'Head Coach' : 'Assistant Coach';

      const { data: assigned } = await db
        .from('tryout_assignments')
        .select('player_id')
        .eq('club_id', club_id)
        .eq('team', teamName)
        .in('status', ['Offer','Accepted']);

      const playerIds = (assigned ?? []).map(a => a.player_id);

      if (playerIds.length === 0) {
        rostersHtml += `
          <div style="margin-bottom:24px;border-radius:10px;overflow:hidden;border:1px solid #E2E8F0;">
            <div style="background:${brandColor};padding:14px 20px;">
              <span style="display:block;font-size:18px;font-weight:900;color:#fff;">${teamName}</span>
              <span style="display:block;font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;">${role}</span>
            </div>
            <div style="padding:16px 20px;font-size:13px;color:#94A3B8;">No roster assigned yet.</div>
          </div>`;
        continue;
      }

      const { data: players } = await db
        .from('tryout_players')
        .select('first_name, last_name, jersey_number, positions, dob, gender, town, parent_name, email_primary, email_secondary, phone')
        .in('id', playerIds)
        .order('last_name');

      rostersHtml += buildRosterHtml(
        (players ?? []) as PlayerRow[],
        teamName,
        role,
        coach.full_name,
        brandColor,
        season_label
      );
    }

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:24px 16px;">

  <!-- Cover header -->
  <div style="background:${brandColor};border-radius:12px 12px 0 0;padding:28px 32px 24px;">
    <span style="display:block;font-size:10px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:2.5px;margin-bottom:10px;">${clubName}</span>
    <span style="display:block;font-size:32px;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1.1;">Coach Packet</span>
    <span style="display:block;font-size:15px;color:rgba(255,255,255,0.8);margin-top:6px;">${season_label} Season</span>
    <span style="display:block;font-size:12px;color:rgba(255,255,255,0.6);font-style:italic;margin-top:4px;">Everything you need to lead your team this season.</span>
  </div>

  <!-- Cover body -->
  <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px 24px;margin-bottom:24px;">

    <!-- Prepared For -->
    <div style="border:1px solid #E2E8F0;border-radius:8px;padding:18px 22px;margin-bottom:24px;">
      <span style="display:block;font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">PREPARED FOR</span>
      <span style="display:block;font-size:22px;font-weight:900;color:#0F172A;">${coach.full_name}</span>
      <span style="display:block;font-size:13px;color:#64748B;margin-top:4px;">${coach.email}</span>
      <span style="display:block;font-size:13px;color:#64748B;margin-top:2px;">${allTeamNames.length} team${allTeamNames.length !== 1 ? 's' : ''} assigned</span>
    </div>

    <!-- Your Teams -->
    <div style="margin-bottom:22px;">
      <span style="display:block;font-size:15px;font-weight:700;color:${brandColor};margin-bottom:4px;">Your Teams</span>
      <div style="height:2px;background:${brandColor};width:50px;margin-bottom:10px;"></div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">${teamsListHtml}</table>
    </div>

    <!-- Contents -->
    <div style="margin-bottom:22px;">
      <span style="display:block;font-size:14px;font-weight:700;color:${brandColor};margin-bottom:8px;">Contents of this packet</span>
      <ol style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:1.9;">
        <li>Team assignments and contact information for the season</li>
        <li>Weekly practice schedule across all your teams</li>
        <li>Full team rosters with player and parent contact details</li>
      </ol>
    </div>

    <!-- Confidentiality -->
    <div style="font-size:12px;color:#94A3B8;font-style:italic;border-top:1px solid #F1F5F9;padding-top:14px;">
      This packet contains private contact information for ${clubName} families. Please keep it confidential and use it only for club-related communication.
    </div>
  </div>

  <!-- Practice schedule -->
  ${practiceHtml}

  <!-- Rosters -->
  ${rostersHtml}

  <!-- Footer -->
  <div style="text-align:center;padding:14px;font-size:11px;color:#CBD5E1;">
    ${clubName} &mdash; Confidential &nbsp;·&nbsp; <a href="${APP_URL}" style="color:#CBD5E1;text-decoration:none;">${APP_URL}</a>
  </div>
</div>
</body>
</html>`;

    try {
      await resend.emails.send({
        from: `${clubName} <info@pulse-fc.app>`,
        to: coach.email,
        subject: `${clubName} — Coach Packet ${season_label}`,
        html,
      });
      await db.from('tryout_coaches').update({ packet_sent_at: new Date().toISOString() }).eq('id', coach.id);
      results.push({ coach_id: coach.id, ok: true });
    } catch (err: unknown) {
      results.push({ coach_id: coach.id, ok: false, error: String(err) });
    }
  }

  const sent = results.filter(r => r.ok).length;
  return NextResponse.json({ sent, total: coach_ids.length, results });
}
