'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileCheck, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type WaiverRow = {
  waiver_id: string;
  title: string;
  required_by: string | null;
  signed_by_name: string | null;
  signed_at: string | null;
};

export default function DocumentsPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [rows, setRows] = useState<WaiverRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);

    const { data: playerRow } = await supabase.from('players').select('team_id').eq('id', playerId).single();
    if (!playerRow) { setLoading(false); return; }

    const [{ data: assignments }, { data: signatures }] = await Promise.all([
      supabase.from('waiver_assignments').select('waiver_id, waivers(title, required_by)').eq('team_id', playerRow.team_id),
      supabase.from('waiver_signatures').select('waiver_id, signed_by_name, signed_at').eq('player_id', playerId),
    ]);

    const signatureByWaiverId = new Map((signatures ?? []).map((s) => [s.waiver_id, s]));
    const merged: WaiverRow[] = (assignments ?? []).map((a) => {
      const waiver = a.waivers as unknown as { title: string; required_by: string | null } | null;
      const sig = signatureByWaiverId.get(a.waiver_id);
      return {
        waiver_id: a.waiver_id,
        title: waiver?.title ?? 'Untitled waiver',
        required_by: waiver?.required_by ?? null,
        signed_by_name: sig?.signed_by_name ?? null,
        signed_at: sig?.signed_at ?? null,
      };
    });
    setRows(merged);
    setLoading(false);
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Waivers</div>
          <Link href="/dashboard/waivers" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '600', color: primary, textDecoration: 'none' }}>
            Manage waivers <ExternalLink size={11} />
          </Link>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <FileCheck size={22} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No waivers assigned to this team</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rows.map((r) => (
              <div key={r.waiver_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>{r.title}</div>
                  {r.required_by && <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>Required by {r.required_by}</div>}
                </div>
                {r.signed_at ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: '700', color: '#16A34A', background: '#F0FDF4', borderRadius: '20px', padding: '4px 10px', flexShrink: 0 }}>
                    <CheckCircle size={12} /> Signed {r.signed_at.slice(0, 10)}
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: '700', color: '#D97706', background: '#FFFBEB', borderRadius: '20px', padding: '4px 10px', flexShrink: 0 }}>
                    <Clock size={12} /> Unsigned
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
