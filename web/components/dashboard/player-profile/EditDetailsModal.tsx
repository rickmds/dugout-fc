'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { movePlayerToTeam } from '@/lib/movePlayer';
import type { PlayerMeta } from '../../../app/(dashboard)/dashboard/players/[playerId]/layout';

const POSITIONS = ['GK','CB','LB','RB','WB','SW','DM','CM','AM','CAM','CDM','RM','LM','LW','RW','ST','CF','SS'];
const FEET = ['Right', 'Left', 'Both'];

type Props = {
  player: PlayerMeta;
  teams: { id: string; name: string }[];
  primary: string;
  onClose: () => void;
  onSaved: (updated: Partial<PlayerMeta>) => void;
};

export default function EditDetailsModal({ player, teams, primary, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    full_name: player.full_name,
    jersey_number: player.jersey_number?.toString() ?? '',
    position: player.position ?? '',
    secondary_position: player.secondary_position ?? '',
    preferred_foot: player.preferred_foot ?? '',
    date_of_birth: player.date_of_birth ?? '',
    team_id: player.team_id,
    notes: player.notes ?? '',
    is_injured: player.is_injured,
  });
  const [saving, setSaving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);

  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '5px' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  async function save() {
    if (!form.full_name.trim()) return;
    setSaving(true); setMoveError('');
    const updates = {
      full_name: form.full_name.trim(),
      jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
      position: form.position || null,
      secondary_position: form.secondary_position || null,
      preferred_foot: form.preferred_foot || null,
      date_of_birth: form.date_of_birth || null,
      notes: form.notes.trim() || null,
      is_injured: form.is_injured,
    };
    const { error } = await supabase.from('players').update(updates).eq('id', player.id);
    if (error) { setSaving(false); setMoveError(error.message); return; }

    if (form.team_id !== player.team_id) {
      const { error: moveErr } = await movePlayerToTeam(player.id, player.team_id, form.team_id);
      if (moveErr) {
        setSaving(false);
        setMoveError(`Details saved, but couldn't move the team: ${moveErr}`);
        onSaved(updates);
        return;
      }
    }

    setSaving(false);
    onSaved({ ...updates, team_id: form.team_id });
    dialogRef.current?.close();
  }

  return (
    <dialog ref={dialogRef}
      onClose={onClose}
      onClick={e => { if (e.target === dialogRef.current) dialogRef.current?.close(); }}
      style={{ margin: 'auto', padding: 0, width: '100%', maxWidth: '480px', maxHeight: '90vh', border: 'none', borderRadius: '18px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden', background: '#fff' }}>

      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Edit details</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '7px' }}>
          <X size={16} color="#94A3B8" />
        </button>
      </div>

      <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Full Name</label>
          <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={labelStyle}>Jersey #</label>
            <input type="number" min="1" max="99" value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))} placeholder="—" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Date of birth</label>
            <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={labelStyle}>Position</label>
            <input list="edit-player-positions" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="GK, CM, ST…" style={inputStyle} />
            <datalist id="edit-player-positions">{POSITIONS.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div>
            <label style={labelStyle}>Secondary position</label>
            <input list="edit-player-positions" value={form.secondary_position} onChange={e => setForm(f => ({ ...f, secondary_position: e.target.value }))} placeholder="Optional" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={labelStyle}>Preferred foot</label>
            <select value={form.preferred_foot} onChange={e => setForm(f => ({ ...f, preferred_foot: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">—</option>
              {FEET.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          {teams.length > 1 && (
            <div>
              <label style={labelStyle}>Team</label>
              <select value={form.team_id} onChange={e => { setForm(f => ({ ...f, team_id: e.target.value })); setMoveError(''); }} style={{ ...inputStyle, cursor: 'pointer' }}>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_injured} onChange={e => setForm(f => ({ ...f, is_injured: e.target.checked }))} style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
          Currently injured
        </label>

        <div>
          <label style={labelStyle}>Coach notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
            placeholder="Visible to coaches and this player's guardians" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        {moveError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', fontSize: '12px', fontWeight: '600', color: '#DC2626' }}>
            <AlertCircle size={12} />{moveError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: '700', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving || !form.full_name.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: primary, border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: (saving || !form.full_name.trim()) ? 0.6 : 1 }}>
            <Check size={14} strokeWidth={2.5} />{saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <style>{`dialog::backdrop { background: rgba(0,0,0,0.4); }`}</style>
    </dialog>
  );
}
