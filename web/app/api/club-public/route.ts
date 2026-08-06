import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from('clubs')
    .select('name, logo_url, primary_color')
    .eq('slug', slug)
    .single();

  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(data);
}
