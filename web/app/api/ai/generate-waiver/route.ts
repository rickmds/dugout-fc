import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireRole } from '@/lib/apiAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEMPLATE_PROMPTS: Record<string, string> = {
  season_participation: 'a season participation and liability waiver covering training sessions, games, and club activities. Include assumption of risk for sport-related injuries, liability release for the club and coaches, and acknowledgment that participation in soccer carries inherent risks.',
  medical_consent: 'a medical consent and emergency treatment authorization form. Include authorization for coaches to consent to emergency medical treatment when a parent cannot be reached, insurance information fields, known allergies and medical conditions section, and physician contact details.',
  photo_video: 'a photo and video consent form. Include consent for photographs and video recordings taken during training and games, how media may be used (club website, social media, promotional materials, local press), and an opt-out clause.',
  tournament_travel: 'a tournament and travel permission waiver. Include permission for the player to travel to away tournaments and competitions, liability during travel, chaperone acknowledgment, overnight stay consent if applicable, and behavior expectations.',
  clinic_camp: 'a clinic or training camp participation waiver. Include assumption of risk for the specific event, liability release, emergency medical consent during the event, photo consent, and code of conduct acknowledgment.',
  guest_player: 'a guest player participation waiver. Include acknowledgment of guest player status (not a registered club member), assumption of risk for the session, liability release, club rules acknowledgment, and confirmation of current registration with another club.',
};

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { template_type, custom_notes, club_name } = await req.json();

  if (!template_type || !TEMPLATE_PROMPTS[template_type]) {
    return NextResponse.json({ error: 'Invalid template type' }, { status: 400 });
  }

  const customSection = custom_notes?.trim()
    ? `\n\nAdditional specifics from the club: ${custom_notes.trim()}`
    : '';

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `You are helping a youth soccer club create a professional waiver document. The club name is "${club_name}".

Write ${TEMPLATE_PROMPTS[template_type]}${customSection}

Requirements:
- Use clear, professional language that parents can understand
- Use [PLAYER NAME], [PARENT/GUARDIAN NAME], [DATE], [SIGNATURE], [RELATIONSHIP TO PLAYER] as placeholders
- Structure with clear section headings — write headings in ALL CAPS on their own line, not with # symbols
- Use blank lines between sections for readability
- Do NOT use any markdown formatting: no #, ##, **, *, ---, backticks, or bullet dashes
- End with a signature block
- Output only the waiver document text — no preamble, no explanation, no meta-commentary`,
      }],
    });

    const body = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    return NextResponse.json({ body });
  } catch (e) {
    console.error('generate-waiver error', e);
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}
