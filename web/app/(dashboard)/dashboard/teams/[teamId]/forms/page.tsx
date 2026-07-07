'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FileText, ClipboardCheck, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import Link from 'next/link';

type FormRow   = { id: string; title: string; status: string; submissions: number };
type WaiverRow = { id: string; title: string; signed: number; required_by: string | null };

export default function TeamFormsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { club }   = useDashboard();
  const primary    = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [forms,   setForms]   = useState<FormRow[]>([]);
  const [waivers, setWaivers] = useState<WaiverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'forms' | 'waivers'>('forms');

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);

    const [formsRes, waiversRes] = await Promise.all([
      supabase.from('registration_forms').select('id, title, status, registration_submissions(id)').eq('team_id', teamId).order('created_at', { ascending: false }),
      supabase.from('waiver_team_assignments').select('waivers(id, title, required_by, waiver_signatures(id))').eq('team_id', teamId),
    ]);

    setForms((formsRes.data ?? []).map((f: any) => ({
      id: f.id, title: f.title, status: f.status,
      submissions: f.registration_submissions?.length ?? 0,
    })));

    setWaivers(((waiversRes.data ?? []).map((a: any) => a.waivers).filter(Boolean)).map((w: any) => ({
      id: w.id, title: w.title, required_by: w.required_by,
      signed: w.waiver_signatures?.length ?? 0,
    })));

    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      open:   { bg: '#F0FDF4', color: '#166534' },
      closed: { bg: '#F1F5F9', color: '#64748B' },
      draft:  { bg: '#FFFBEB', color: '#92400E' },
    };
    const m = map[s] ?? map.draft;
    return <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '5px', background: m.bg, color: m.color, textTransform: 'capitalize' }}>{s}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px', gap: '2px' }}>
          {([['forms', 'Registration Forms'], ['waivers', 'Waivers']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', background: tab === key ? '#fff' : 'transparent', color: tab === key ? '#0F172A' : '#64748B', fontSize: '13px', fontWeight: tab === key ? '700' : '500', cursor: 'pointer', boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>
        <Link href={tab === 'forms' ? '/dashboard/registrations' : '/dashboard/waivers'} style={{ padding: '8px 16px', borderRadius: '9px', background: primary, color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: '700' }}>
          + New {tab === 'forms' ? 'Form' : 'Waiver'}
        </Link>
      </div>

      {loading ? (
        <>
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1,2].map(i => <div key={i} style={{ height: '64px', borderRadius: '10px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />)}
          </div>
        </>
      ) : tab === 'forms' ? (
        forms.length === 0 ? (
          <Empty icon={<FileText size={26} color={primary} />} title="No registration forms for this team" action={{ label: 'Create a form', href: '/dashboard/registrations' }} primary={primary} />
        ) : (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Form', 'Status', 'Submissions', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forms.map((f, i) => (
                  <tr key={f.id} style={{ borderBottom: i < forms.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}
                  >
                    <td style={{ padding: '13px 16px', fontSize: '14px', fontWeight: '600', color: '#0F172A' }}>{f.title}</td>
                    <td style={{ padding: '13px 16px' }}>{statusBadge(f.status)}</td>
                    <td style={{ padding: '13px 16px', fontSize: '13px', color: '#64748B' }}>{f.submissions}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <Link href="/dashboard/registrations" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: primary, textDecoration: 'none', fontWeight: '600', justifyContent: 'flex-end' }}>
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
        waivers.length === 0 ? (
          <Empty icon={<ClipboardCheck size={26} color={primary} />} title="No waivers assigned to this team" action={{ label: 'Create a waiver', href: '/dashboard/waivers' }} primary={primary} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {waivers.map(w => (
              <div key={w.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ClipboardCheck size={18} color={primary} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{w.title}</div>
                  {w.required_by && <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Due {new Date(w.required_by).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>{w.signed}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>signed</div>
                </div>
                <Link href="/dashboard/waivers" style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12px', fontWeight: '600', color: '#374151', textDecoration: 'none' }}>
                  Manage
                </Link>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Empty({ icon, title, action, primary }: { icon: React.ReactNode; title: string; action: { label: string; href: string }; primary: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '48px', textAlign: 'center' }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '13px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>{icon}</div>
      <div style={{ fontSize: '15px', fontWeight: '700', color: '#94A3B8', marginBottom: '14px' }}>{title}</div>
      <Link href={action.href} style={{ display: 'inline-block', padding: '8px 20px', borderRadius: '8px', background: primary, color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: '700' }}>{action.label}</Link>
    </div>
  );
}
