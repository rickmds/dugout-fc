'use client';

import { MapPin, Construction } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';

export default function FieldsPage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', margin: '0 0 4px', letterSpacing: '-0.5px' }}>Fields</h1>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 32px' }}>Manage your training and game venues</p>

      <div style={{ maxWidth: '560px', background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '48px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <MapPin size={28} color={primary} />
        </div>
        <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', marginBottom: '10px' }}>Field Manager</div>
        <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.7, marginBottom: '20px' }}>
          The field manager is coming soon. You'll be able to add your training grounds and game venues with GPS coordinates, then assign them directly when creating events — no more retyping addresses.
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: `${primary}10`, color: primary, fontSize: '12px', fontWeight: '700', padding: '6px 14px', borderRadius: '20px' }}>
          <Construction size={13} /> In development
        </div>
        <div style={{ marginTop: '24px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', textAlign: 'left' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Planned features</div>
          {[
            'Add venues with name, address and GPS',
            'Set pitch type: grass, 3G, 4G, 5-a-side',
            'Assign venues when creating events',
            'Drag-and-drop scheduling across fields',
            'Conflict detection for double-bookings',
          ].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: primary, marginTop: '6px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#374151' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
