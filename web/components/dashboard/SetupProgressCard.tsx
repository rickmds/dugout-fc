'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from './DashboardContext';

type Step = { label: string; done: boolean };

type Counts = { players: number; events: number; coaches: number; invites: number };

export default function SetupProgressCard({ onOpen }: { onOpen: (step: number) => void }) {
  const { club, teams, profile } = useDashboard();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  useEffect(() => {
    if (!club || !profile) return;
    const teamIds = teams.map((t) => t.id);
    async function load() {
      const [playerRes, eventRes, coachRes, inviteRes] = await Promise.all([
        teamIds.length > 0 ? supabase.from('players').select('id', { count: 'exact', head: true }).in('team_id', teamIds) : Promise.resolve({ count: 0 }),
        teamIds.length > 0 ? supabase.from('events').select('id', { count: 'exact', head: true }).in('team_id', teamIds) : Promise.resolve({ count: 0 }),
        teamIds.length > 0 ? supabase.from('team_members').select('id', { count: 'exact', head: true }).in('team_id', teamIds).eq('role', 'coach') : Promise.resolve({ count: 0 }),
        teamIds.length > 0 ? supabase.from('invites').select('id', { count: 'exact', head: true }).in('team_id', teamIds) : Promise.resolve({ count: 0 }),
      ]);
      setCounts({
        players: (playerRes as { count: number | null }).count ?? 0,
        events:  (eventRes  as { count: number | null }).count ?? 0,
        coaches: (coachRes  as { count: number | null }).count ?? 0,
        invites: (inviteRes as { count: number | null }).count ?? 0,
      });
    }
    load();
  }, [club, teams, profile]);

  if (!club || !counts || dismissed) return null;

  const hasBranding = !!(club.logo_url || (club.primary_color && club.primary_color !== '#000000'));

  const steps: Step[] = [
    { label: 'Club branding',       done: hasBranding },
    { label: 'Teams created',       done: teams.length > 0 },
    { label: 'Coaches added',       done: counts.coaches > 0 },
    { label: 'Roster imported',     done: counts.players > 0 },
    { label: 'Schedule uploaded',   done: counts.events > 0 },
    { label: 'Parents invited',     done: counts.invites > 0 },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  if (completedCount === steps.length) return null;

  const pct         = Math.round((completedCount / steps.length) * 100);
  const nextStepIdx = steps.findIndex((s) => !s.done);

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '18px 20px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden', position: 'relative' }}>
      {/* Accent left bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: primary, borderRadius: '16px 0 0 16px' }} />

      <div style={{ paddingLeft: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Zap size={16} color={primary} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Finish setting up your club</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>{completedCount} of {steps.length} steps complete</div>
            </div>
          </div>
          <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#CBD5E1', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, marginBottom: 14, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: primary, borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>

        {/* Checklist */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 16px', marginBottom: 14 }}>
          {steps.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {s.done
                ? <CheckCircle size={14} color="#22C55E" style={{ flexShrink: 0 }} />
                : <Circle      size={14} color="#CBD5E1" style={{ flexShrink: 0 }} />}
              <span style={{ fontSize: 12, color: s.done ? '#16A34A' : '#64748B', fontWeight: s.done ? 600 : 400, textDecoration: s.done ? 'line-through' : 'none' }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => onOpen(nextStepIdx)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: primary, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Continue setup → {steps[nextStepIdx]?.label}
        </button>
      </div>
    </div>
  );
}
