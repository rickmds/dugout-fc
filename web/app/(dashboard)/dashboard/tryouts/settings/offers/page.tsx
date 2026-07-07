'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Save, ChevronDown, ChevronRight, Info, Link2, Mail, Eye, X } from 'lucide-react';

type OfferSettings = {
  id?: string;
  email_subject: string;
  from_name: string;
  offer_deadline: string;
  email_body_html: string;
  email_body_html_u8: string;
  payment_link: string;
  club_website_url: string;
  uniform_shop_url: string;
};

type EmailTemplate = {
  id?: string;
  template_key: 'waitlist' | 'decline' | 'reminder';
  subject: string;
  from_name: string;
  body_html: string;
};

const BLANK: OfferSettings = {
  email_subject: 'Your Roster Offer — {{team_name}}',
  from_name: '', offer_deadline: '',
  email_body_html: '', email_body_html_u8: '',
  payment_link: '',
  club_website_url: '', uniform_shop_url: '',
};

const TEMPLATE_LABELS: Record<string, string> = { waitlist: 'Waitlist', decline: 'Decline', reminder: 'Reminder' };

const MERGE_TOKENS = [
  { token: '{{player_first_name}}', desc: 'Player first name' },
  { token: '{{player_full_name}}',  desc: 'Player full name' },
  { token: '{{parent_name}}',       desc: 'Parent / guardian name' },
  { token: '{{team_name}}',         desc: 'Team name' },
  { token: '{{age_group}}',         desc: 'Age group (e.g. U11)' },
  { token: '{{club_name}}',         desc: 'Club name' },
  { token: '{{season_label}}',      desc: 'Season (e.g. 2026-27)' },
  { token: '{{offer_deadline}}',    desc: 'Deadline to respond' },
  { token: '{{season_fee}}',        desc: 'Fee — set per team in Team Setup' },
  { token: '{{deposit_amount}}',    desc: 'Deposit — set per team in Team Setup' },
  { token: '{{payment_link}}',      desc: 'Link to pay' },
  { token: '{{uniform_link}}',      desc: 'Uniform shop link' },
  { token: '{{club_website}}',      desc: 'Club website' },
  { token: '{{coach_name}}',        desc: 'Head coach full name' },
  { token: '{{accept_link}}',       desc: 'One-click accept button' },
  { token: '{{decline_link}}',      desc: 'One-click decline button' },
];

const DEFAULT_OFFER_BODY = `<p>Dear {{parent_name}},</p>

<p>It is our pleasure to offer <strong>{{player_full_name}}</strong> a roster spot on the <strong>{{team_name}}</strong> team for the {{season_label}} season. This is the result of a competitive tryout process, and we're thrilled to invite {{player_first_name}} to continue their journey with {{club_name}}.</p>

<p>Please take a moment to review the details below before accepting your spot.</p>

<h2>Your Team</h2>
<div style="background:#fafafa;border-radius:8px;margin:8px 0;padding:4px 16px;">
  <div style="display:block;padding:12px 0;border-bottom:1px solid #eee;"><span style="display:inline-block;width:130px;color:#6b7280;font-size:13px;">Team</span><span style="font-weight:600;">{{team_name}}</span></div>
  <div style="display:block;padding:12px 0;border-bottom:1px solid #eee;"><span style="display:inline-block;width:130px;color:#6b7280;font-size:13px;">Age Group</span><span style="font-weight:600;">{{age_group}}</span></div>
  <div style="display:block;padding:12px 0;"><span style="display:inline-block;width:130px;color:#6b7280;font-size:13px;">Head Coach</span><span style="font-weight:600;">{{coach_name}}</span></div>
</div>

<h2>Training Schedule</h2>
<div style="background:#fafafa;border-left:3px solid #6b7280;padding:14px 18px;border-radius:4px;margin:8px 0;">
  <ul style="margin:0;padding-left:18px;"><li>Wednesday 5:00 PM–6:30 PM</li><li>Monday 5:00 PM–6:30 PM</li></ul>
</div>
<p style="font-size:13px;color:#6b7280;">We maintain this schedule through spring whenever possible. Your coach will reach out shortly with a personal welcome.</p>

<h2>Team Expectations</h2>
<ul>
  <li>{{club_name}} is your player's primary team during fall and spring seasons</li>
  <li>Consistent 85% attendance at practices and games is required</li>
  <li>Attendance will be tracked in the Dugout FC app — please mark your availability for all games and training sessions so coaches can plan accordingly.</li>
</ul>

<h2>Program Cost</h2>
<div style="background:#fafafa;border-radius:8px;margin:8px 0;padding:4px 16px;">
  <div style="display:block;padding:12px 0;border-bottom:1px solid #eee;"><span style="display:inline-block;width:150px;color:#6b7280;font-size:13px;">Total Registration Fee</span><span style="font-weight:700;">{{season_fee}}</span></div>
  <div style="display:block;padding:12px 0;border-bottom:1px solid #eee;"><span style="display:inline-block;width:150px;color:#111827;font-size:13px;font-weight:600;">Installment 1</span><span style="display:inline-block;width:90px;font-weight:700;">{{deposit_amount}}</span><span style="color:#6b7280;font-size:13px;">Due upon acceptance of roster spot</span></div>
  <div style="display:block;padding:12px 0;border-bottom:1px solid #eee;"><span style="display:inline-block;width:150px;color:#111827;font-size:13px;font-weight:600;">Installment 2</span><span style="display:inline-block;width:90px;font-weight:700;">TBD</span><span style="color:#6b7280;font-size:13px;">Date TBD</span></div>
  <div style="display:block;padding:12px 0;"><span style="display:inline-block;width:150px;color:#111827;font-size:13px;font-weight:600;">Installment 3</span><span style="display:inline-block;width:90px;font-weight:700;">TBD</span><span style="color:#6b7280;font-size:13px;">Date TBD</span></div>
</div>
<ul style="font-size:13px;color:#4b5563;">
  <li>All payments must be made via the payment link below (no personal checks or Venmo)</li>
  <li>Players cannot participate until their balance is cleared</li>
  <li>Failure to complete payment will invoke the club suspension policy until the account is in good standing.</li>
</ul>

<h2>Uniforms</h2>
<p>Update this section with your club's uniform policy. <a href="{{uniform_link}}">Order uniforms here</a>.</p>

<h2>Season Overview</h2>
<ul>
  <li><strong>Fall:</strong> September – November</li>
  <li><strong>Winter Training:</strong> January – March</li>
  <li><strong>Spring:</strong> April – June</li>
</ul>
<p><strong>Tournaments:</strong></p>
<ul>
  <li>Fall: Columbus Day Weekend (Sat/Sun)</li>
  <li>Spring: Coach will communicate details</li>
</ul>

<h2>Refund Policy</h2>
<p style="font-size:13px;color:#4b5563;">All registration fees are non-refundable, unless a player sustains a serious injury supported by a physician's note. Once a position on the team has been accepted, tuition is considered fully earned and fees will not be refunded. If a refund is awarded, a 10% processing and administrative fee will apply. All approved refunds are at the sole discretion of {{club_name}}.</p>

<h2>Dual Carding</h2>
<p style="font-size:13px;color:#4b5563;">Dual carding is allowed, but {{club_name}} must remain the primary club. Players who prioritize another club will be moved to a more appropriate team.</p>

<h2>Next Steps</h2>
<ol>
  <li><strong>Accept your offer below</strong> by {{offer_deadline}}</li>
  <li>Download the Dugout FC app — connect with your team, RSVP to events, and stay up to date</li>
  <li>Upload any required documents to your club administrator</li>
  <li>Review the Player &amp; Parent Agreement</li>
  <li>Watch for your Dugout FC app invite and uniform email (if applicable)</li>
</ol>

<p>If you can't accept or need more time, please let us know right away — your decision affects other placements.</p>

<p>We're excited to welcome <strong>{{player_first_name}}</strong> to the {{club_name}} family!</p>`;

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '9px',
  border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A',
  background: '#fff', outline: 'none', boxSizing: 'border-box',
};
const bodyTA: React.CSSProperties = {
  width: '100%', minHeight: '180px', padding: '10px 12px', borderRadius: '9px',
  border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#0F172A', background: '#fff',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', resize: 'vertical', lineHeight: '1.5',
};
const lbl = (text: string) => (
  <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{text}</label>
);

export default function TryoutOfferSettingsPage() {
  const { club } = useDashboard();
  const [settings, setSettings] = useState<OfferSettings>(BLANK);
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [open, setOpen]           = useState<string | null>('costs');
  const [preview, setPreview]     = useState<string | null>(null);

  useEffect(() => {
    if (!club) return;
    (async () => {
      const [{ data: os }, { data: tmpl }] = await Promise.all([
        supabase.from('tryout_offer_settings').select('*').eq('club_id', club.id).single(),
        supabase.from('tryout_email_templates').select('*').eq('club_id', club.id),
      ]);
      if (os) setSettings({ ...BLANK, ...os });
      const map: Record<string, EmailTemplate> = {};
      for (const t of (tmpl ?? [])) map[t.template_key] = t;
      setTemplates(map);
    })();
  }, [club]);

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    await supabase.from('tryout_offer_settings').upsert({ ...settings, club_id: club.id }, { onConflict: 'club_id' });
    for (const key of ['waitlist', 'decline', 'reminder'] as const) {
      const t = templates[key];
      if (t) await supabase.from('tryout_email_templates').upsert({ ...t, club_id: club.id, template_key: key }, { onConflict: 'club_id,template_key' });
    }
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function set(patch: Partial<OfferSettings>) { setSettings(s => ({ ...s, ...patch })); }
  function setTmpl(key: string, patch: Partial<EmailTemplate>) {
    setTemplates(prev => {
      const ex = prev[key] ?? { subject: '', from_name: '', body_html: '', template_key: key as EmailTemplate['template_key'] };
      return { ...prev, [key]: { ...ex, ...patch } };
    });
  }

  function buildPreviewHtml(bodyHtml: string, heroLabel = 'Roster Offer', showCta = true): string {
    const primary   = club?.primary_color  ?? '#7f1d1d';
    const secondary = club?.secondary_color ?? '#c99a3f';
    const logoUrl   = club?.logo_url ?? '';
    const clubName  = club?.name ?? 'Your Club';

    const hex = primary.replace('#', '').padEnd(6, '0');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const dark     = `rgb(${Math.round(r*.6)},${Math.round(g*.6)},${Math.round(b*.6)})`;
    const veryDark = `rgb(${Math.round(r*.35)},${Math.round(g*.35)},${Math.round(b*.35)})`;

    const deadline = settings.offer_deadline
      ? new Date(settings.offer_deadline).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'June 30 at 12:00 PM';

    const sample: Record<string, string> = {
      player_first_name: 'Alex', player_full_name: 'Alex Johnson', parent_name: 'Sarah Johnson',
      team_name: 'Milan B', age_group: 'U12', club_name: clubName, coach_name: 'Coach Smith',
      season_label: '2026/27', offer_deadline: deadline,
      season_fee: '2,295', deposit_amount: '765',
      payment_link: '#', uniform_link: '#', club_website: '#',
      accept_link: '#accept', decline_link: '#decline',
    };

    let body = bodyHtml || '<p style="color:#6b7280;font-style:italic;">(No email body written yet.)</p>';
    for (const [k, v] of Object.entries(sample)) body = body.split(`{{${k}}}`).join(v);

    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" width="92" alt="${clubName}" style="display:block;margin:0 auto;border:0;width:92px;height:auto;">`
      : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;color:#fff;font-family:Georgia,serif;">${clubName.charAt(0)}</div>`;

    const ctaBlock = showCta ? `
    <tr><td style="padding:0 50px 18px;background:#fff;">
      <div style="padding:32px 28px;background:linear-gradient(160deg,${dark} 0%,${veryDark} 100%);border-radius:18px;border:1px solid ${primary};text-align:center;box-shadow:0 16px 40px rgba(0,0,0,0.25);">
        <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:4px;font-weight:700;margin-bottom:6px;">Action Required</div>
        <div style="font-family:Georgia,serif;font-size:23px;color:#fff;font-weight:700;margin-bottom:20px;">Confirm Your Roster Spot</div>
        <div>
          <a href="#" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;font-weight:700;padding:15px 34px;border-radius:10px;font-size:15px;box-shadow:0 6px 16px rgba(21,128,61,0.35);">&#10003; Accept My Spot</a>
          &nbsp;
          <a href="#" style="display:inline-block;background:#fff;color:#b91c1c;text-decoration:none;font-weight:700;padding:15px 30px;border-radius:10px;font-size:15px;border:1.5px solid #f3c2c2;">Decline</a>
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.15);font-size:12px;color:rgba(255,255,255,0.7);">&#9201; Please respond by <strong style="color:#fff;">${deadline}</strong></div>
      </div>
    </td></tr>` : '';

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Preview</title>
<style>
  .letter p{margin:0 0 16px}
  .letter h2{font-family:Georgia,serif;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:${primary};font-weight:700;margin:34px 0 14px;padding-bottom:10px;border-bottom:1px solid #eef0f4}
  .letter h2:first-child{margin-top:0}
  .letter ul,.letter ol{margin:0 0 16px;padding-left:22px}
  .letter li{margin:0 0 8px;line-height:1.7}
  .letter ul li::marker{color:${secondary}}
  .letter ol li::marker{color:${primary};font-weight:700}
  .letter strong{color:#111827}
  .letter a{color:${primary}}
</style>
</head>
<body style="margin:0;padding:0;background:#eceef3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#283142;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eceef3;"><tr><td align="center" style="padding:36px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 24px 64px rgba(15,23,42,0.16);">
  <tr><td style="height:4px;background:${secondary};line-height:4px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="background:${veryDark};padding:11px 34px;"><table role="presentation" width="100%"><tr>
    <td style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">${clubName}</td>
    <td align="right" style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">2026 / 2027 Season</td>
  </tr></table></td></tr>
  <tr><td style="background:${primary};background-image:radial-gradient(ellipse at 50% 0%,${primary} 0%,${dark} 45%,${veryDark} 100%);padding:0;">
    <table role="presentation" width="100%"><tr><td align="center" style="padding:54px 32px 46px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 26px;">
        <tr><td align="center" style="width:128px;height:128px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.3);border-radius:50%;">${logoHtml}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;"><tr>
        <td style="width:40px;height:1px;background:${secondary};line-height:1px;font-size:0;">&nbsp;</td>
        <td style="padding:0 12px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${secondary};font-weight:700;white-space:nowrap;">${heroLabel}</td>
        <td style="width:40px;height:1px;background:${secondary};line-height:1px;font-size:0;">&nbsp;</td>
      </tr></table>
      <div style="font-family:Georgia,serif;font-size:44px;line-height:1.08;color:#fff;font-weight:700;letter-spacing:-0.8px;">Welcome,<br><em style="color:rgba(255,255,255,0.88);font-style:italic;font-weight:400;">Alex</em></div>
      <div style="margin:18px auto 0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.82);max-width:440px;">You've earned a place on the roster for<br><strong style="color:rgba(255,255,255,0.96);font-size:17px;">U12 Milan B</strong></div>
      <div style="margin:28px auto 0;color:${secondary};font-size:13px;letter-spacing:8px;">&#9670; &#9670; &#9670;</div>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#f8f9fc;padding:22px 28px;border-bottom:1px solid #eef0f4;">
    <table role="presentation" width="100%"><tr>
      <td align="center" valign="top" style="padding:8px;width:33.33%;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Team</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">Milan B</div>
      </td>
      <td align="center" valign="top" style="padding:8px;width:33.33%;border-left:1px solid #e9ebf1;border-right:1px solid #e9ebf1;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Age Group</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">U12 · Male</div>
      </td>
      <td align="center" valign="top" style="padding:8px;width:33.33%;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Head Coach</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">Coach Smith</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td class="letter" style="padding:46px 50px 18px;font-size:15.5px;line-height:1.78;color:#283142;background:#fff;">${body}</td></tr>
  ${ctaBlock}
  <tr><td style="padding:12px 50px 46px;background:#fff;">
    <div style="border-top:1px solid #f1f1f4;padding-top:30px;">
      <div style="font-size:14px;color:#6b7280;">With pride and gratitude,</div>
      <div style="margin-top:6px;font-family:Georgia,serif;font-size:21px;font-style:italic;color:${primary};font-weight:700;">${clubName}</div>
      <div style="margin-top:4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;">Coaching Staff</div>
    </div>
  </td></tr>
  <tr><td style="background:#111827;padding:32px;text-align:center;">
    ${logoUrl ? `<img src="${logoUrl}" width="46" alt="" style="display:block;margin:0 auto 14px;border:0;opacity:0.9;">` : ''}
    <div style="font-family:Georgia,serif;font-size:20px;color:#fff;font-weight:700;">${clubName}</div>
    <div style="margin-top:6px;font-size:11px;color:#9ca3af;letter-spacing:2.5px;text-transform:uppercase;font-weight:600;">Coaching Staff</div>
  </td></tr>
</table>
<div style="margin-top:18px;font-size:11px;color:#9ca3af;">&#169; 2026 ${clubName} &middot; All rights reserved</div>
</td></tr></table>
</body></html>`;
  }

  function Section({ id, title, icon, children }: { id: string; title: string; icon?: React.ReactNode; children: React.ReactNode }) {
    const isOpen = open === id;
    return (
      <div style={{ background: '#fff', border: `1px solid ${isOpen ? '#C7D2FE' : '#E2E8F0'}`, borderRadius: '14px', overflow: 'hidden', marginBottom: '10px', boxShadow: isOpen ? '0 2px 12px rgba(99,102,241,0.07)' : '0 1px 4px rgba(0,0,0,0.03)' }}>
        <button onClick={() => setOpen(isOpen ? null : id)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '15px 20px', background: isOpen ? '#F5F7FF' : '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}>
          {icon && <span style={{ color: isOpen ? '#6366F1' : '#64748B', flexShrink: 0 }}>{icon}</span>}
          <span style={{ flex: 1, fontWeight: '700', fontSize: '14px', color: '#0F172A' }}>{title}</span>
          {isOpen ? <ChevronDown size={15} color="#6366F1" /> : <ChevronRight size={15} color="#94A3B8" />}
        </button>
        {isOpen && (
          <div style={{ padding: '0 20px 20px', borderTop: '1px solid #EEF2FF' }}>
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '820px', overflowY: 'auto', height: '100%' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tryout Module</div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: '2px 0 4px' }}>Offer Settings</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>Set fees, links, and email templates. Use merge tokens to auto-populate the offer letter.</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: saved ? '#16A34A' : '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px', fontWeight: '700', fontSize: '13.5px', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
          <Save size={14} /> {saved ? 'Saved!' : saving ? 'Saving…' : 'Save All'}
        </button>
      </div>

      {/* ── LINKS ── */}
      <Section id="links" title="Links" icon={<Link2 size={16} />}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '16px' }}>
          <div>
            {lbl('Payment Link')}
            <input value={settings.payment_link} onChange={e => set({ payment_link: e.target.value })} placeholder="https://pay.example.com" style={inp} />
            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>Token: {'{{payment_link}}'}</div>
          </div>
          <div>
            {lbl('Uniform Shop URL')}
            <input value={settings.uniform_shop_url} onChange={e => set({ uniform_shop_url: e.target.value })} placeholder="https://shop.example.com" style={inp} />
            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>Token: {'{{uniform_link}}'}</div>
          </div>
          <div>
            {lbl('Club Website')}
            <input value={settings.club_website_url} onChange={e => set({ club_website_url: e.target.value })} placeholder="https://yourclub.com" style={inp} />
            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>Token: {'{{club_website}}'}</div>
          </div>
        </div>
      </Section>

      {/* ── OFFER EMAIL ── */}
      <Section id="offer" title="Roster Offer Email (U9 and above)" icon={<Mail size={16} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              {lbl('Subject line')}
              <input value={settings.email_subject} onChange={e => set({ email_subject: e.target.value })} style={inp} />
            </div>
            <div>
              {lbl('From name')}
              <input value={settings.from_name} onChange={e => set({ from_name: e.target.value })} placeholder="Maroons SC" style={inp} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              {lbl('Offer response deadline')}
              <input type="datetime-local" value={settings.offer_deadline ? settings.offer_deadline.slice(0, 16) : ''} onChange={e => set({ offer_deadline: e.target.value })} style={{ ...inp, maxWidth: '260px' }} />
              <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>Token: {'{{offer_deadline}}'} — shown in the email body wherever you place it.</div>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email body (HTML)</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {!settings.email_body_html && (
                  <button onClick={() => set({ email_body_html: DEFAULT_OFFER_BODY })}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', background: '#EFF6FF', border: '1px solid #BFDBFE', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#1D4ED8' }}>
                    Load template
                  </button>
                )}
                <button onClick={() => setPreview(buildPreviewHtml(settings.email_body_html, 'Roster Offer', true))}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                  <Eye size={12} /> Preview
                </button>
              </div>
            </div>
            <textarea value={settings.email_body_html} onChange={e => set({ email_body_html: e.target.value })} style={{ ...bodyTA, minHeight: '220px' }}
              placeholder={`<p>Dear {{parent_name}},</p>\n<p>We are pleased to offer <strong>{{player_first_name}}</strong> a spot on <strong>{{team_name}}</strong> for the {{season_label}} season.</p>\n<p><strong>Season fee:</strong> {{season_fee}}<br><strong>Deposit due at registration:</strong> {{deposit_amount}}</p>\n<p>Please respond by <strong>{{offer_deadline}}</strong>:</p>`}
            />
          </div>
        </div>
      </Section>

      <Section id="offer-u8" title="Roster Offer Email (U8 Academy — leave blank to use U9+ template)" icon={<Mail size={16} />}>
        <div style={{ paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email body (HTML)</span>
            <button onClick={() => setPreview(buildPreviewHtml(settings.email_body_html_u8 || settings.email_body_html, 'Roster Offer', true))}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
              <Eye size={12} /> Preview
            </button>
          </div>
          <textarea value={settings.email_body_html_u8} onChange={e => set({ email_body_html_u8: e.target.value })} style={bodyTA} placeholder="Leave blank to use the standard offer email above." />
        </div>
      </Section>

      {/* ── ADDITIONAL TEMPLATES ── */}
      {(['waitlist', 'decline', 'reminder'] as const).map(key => (
        <Section key={key} id={key} title={`${TEMPLATE_LABELS[key]} Email Template`} icon={<Mail size={16} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                {lbl('Subject')}
                <input value={templates[key]?.subject ?? ''} onChange={e => setTmpl(key, { subject: e.target.value })} style={inp} />
              </div>
              <div>
                {lbl('From name')}
                <input value={templates[key]?.from_name ?? ''} onChange={e => setTmpl(key, { from_name: e.target.value })} placeholder="Maroons SC" style={inp} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Body (HTML)</span>
                <button onClick={() => setPreview(buildPreviewHtml(templates[key]?.body_html ?? '', TEMPLATE_LABELS[key], false))}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                  <Eye size={12} /> Preview
                </button>
              </div>
              <textarea value={templates[key]?.body_html ?? ''} onChange={e => setTmpl(key, { body_html: e.target.value })} style={{ ...bodyTA, minHeight: '130px' }} />
            </div>
          </div>
        </Section>
      ))}

      {/* ── EMAIL PREVIEW MODAL ── */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPreview(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '720px', maxWidth: '94vw', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: '#0F172A' }}>Email Preview</div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px' }}>Sample data — real emails use live player and team details</div>
              </div>
              <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}><X size={18} color="#64748B" /></button>
            </div>
            <iframe srcDoc={preview} style={{ flex: 1, border: 'none', width: '100%' }} title="Email Preview" sandbox="allow-same-origin" />
          </div>
        </div>
      )}

      {/* ── MERGE TOKEN REFERENCE ── */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden', marginTop: '4px' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={14} color="#6366F1" />
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Merge token reference</span>
          <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: '2px' }}>— copy into any email body</span>
        </div>
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '8px' }}>
          {MERGE_TOKENS.map(({ token, desc }) => (
            <div key={token} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 10px', borderRadius: '7px', background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
              <code style={{ fontSize: '11px', background: '#EEF2FF', color: '#4338CA', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: '700' }}>{token}</code>
              <span style={{ fontSize: '11px', color: '#64748B' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
