# CLAUDE.md — Dugout FC

> **Expo note:** Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any Expo/RN code.

---

## Project: Dugout FC

### What it is
A fully self-serve, white-label soccer club management platform. Any DOC or coach can go to dugoutfc.app, create their club, set up their teams, import their roster, invite parents, and be live — with zero involvement from the app owner (Rick).

First two clubs: MDS Academy and Maroons SC (both run by Rick, used for testing and proving the product). All other clubs self-onboard.

### Business model
Free for the first 3 clubs while validating. Pricing TBD. No payment collection in v1. Subscriptions table stubbed and ready for Stripe later.

### Who is building this
Solo developer using Claude Code. Always choose the simpler of two approaches. Prioritise clarity and maintainability over cleverness.

---

## Three Products

### 1. Marketing site (dugoutfc.app)
- Single Next.js page
- Hero section with headline, subheadline, app mockup
- Feature highlights (AI schedule import, lineup builder, parent comms, real-time chat)
- "Add your club" CTA — starts the self-serve signup flow
- Simple interest/contact form that emails Rick via Resend
- App Store download badge once live
- Clean, modern design — dark background, green accent (soccer feel)

### 2. Club setup wizard (web — after signup)
The flow a new DOC or coach goes through after creating their account on dugoutfc.app:

Step 1 — Club details
- Club name
- Club slug (auto-generated from name, editable)
- Logo upload (Supabase Storage)
- Primary brand color picker
- Secondary brand color picker

Step 2 — Create first team
- Team name
- Age group
- Season

Step 3 — Add players
- Manually (name, position, jersey number) OR
- AI roster import (upload any spreadsheet, AI maps columns and imports)

Step 4 — Invite parents
- Bulk email send via Resend
- Each parent gets an email with App Store link + their child's team info
- Invite tracked in invites table

Step 5 — Upload schedule
- Manually add events OR
- AI schedule parser (upload PDF/image/CSV, AI creates all events)

Step 6 — Done
- "Your club is live" confirmation
- Link to download the app
- App Store badge

### 3. Mobile app (React Native + Expo — iOS App Store)
Everything that happens after a user downloads the app.

---

## User Journeys

### Journey 1 — New DOC / Coach (self-serve)
dugoutfc.app → clicks "Add your club" → creates account (email/password, Google, or Apple) → role set to org_admin automatically → enters club setup wizard (steps 1–6 above) → club is live → downloads app → logs in → lands on Home as Org Admin

### Journey 2 — Parent invited by coach
Coach adds player to roster → enters parent email → app sends invite email via Resend (includes App Store link + invite token) → parent downloads app → opens app → sees "You've been invited to join [Team Name]" → signs up → automatically joined to team → lands on Home

### Journey 3 — Parent finds app on App Store organically
Downloads app → opens app → "Find your team" screen → enters club slug or invite token → joins team → lands on Home

### Journey 4 — Rick (App Admin)
Logs into /super-admin on web dashboard → sees all clubs, team counts, active user counts, signup dates → can view any club → can suspend a club if needed

---

## Access Levels (4 roles)

| Role | Who | Access |
|---|---|---|
| app_admin | Rick only | Super-admin dashboard, all clubs, platform config |
| org_admin | Club Admin / DOC | All teams in their club, staff, branding, settings, setup wizard |
| coach | Head coach / team manager | Their assigned team(s), events, roster, comms, lineup builder |
| player | Parent / guardian / player | Their child's team only, RSVP, chat, profile |

---

## Authentication
- Email + password via Supabase Auth
- Google OAuth via Supabase Auth
- Apple Sign-In via Supabase Auth (required for App Store)
- All three on the login and signup screens
- New org_admin signups via dugoutfc.app automatically get role = org_admin
- New parent signups via invite link automatically get role = player and are joined to the correct team

---

## Mobile App — Post-Download Onboarding Screens

What a brand new user sees before reaching the Home tab:

1. Welcome screen — Dugout FC logo, tagline, Sign Up / Log In buttons
2. Auth screen — email/password, Google, Apple
3. Find your team — enter invite token (pre-filled if opened from invite email) or search by club slug
4. Profile setup — full name, profile photo (optional)
5. Home tab

---

## Mobile App Navigation

### Bottom tabs (all users)
1. Home
2. Schedule
3. Roster
4. Chat

### Top right header
- Notifications bell (all users)
- Admin panel icon (coaches and above only)
- Settings gear (all users)

---

## Feature Detail

### Home tab
- Team switcher dropdown at top (for users on multiple teams)
- Next event countdown card
- Quick RSVP card for upcoming event
- Recent announcements feed
- Unread message badge
- Attendance streak for players

### Schedule tab
- List view and calendar toggle
- Event types: Game, Training, Other
- Inline RSVP (Attending / Not Attending — no Maybe)
- Coach sets RSVP lock date and time per event
- AI suggests lock time (24hrs before game, 2hrs before training) — coach accepts or overrides
- Location with Google Maps deep link
- Attendance count visible to coaches

### Roster tab
- Player photo, name, jersey number, position
- Parent contact info visible to coaches only
- Player profile page
- Coach can add / remove players
- Coach can send invite email to parent from roster screen

### Chat tab
Three sections:
1. Team Chat — real-time group chat, all team members, Supabase Realtime
2. Announcements — coach creates, parents read only, each has Email Team button (Resend)
3. Direct Messages — 1:1 or group DMs, coach initiates with any parent

### Admin panel (coaches and above — top right icon)
- Create and edit events
- Lineup Builder (accessed from inside each event)
- Attendance reports with percentages
- RSVP summary per event
- Manage roster
- Send email to team or selected parents
- Roster CSV import (AI-powered)
- Schedule upload (AI-powered)

### Lineup Builder (inside each event in admin panel)
- SVG soccer pitch, drag and drop players into position
- Select formation: 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 3-4-3, 5-3-2
- Only confirmed RSVPs shown as available players
- AI suggests starting lineup based on confirmed RSVPs and player positions
- AI generates substitution rotation plan for equal play time

### Settings
- Profile photo upload (Supabase Storage)
- Name and password update
- Notification preferences
- Org branding for Org Admins (logo, primary color, secondary color)

### Notifications
- Push via Expo Push Notifications
- In-app notification centre
- Types: RSVP reminder, new announcement, new DM, schedule change, invite accepted

### Super-admin dashboard (web — /super-admin — Rick only)
- List of all clubs with: name, slug, signup date, team count, active user count
- Click into any club to view details
- Ability to suspend a club
- New signups shown at top

---

## V1 AI Features (4 only — powered by Anthropic Claude API)

All calls routed through a single /api/ai endpoint. Model: claude-sonnet-4-6. Never call the API directly from the client.

### 1. Schedule upload parser
- Coach uploads PDF, image, or CSV of season schedule
- AI extracts: date, time, location, opponent, event type
- Creates all events automatically in database
- Flags uncertain rows for coach review before committing

### 2. Roster import AI
- Coach uploads spreadsheet in any format (Excel, CSV, Google Sheets export)
- AI maps columns to: name, DOB, position, jersey number, parent email
- Imports players to roster
- Flags uncertain rows for manual review

### 3. AI lineup suggester
- Triggered from Lineup Builder
- Input: confirmed RSVPs, player positions, selected formation
- Output: suggested starting lineup with players placed on pitch
- Coach accepts, adjusts, or ignores

### 4. Substitution rotation planner
- Triggered from Lineup Builder after lineup is set
- Input: squad size, game length, halves, available players
- Output: substitution timeline for equal play time
- Formatted for sideline reference

---

## White-Label Architecture
- Every club has a unique slug
- URL structure: /{clubSlug}/ for all club-specific routes
- Theme provider applies club logo and brand colors dynamically
- Super-admin at /super-admin (app_admin role only)
- Club setup wizard at /onboarding (org_admin role only, shown after first signup)

---

## Database Schema

```sql
-- Clubs
clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  primary_color text default '#000000',
  secondary_color text default '#ffffff',
  created_at timestamptz default now()
)

-- User profiles
profiles (
  id uuid primary key references auth.users(id),
  club_id uuid references clubs(id),
  full_name text,
  avatar_url text,
  role text check (role in ('app_admin','org_admin','coach','player')),
  preferred_language text default 'en',
  created_at timestamptz default now()
)

-- Teams
teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) not null,
  name text not null,
  age_group text,
  season text,
  created_at timestamptz default now()
)

-- Players (roster entries, separate from user accounts)
players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  full_name text not null,
  jersey_number int,
  position text,
  profile_id uuid references profiles(id),
  created_at timestamptz default now()
)

-- Team members (users linked to teams)
team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  profile_id uuid references profiles(id) not null,
  role text check (role in ('coach','parent','player')),
  created_at timestamptz default now(),
  unique(team_id, profile_id)
)

-- Parent invites
invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  player_id uuid references players(id),
  email text not null,
  token text unique not null default gen_random_uuid()::text,
  accepted_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
)

-- Events
events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  title text not null,
  type text check (type in ('game','training','other')) default 'training',
  event_date date not null,
  event_time time,
  location text,
  address text,
  lat numeric,
  lng numeric,
  rsvp_lock_at timestamptz,
  ai_suggested_lock_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
)

-- RSVPs
event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) not null,
  player_id uuid references players(id) not null,
  responded_by uuid references profiles(id),
  status text check (status in ('attending','not_attending')) not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(event_id, player_id)
)

-- Lineups
lineups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) not null,
  formation text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
)

-- Player positions on pitch
lineup_positions (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid references lineups(id) not null,
  player_id uuid references players(id) not null,
  x numeric not null,
  y numeric not null,
  position_label text
)

-- Sub rotation plans
sub_plans (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid references lineups(id) not null,
  plan_json jsonb not null,
  created_at timestamptz default now()
)

-- Conversations
conversations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  type text check (type in ('team_group','announcement','direct')) not null,
  title text,
  created_at timestamptz default now()
)

-- Conversation participants
conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) not null,
  profile_id uuid references profiles(id) not null,
  unique(conversation_id, profile_id)
)

-- Messages
messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) not null,
  sender_id uuid references profiles(id) not null,
  body text not null,
  created_at timestamptz default now()
)

-- Announcements
announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  title text not null,
  body text not null,
  pinned boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
)

-- Push tokens
push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) not null,
  token text not null,
  platform text check (platform in ('ios','android')),
  created_at timestamptz default now(),
  unique(profile_id, token)
)

-- In-app notifications
notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) not null,
  type text not null,
  title text not null,
  body text,
  read boolean default false,
  data jsonb,
  created_at timestamptz default now()
)

-- Player development notes
player_development_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) not null,
  team_id uuid references teams(id) not null,
  coach_id uuid references profiles(id) not null,
  session_date date not null,
  notes text not null,
  created_at timestamptz default now()
)

-- Subscriptions stub (ready for Stripe, not active in v1)
subscriptions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) not null,
  status text check (status in ('active','trialing','cancelled','past_due')) default 'trialing',
  plan text,
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz,
  created_at timestamptz default now()
)
```

---

## Folder Structure

```
/dugout-fc
  CLAUDE.md
  .env.example
  /app                          (Expo Router — mobile screens)
    /(auth)
      welcome.tsx
      login.tsx
      register.tsx
      find-team.tsx
      profile-setup.tsx
    /(app)
      /[clubSlug]
        /(tabs)
          index.tsx             (Home)
          schedule.tsx
          roster.tsx
          chat.tsx
        /admin
          index.tsx
          /events
            [eventId].tsx
            lineup.tsx
        /notifications.tsx
        /settings.tsx
  /components
    /ui
    /home
    /schedule
    /roster
    /chat
    /lineup
    /admin
    /onboarding
  /lib
    supabase.ts
    claude.ts
    resend.ts
    posthog.ts
  /hooks
    useAuth.ts
    useTeam.ts
    useClub.ts
  /types
    database.ts
  /constants
    formations.ts
    eventTypes.ts
    colors.ts
  /web                          (Next.js — marketing site + web dashboard)
    /app
      /page.tsx
      /onboarding/page.tsx
      /super-admin/page.tsx
      /api
        /ai/route.ts
        /send-invite/route.ts
```

---

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_POSTHOG_KEY=
EXPO_PUBLIC_APP_ENV=development
NEXT_PUBLIC_APP_URL=https://dugoutfc.app
```

---

## Key Conventions
- TypeScript everywhere, no any types
- RLS on every Supabase table — data never leaks across clubs
- All AI calls go through /api/ai only — never call Anthropic from the client
- Club slug always in URL — never hardcode club data
- One AI model: claude-sonnet-4-6
- Keep components small and single-purpose
- Update CLAUDE.md when major features are added or decisions change

---

## Build Order

### Phase 1 — Foundation
1. Create CLAUDE.md ✓
2. Scaffold React Native + Expo project with Expo Router and TypeScript ✓
3. Create full folder structure ✓
4. Install dependencies ✓
5. Create .env.example ✓
6. Generate full Supabase SQL migration with RLS policies ✓
7. Set up /lib/supabase.ts ✓
8. Set up /lib/claude.ts ✓
9. Set up /lib/resend.ts ✓
10. Set up /lib/posthog.ts ✓
11. Generate /types/database.ts ✓
12. Create /constants/formations.ts and /constants/eventTypes.ts ✓

### Phase 2 — Auth + onboarding screens
### Phase 3 — Club setup wizard (web)
### Phase 4 — Core mobile screens
### Phase 5 — Admin panel + Lineup Builder
### Phase 6 — AI features
### Phase 7 — Marketing site
### Phase 8 — Super-admin dashboard
### Phase 9 — Push notifications + App Store prep
