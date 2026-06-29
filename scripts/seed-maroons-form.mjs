// node scripts/seed-maroons-form.mjs
// Seeds the Maroons SC tryout form config. Uses {{clubName}} tokens so it works for any club.

const SUPABASE_URL = 'https://nandbuwogaxmrzsstttd.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbmRidXdvZ2F4bXJ6c3N0dHRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3MDI0MywiZXhwIjoyMDk3MTQ2MjQzfQ.E6uuet4_AhAY9PH8LS1_crFG11obwv04ohGpv-BZgDk';
const MDS_CLUB_ID = 'cef06fa3-ab88-482b-9cfb-5d8069b8aaf9';

const config = {
  formTitle: '{{clubName}} Tryout Registration',
  formSubtitle: 'Fall 2026 – Spring 2027 Season',
  welcomeText: `Welcome to the {{clubName}} Tryouts for the Fall 2026 – Spring 2027 season!\n\nWe are excited to evaluate players interested in joining our competitive teams for the upcoming year. Please complete this form to register for tryouts.\n\nUS Soccer Age Group Update: Beginning Fall 2026, US Soccer is transitioning youth soccer from calendar-year age groups to a seasonal-year model (August 1 – July 31). At {{clubName}}, tryout groupings and team placement are based on school grade under the new US Soccer seasonal-year model. For players born in August or September, grade-based alignment will be applied so those players remain with their school peer group.\n\nTryout Process: Each player is required to attend one tryout session. Following the tryout, selected players may be invited to a team training session for further evaluation. After evaluations are complete, offer letters will be sent based on performance, roster needs, and team balance. Not every player who attends will be offered a roster spot.`,
  locationText: 'Superdome Sports, 134 Hopper Ave, Waldwick, NJ 07463',
  sessionScheduleText: `Saturday, April 11, 2026 (Boys & Girls)\n• 1st Grade (Incoming 2nd) — 9:00 AM – 10:00 AM\n• 2nd Grade (Incoming 3rd) — 10:00 AM – 11:00 AM\n• 3rd Grade (Incoming 4th) — 11:00 AM – 12:00 PM\n• 4th Grade (Incoming 5th) — 12:00 PM – 1:00 PM\n• 5th Grade (Incoming 6th) — 1:00 PM – 2:00 PM\n• 6th/7th Grade (Incoming 7th/8th) — 2:00 PM – 3:00 PM\n\nTuesday, April 14, 2026 (Girls ONLY)\n• 1st/2nd Grade (Incoming 2nd/3rd) — 4:00 PM – 5:00 PM\n• 3rd/4th Grade (Incoming 4th/5th) — 5:00 PM – 6:00 PM\n• 5th/6th/7th Grade (Incoming 6th/7th/8th) — 6:00 PM – 7:00 PM\n\nWednesday, April 15, 2026 (Boys ONLY)\n• 1st/2nd Grade (Incoming 2nd/3rd) — 4:00 PM – 5:00 PM\n• 3rd/4th Grade (Incoming 4th/5th) — 5:00 PM – 6:00 PM\n• 5th/6th/7th Grade (Incoming 6th/7th/8th) — 6:00 PM – 7:00 PM`,
  offerTimelineText: 'Offer letters will be sent via email on June 1st. Families will have one week to accept their roster spot. After the deadline, remaining spots will be offered to waitlisted players. No offers will be released before June 1st.',
  importantInfoText: '• Players must bring shin guards, cleats, and a properly inflated ball\n• Please arrive at least 15 minutes early for check-in\n• Tryouts are free of charge, but registration is required',
  contactText: 'Boys Program: Rick Breheny – rick@maroonssoccer.com\nGirls Program: Ben Manning – ben@maroonssoccer.com',
  seasonLabel: '2026-27',
  submitLabel: 'Submit Registration',
  successTitle: 'Registration Complete!',
  successBody: 'Thank you for registering for {{clubName}} Tryouts. Offer letters will be sent on June 1st. We look forward to seeing you on the field — good luck!',
  gradeOptions: ['1st Grade','2nd Grade','3rd Grade','4th Grade','5th Grade','6th Grade','7th Grade','8th Grade'],
  positionOptions: ['GK','Defender','Midfielder','Forward','Not Sure'],
  referralOptions: ['Friend','Social Media','Website','Attended a camp/clinic with {{clubName}}','Coach Referral','Other'],
  jerseySizeOptions: ['YS','YM','YL','AS','AM','AL','AXL'],
  questions: [
    {
      id: 'q_tryout_date', type: 'radio',
      label: 'Which tryout date will you be attending?',
      helpText: "Select the session that matches your player's grade. See the session schedule above.",
      required: true,
      options: ['Saturday, April 11th (Boys & Girls)','Tuesday, April 14th (Girls ONLY)','Wednesday, April 15th (Boys ONLY)'],
      fieldKey: 'tryout_date', builtIn: false,
    },
    {
      id: 'q_grade_alignment', type: 'radio',
      label: 'Is your child in the school grade that aligns with the October 1 school cutoff?',
      helpText: 'Players born in August or September may be in a different grade than typical for their birthdate.',
      required: true,
      options: ['Yes','No — my child is in a higher grade than typical for their birthdate','No — my child is in a lower grade than typical for their birthdate'],
      fieldKey: 'grade_alignment', builtIn: false,
    },
    {
      id: 'q_email_secondary', type: 'text',
      label: 'Additional Parent / Guardian Email (Optional)',
      helpText: 'If provided, offer letters and important updates will also be sent to this address.',
      required: false, options: [], fieldKey: 'email_secondary', builtIn: false,
    },
    {
      id: 'q_prev_experience', type: 'radio',
      label: 'Previous Soccer Experience',
      helpText: '',
      required: true,
      options: ['Recreational','Travel / Select','Club','No prior experience'],
      fieldKey: 'prev_experience', builtIn: false,
    },
    {
      id: 'q_dual_card', type: 'radio',
      label: 'Do you plan to dual card and play for another club during the 2026–2027 season?',
      helpText: '',
      required: true,
      options: ['Yes, I plan to dual card and play for another club.','No, {{clubName}} will be my primary and only club.','Not sure yet.'],
      fieldKey: 'dual_card', builtIn: false,
    },
    {
      id: 'q_dual_card_league', type: 'radio',
      label: 'If yes, what league will that club compete in?',
      helpText: 'Only complete if you answered Yes above.',
      required: false,
      options: ['US CLUB (NCSA & NPL)','NJYS (EDP)','Not Sure'],
      fieldKey: 'dual_card_league', builtIn: false,
    },
    {
      id: 'q_maroons_status', type: 'radio',
      label: 'What is your current status with {{clubName}}?',
      helpText: '',
      required: true,
      options: [
        'I am currently rostered on a {{clubName}} team',
        'I previously played for {{clubName}} and want to return',
        'I have never played for {{clubName}} and am a new player',
      ],
      fieldKey: 'maroons_status', builtIn: false,
    },
    {
      id: 'q_agreement_1', type: 'checkbox',
      label: 'I confirm that the information provided is accurate, and I understand the tryout process and club policies.',
      helpText: '', required: true, options: [], fieldKey: 'agreement_1', builtIn: false,
    },
    {
      id: 'q_agreement_2', type: 'checkbox',
      label: 'I acknowledge that I will be contacted regarding tryout results and next steps.',
      helpText: '', required: true, options: [], fieldKey: 'agreement_2', builtIn: false,
    },
  ],
};

const res = await fetch(`${SUPABASE_URL}/rest/v1/tryout_form_config`, {
  method: 'POST',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  },
  body: JSON.stringify({ club_id: MDS_CLUB_ID, season_label: '2026-27', config_json: config }),
});

if (res.ok || res.status === 201 || res.status === 200) {
  console.log('✓ Maroons SC form config seeded successfully');
} else {
  const body = await res.text();
  console.error('✗ Failed:', res.status, body);
}
