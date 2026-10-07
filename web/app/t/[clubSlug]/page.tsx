import type { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import TryoutRegistrationForm from './TryoutRegistrationForm';

type Props = { params: Promise<{ clubSlug: string }> };

// Server-side so a link pasted into a text thread, a team group chat, or
// an Instagram bio shows the actual club's name and crest instead of
// generic Pulse FC branding — the registration form itself is a client
// component ('use client', needs hooks/state) and can't export this.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clubSlug } = await params;
  const { data: club } = await supabase.from('clubs').select('id,name,logo_url').eq('slug', clubSlug).single();
  if (!club) {
    return { title: 'Tryout Registration — Pulse FC' };
  }

  let seasonLabel: string | null = null;
  const { data: fc } = await supabase.from('tryout_form_config').select('config_json').eq('club_id', club.id).single();
  if (fc?.config_json && typeof fc.config_json === 'object' && 'seasonLabel' in fc.config_json) {
    seasonLabel = (fc.config_json as { seasonLabel?: string }).seasonLabel ?? null;
  }

  const title = seasonLabel ? `${club.name} — ${seasonLabel} Tryouts` : `${club.name} — Tryout Registration`;
  const description = `Register for tryouts with ${club.name} on Pulse FC.`;
  const images = club.logo_url ? [{ url: club.logo_url }] : undefined;

  return {
    title,
    description,
    openGraph: {
      title, description, images,
      siteName: 'Pulse FC',
      url: `https://pulse-fc.app/t/${clubSlug}`,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title, description, images,
    },
  };
}

export default async function Page({ params }: Props) {
  const { clubSlug } = await params;
  return <TryoutRegistrationForm clubSlug={clubSlug} />;
}
