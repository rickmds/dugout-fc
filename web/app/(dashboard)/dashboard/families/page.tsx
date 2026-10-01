'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Users, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type FamilyRow = {
  profile_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  player_count: number;
  player_names: string;
};

export default function FamiliesPage() {
  const { club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [families, setFamilies] = useState<FamilyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!teams.length) { setLoading(false); return; }
    setLoading(true);

    // get_guardian_player_names is team-scoped — call it once per team and
    // merge, since a guardian's kids can be split across different teams
    // at the same club.
    const results = await Promise.all(
      teams.map((t) => supabase.rpc('get_guardian_player_names', { p_team_id: t.id }))
    );
    const namesByGuardian = new Map<string, Set<string>>();
    for (const { data } of results) {
      for (const row of (data ?? []) as { profile_id: string; player_names: string }[]) {
        const set = namesByGuardian.get(row.profile_id) ?? new Set<string>();
        for (const name of row.player_names.split(' & ')) set.add(name);
        namesByGuardian.set(row.profile_id, set);
      }
    }

    const guardianIds = [...namesByGuardian.entries()].filter(([, names]) => names.size > 1).map(([id]) => id);
    if (!guardianIds.length) { setFamilies([]); setLoading(false); return; }

    const [{ data: profiles }, { data: invites }] = await Promise.all([
      supabase.from('profiles').select('id,full_name').in('id', guardianIds),
      supabase.from('invites').select('accepted_by,email,phone').in('accepted_by', guardianIds).not('accepted_by', 'is', null),
    ]);
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const contactById = new Map<string, { email: string | null; phone: string | null }>();
    for (const inv of invites ?? []) {
      if (!inv.accepted_by || contactById.has(inv.accepted_by)) continue;
      contactById.set(inv.accepted_by, { email: inv.email, phone: inv.phone });
    }

    setFamilies(guardianIds.map((id) => {
      const names = [...(namesByGuardian.get(id) ?? [])].sort();
      return {
        profile_id: id,
        full_name: nameById.get(id) ?? 'Unknown guardian',
        email: contactById.get(id)?.email ?? null,
        phone: contactById.get(id)?.phone ?? null,
        player_count: names.length,
        player_names: names.join(', '),
      };
    }).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setLoading(false);
  }, [teams]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const filtered = families.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return f.full_name.toLowerCase().includes(q) || f.player_names.toLowerCase().includes(q) || (f.email ?? '').toLowerCase().includes(q);
  });

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Club</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Families</h1>
      </div>

      <div style={{ padding: '24px 32px' }}>
        <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '420px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by guardian or player name…"
            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', background: '#fff', boxSizing: 'border-box', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} />
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: '64px', borderRadius: '10px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', border: '1px solid #E2E8F0' }} />
            ))}
            <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '56px 32px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Users size={22} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>
              {search ? 'No families match your search' : 'No multi-player families yet'}
            </div>
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              {search ? 'Try a different name.' : 'A family shows up here once one guardian has more than one player on the roster.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map((f) => (
              <Link key={f.profile_id} href={`/dashboard/families/${f.profile_id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: `${primary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: primary }}>
                    <Users size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{f.full_name}</div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.player_names}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: primary, background: `${primary}15`, borderRadius: '20px', padding: '3px 10px', flexShrink: 0 }}>
                    {f.player_count} players
                  </span>
                  <ChevronRight size={15} color="#CBD5E1" style={{ flexShrink: 0 }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
