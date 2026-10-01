'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileCheck, CheckCircle, Clock, ExternalLink, Upload, File, Trash2, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type WaiverRow = {
  waiver_id: string;
  title: string;
  required_by: string | null;
  signed_by_name: string | null;
  signed_at: string | null;
};

type DocType = 'medical_clearance' | 'birth_certificate' | 'photo_consent' | 'other';
type DocRow = {
  id: string;
  doc_type: DocType;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  medical_clearance: 'Medical clearance',
  birth_certificate: 'Birth certificate',
  photo_consent: 'Photo consent',
  other: 'Other',
};

const BUCKET = 'player-docs';

export default function DocumentsPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { club, profile } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [rows, setRows] = useState<WaiverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [uploadType, setUploadType] = useState<DocType>('other');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);

    const { data: playerRow } = await supabase.from('players').select('team_id').eq('id', playerId).single();
    if (!playerRow) { setLoading(false); return; }
    setTeamId(playerRow.team_id);

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

    setDocsLoading(true);
    const { data: docRows } = await supabase.from('player_documents')
      .select('id,doc_type,file_name,storage_path,uploaded_at')
      .eq('player_id', playerId)
      .order('uploaded_at', { ascending: false });
    setDocs((docRows ?? []) as DocRow[]);
    setDocsLoading(false);
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    if (!teamId || !profile) return;
    setUploading(true);
    setUploadError('');
    const path = `${playerId}/${Date.now()}-${file.name}`;
    const { error: storageErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (storageErr) { setUploading(false); setUploadError(storageErr.message); return; }

    const { data: inserted, error: dbErr } = await supabase.from('player_documents')
      .insert({ player_id: playerId, team_id: teamId, uploaded_by: profile.id, doc_type: uploadType, file_name: file.name, storage_path: path })
      .select('id,doc_type,file_name,storage_path,uploaded_at')
      .single();
    setUploading(false);
    if (dbErr) { setUploadError(dbErr.message); await supabase.storage.from(BUCKET).remove([path]); return; }
    setDocs((prev) => [inserted as DocRow, ...prev]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function viewDoc(doc: DocRow) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300);
    if (error || !data) { alert('Could not open this file: ' + (error?.message ?? 'unknown error')); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function deleteDoc(doc: DocRow) {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await supabase.from('player_documents').delete().eq('id', doc.id);
    setDeletingId(null);
    if (error) { alert('Could not delete: ' + error.message); return; }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Files</div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <select value={uploadType} onChange={(e) => setUploadType(e.target.value as DocType)}
            style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit' }}>
            {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
          </select>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading || !teamId}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', background: primary, border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: (uploading || !teamId) ? 0.6 : 1 }}>
            <Upload size={13} />{uploading ? 'Uploading…' : 'Upload file'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
        </div>

        {uploadError && (
          <div style={{ padding: '9px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', fontSize: '12px', fontWeight: '600', color: '#DC2626', marginBottom: '14px' }}>
            {uploadError}
          </div>
        )}

        {docsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : docs.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No files uploaded yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {docs.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <File size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>{DOC_TYPE_LABELS[d.doc_type]} · {d.uploaded_at.slice(0, 10)}</div>
                </div>
                <button onClick={() => viewDoc(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', flexShrink: 0 }}>
                  <Eye size={14} color="#64748B" />
                </button>
                <button onClick={() => deleteDoc(d)} disabled={deletingId === d.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', flexShrink: 0 }}>
                  <Trash2 size={14} color="#EF4444" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
