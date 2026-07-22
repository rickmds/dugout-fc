'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Users, Mail, Hash, ShieldHalf, SearchX } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Result = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  team_id: string;
  team_name: string;
  matched_email?: string;
  matched_jersey?: boolean;
  matched_position?: boolean;
};

export default function SearchPage() {
  const { club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (!teams.length) return;
      setLoading(true);
      const teamIds = teams.map((t) => t.id);
      const q = query.trim();

      // jersey: strip leading # and check if numeric
      const jerseyNum = parseInt(q.replace(/^#/, ''), 10);
      const isJerseyQuery = !isNaN(jerseyNum) && q.replace(/^#/, '').trim() !== '';

      const [nameRes, emailRes, posRes] = await Promise.all([
        supabase
          .from('players')
          .select('id, full_name, jersey_number, position, team_id')
          .in('team_id', teamIds)
          .ilike('full_name', `%${q}%`)
          .order('full_name')
          .limit(60),
        supabase
          .from('invites')
          .select('player_id, email')
          .in('team_id', teamIds)
          .ilike('email', `%${q}%`)
          .limit(60),
        supabase
          .from('players')
          .select('id, full_name, jersey_number, position, team_id')
          .in('team_id', teamIds)
          .ilike('position', `%${q}%`)
          .order('full_name')
          .limit(60),
      ]);

      // jersey number search (exact match on the number)
      const jerseyRes = isJerseyQuery
        ? await supabase
            .from('players')
            .select('id, full_name, jersey_number, position, team_id')
            .in('team_id', teamIds)
            .eq('jersey_number', jerseyNum)
            .order('full_name')
            .limit(60)
        : { data: [] as { id: string; full_name: string; jersey_number: number | null; position: string | null; team_id: string }[] };

      const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
      const byId = new Map<string, Result>();

      // 1. name matches (base)
      for (const p of nameRes.data ?? []) {
        byId.set(p.id, { ...p, team_name: teamMap[p.team_id] ?? '—' });
      }

      // 2. position matches
      for (const p of posRes.data ?? []) {
        if (byId.has(p.id)) {
          byId.get(p.id)!.matched_position = true;
        } else {
          byId.set(p.id, { ...p, team_name: teamMap[p.team_id] ?? '—', matched_position: true });
        }
      }

      // 3. jersey number matches
      for (const p of jerseyRes.data ?? []) {
        if (byId.has(p.id)) {
          byId.get(p.id)!.matched_jersey = true;
        } else {
          byId.set(p.id, { ...p, team_name: teamMap[p.team_id] ?? '—', matched_jersey: true });
        }
      }

      // 4. email matches (may require fetching extra players)
      if ((emailRes.data ?? []).length > 0) {
        const emailPlayerIds = (emailRes.data ?? []).map((r) => r.player_id).filter(Boolean) as string[];
        const emailMap = Object.fromEntries((emailRes.data ?? []).map((r) => [r.player_id, r.email]));

        const newIds = emailPlayerIds.filter((id) => !byId.has(id));
        if (newIds.length) {
          const { data: extra } = await supabase
            .from('players')
            .select('id, full_name, jersey_number, position, team_id')
            .in('id', newIds);
          for (const p of extra ?? []) {
            byId.set(p.id, { ...p, team_name: teamMap[p.team_id] ?? '—', matched_email: emailMap[p.id] });
          }
        }
        for (const [id, email] of Object.entries(emailMap)) {
          if (byId.has(id) && !byId.get(id)!.matched_email) {
            byId.get(id)!.matched_email = email as string;
          }
        }
      }

      setResults(Array.from(byId.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setLoading(false);
      setSearched(true);
    }, 280);

    return () => clearTimeout(timer);
  }, [query, teams]);

  function positionColor(pos: string | null): string {
    if (!pos) return '#94A3B8';
    const p = pos.toLowerCase();
    if (p === 'goalkeeper') return '#D97706';
    if (['defender', 'cb', 'lb', 'rb'].some((x) => p.includes(x))) return '#2563EB';
    if (['midfielder', 'cm', 'am'].some((x) => p.includes(x))) return '#7C3AED';
    if (['forward', 'striker', 'winger'].some((x) => p.includes(x))) return '#DC2626';
    return '#64748B';
  }

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.team_name] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '20px 32px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Club</div>
        <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>Search</h1>
        <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748B' }}>Find any player across all {teams.length} team{teams.length !== 1 ? 's' : ''}</p>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: '792px' }}>

      {/* Search input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: `2px solid ${query ? primary : '#E2E8F0'}`, borderRadius: '14px', padding: '12px 16px', marginBottom: '24px', transition: 'border-color 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Search size={18} color={query ? primary : '#94A3B8'} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, #7, goalkeeper, parent email…"
          style={{ border: 'none', background: 'none', outline: 'none', fontSize: '16px', color: '#0F172A', flex: 1, fontFamily: 'inherit' }}
        />
        {loading && (
          <div style={{ width: '16px', height: '16px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        )}
        {query && !loading && (
          <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex' }}>
            <X size={16} color="#94A3B8" />
          </button>
        )}
      </div>

      {/* Results */}
      {!query || query.trim().length < 2 ? (
        <div style={{ textAlign: 'center', padding: '64px 32px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Users size={26} color="#94A3B8" />
          </div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Search across all players</div>
          <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>Name &middot; #jersey number &middot; position &middot; parent email</div>
        </div>
      ) : searched && results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 32px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <SearchX size={26} color="#EF4444" />
          </div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No players found</div>
          <div style={{ fontSize: '13px', color: '#64748B' }}>Try a different name, number, or spelling</div>
        </div>
      ) : results.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>
            {results.length} result{results.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} team{Object.keys(grouped).length !== 1 ? 's' : ''}
          </div>
          {Object.entries(grouped).map(([teamName, players]) => (
            <div key={teamName} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '12px 18px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>{teamName}</span>
                <span style={{ fontSize: '11px', color: '#94A3B8', background: '#E2E8F0', borderRadius: '20px', padding: '1px 7px' }}>{players.length}</span>
              </div>
              {players.map((p, i) => (
                <Link key={p.id} href={`/dashboard/roster?team=${p.team_id}`} style={{ textDecoration: 'none' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 18px', borderBottom: i < players.length - 1 ? '1px solid #F8FAFC' : 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#FAFBFF'}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: primary, flexShrink: 0 }}>
                      {p.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A' }}>
                        {highlightMatch(p.full_name, query)}
                      </div>
                      {(p.matched_email || p.matched_jersey || p.matched_position) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px', flexWrap: 'wrap' }}>
                          {p.matched_email && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#94A3B8' }}>
                              <Mail size={10} color="#94A3B8" />
                              {highlightMatch(p.matched_email, query)}
                            </span>
                          )}
                          {p.matched_jersey && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#94A3B8' }}>
                              <Hash size={10} color="#94A3B8" />
                              Jersey {p.jersey_number}
                            </span>
                          )}
                          {p.matched_position && !p.matched_jersey && !p.matched_email && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#94A3B8' }}>
                              <ShieldHalf size={10} color="#94A3B8" />
                              Matched position
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {p.position && (
                      <span style={{ fontSize: '11px', fontWeight: '700', color: positionColor(p.position), background: `${positionColor(p.position)}15`, borderRadius: '6px', padding: '2px 8px' }}>
                        {p.position}
                      </span>
                    )}
                    {p.jersey_number != null && (
                      <span style={{ fontSize: '13px', fontWeight: '800', color: primary, minWidth: '24px', textAlign: 'right' }}>
                        #{p.jersey_number}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#FEF08A', color: '#0F172A', borderRadius: '2px', padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
