'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, ClipboardCheck, ExternalLink, ChevronRight, Users, Check, X, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import Link from 'next/link';

type FormRow = {
  id: string; title: string; status: 'draft' | 'open' | 'closed';
  team_id: string | null; team_name: string; submissions: number; created_at: string;
};

type WaiverRow = {
  id: string; title: string; team_names: string[]; total: number; signed: number; required_by: string | null;
};

export default function FormsPage() {
  const { club, teams } = useDashboard();
  const searchParams  = useSearchParams();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [tab,        setTab]        = useState<'registrations' | 'waivers'>('registrations');
  const [teamFilter, setTeamFilter] = useState(searchParams.get('team') ?? '');
  const [forms,      setForms]      = useState<FormRow[]>([]);
  const [waivers,    setWaivers]    = useState<WaiverRow[]>([]);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    if (!club || !teams.length) return;
    setLoading(true);
    const teamIds = teams.map(t => t.id);

    const [formsRes, waiversRes] = await Promise.all([
      supabase.from('registration_forms').select('id,title,status,team_id,teams(name),registration_submissions(id)').in('team_id', teamIds).order('created_at', { ascending: false }),
      supabase.from('waivers').select('id,title,required_by,waiver_team_assignments(team_id,teams(name)),waiver_signatures(id)').in('id',
        (await supabase.from('waiver_team_assignments').select('waiver_id').in('team_id', teamIds)).data?.map((r: any) => r.waiver_id) ?? []
      ),
    ]);

    setForms((formsRes.data ?? []).map((f: any) => ({
      id: f.id, title: f.title, status: f.status,
      team_id: f.team_id, team_name: f.teams?.name ?? '—',
      submissions: f.registration_submissions?.length ?? 0,
      created_at: f.created_at,
    })));

    setWaivers((waiversRes.data ?? []).map((w: any) => ({
      id: w.id, title: w.title, required_by: w.required_by,
      team_names: (w.waiver_team_assignments ?? []).map((a: any) => a.teams?.name).filter(Boolean),
      total: 0, signed: w.waiver_signatures?.length ?? 0,
    })));

    setLoading(false);
  }, [club, teams]);

  useEffect(() => { load(); }, [load]);

  const filteredForms   = teamFilter ? forms.filter(f => f.team_id === teamFilter) : forms;
  const filteredWaivers = teamFilter ? waivers.filter(w => {
    const team = teams.find(t => t.id === teamFilter);
    return team ? w.team_names.includes(team.name) : true;
  }) : waivers;

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      open:   { bg: '#F0FDF4', color: '#166534', label: 'Open' },
      closed: { bg: '#F1F5F9', color: '#64748B', label: 'Closed' },
      draft:  { bg: '#FFFBEB', color: '#92400E', label: 'Draft' },
    };
    const m = map[s] ?? map.draft;
    return <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: m.bg, color: m.color, letterSpacing: '0.02em' }}>{m.label}</span>;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Forms</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>Registration forms and player waivers</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignSelf: 'center' }}>
          <Link href="/dashboard/registrations" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: primary, color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit' }}>
            + New Form
          </Link>
        </div>
      </div>
      <div style={{ padding: '24px 32px' }}>

      {/* Team filter + tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px' }}>
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px', gap: '2px' }}>
          {([['registrations','Registration Forms'],['waivers','Waivers']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '7px 16px', borderRadius: '8px', border: 'none', background: tab === key ? '#fff' : 'transparent', color: tab === key ? '#0F172A' : '#64748B', fontSize: '13px', fontWeight: tab === key ? '700' : '500', cursor: 'pointer', boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '13px', color: teamFilter ? '#0F172A' : '#94A3B8', background: '#fff', cursor: 'pointer' }}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ height: '14px', borderRadius: '6px', width: '45%', marginBottom: '10px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
              <div style={{ height: '11px', borderRadius: '6px', width: '30%', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
            </div>
          ))}
          <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        </div>
      ) : tab === 'registrations' ? (
        filteredForms.length === 0 ? (
          <EmptyState icon={<FileText size={28} color={primary} />} title="No registration forms yet" sub="Create forms to collect player info, medical details, and more." action={{ label: 'Create your first form', href: '/dashboard/registrations' }} primary={primary} />
        ) : (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0F172A', borderBottom: 'none' }}>
                  {['Form Title','Team','Status','Submissions',''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredForms.map((f, i) => (
                  <tr key={f.id}
                    style={{ borderBottom: i < filteredForms.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}
                  >
                    <td style={{ padding: '13px 16px', fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{f.title}</td>
                    <td style={{ padding: '13px 16px', fontSize: '13px', color: '#64748B' }}>{f.team_name}</td>
                    <td style={{ padding: '13px 16px' }}>{statusBadge(f.status)}</td>
                    <td style={{ padding: '13px 16px', fontSize: '13px', color: '#64748B' }}>{f.submissions}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <Link href="/dashboard/registrations" style={{ fontSize: '12px', color: primary, textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                        Manage <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        filteredWaivers.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={28} color={primary} />} title="No waivers yet" sub="Create waivers for parents to sign — liability, photo consent, medical." action={{ label: 'Create your first waiver', href: '/dashboard/waivers' }} primary={primary} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredWaivers.map(w => (
              <div key={w.id} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'box-shadow 0.15s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ClipboardCheck size={18} color={primary} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{w.title}</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                    {w.team_names.length ? w.team_names.join(', ') : 'All teams'}
                    {w.required_by && ` · Due ${new Date(w.required_by).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>{w.signed}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>signed</div>
                </div>
                <Link href="/dashboard/waivers" style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12px', fontWeight: '600', color: '#374151', textDecoration: 'none', flexShrink: 0 }}>
                  Manage
                </Link>
              </div>
            ))}
          </div>
        )
      )}

      {/* Link to full management pages */}
      {!loading && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
          <Link href="/dashboard/registrations" style={{ fontSize: '12px', color: '#94A3B8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ExternalLink size={11} /> Full Registration Manager
          </Link>
          <Link href="/dashboard/waivers" style={{ fontSize: '12px', color: '#94A3B8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ExternalLink size={11} /> Full Waiver Manager
          </Link>
        </div>
      )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, sub, action, primary }: { icon: React.ReactNode; title: string; sub: string; action: { label: string; href: string }; primary: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '48px', textAlign: 'center' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>{icon}</div>
      <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '18px' }}>{sub}</div>
      <Link href={action.href} style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '6px', background: primary, color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: '700' }}>{action.label}</Link>
    </div>
  );
}
