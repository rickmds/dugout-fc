-- Registration Hub — full feature set (items 1-50)

-- ── registration_forms additions ─────────────────────────────────────────────

ALTER TABLE registration_forms
  ADD COLUMN IF NOT EXISTS open_at               timestamptz,
  ADD COLUMN IF NOT EXISTS close_at              timestamptz,
  ADD COLUMN IF NOT EXISTS archived              boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS season_label          text,
  ADD COLUMN IF NOT EXISTS early_access_ends_at  timestamptz,
  ADD COLUMN IF NOT EXISTS views_count           int           DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allow_late_reg        boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS field_logic           jsonb         DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS volunteer_slots       jsonb         DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS required_docs         jsonb         DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS financial_aid_enabled boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_mode            text          CHECK (price_mode IN ('flat','field','tiers')),
  ADD COLUMN IF NOT EXISTS price_tiers           jsonb,
  ADD COLUMN IF NOT EXISTS description           text;

-- ── registration_submissions additions ───────────────────────────────────────

ALTER TABLE registration_submissions
  ADD COLUMN IF NOT EXISTS internal_notes          text,
  ADD COLUMN IF NOT EXISTS is_returning            boolean,
  ADD COLUMN IF NOT EXISTS is_duplicate_flagged    boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_of            uuid          REFERENCES registration_submissions(id),
  ADD COLUMN IF NOT EXISTS offline_payment_method  text          CHECK (offline_payment_method IN ('cash','bank_transfer','cheque','other')),
  ADD COLUMN IF NOT EXISTS offline_payment_ref     text,
  ADD COLUMN IF NOT EXISTS offline_payment_date    date,
  ADD COLUMN IF NOT EXISTS financial_aid_requested boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS financial_aid_approved  boolean,
  ADD COLUMN IF NOT EXISTS financial_aid_amount    numeric(10,2),
  ADD COLUMN IF NOT EXISTS fee_waived              boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS family_group_id         uuid,
  ADD COLUMN IF NOT EXISTS waitlist_position       int,
  ADD COLUMN IF NOT EXISTS promo_code_used         text,
  ADD COLUMN IF NOT EXISTS discount_applied        numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roster_added_at         timestamptz,
  ADD COLUMN IF NOT EXISTS roster_player_id        uuid          REFERENCES players(id);

-- ── Promo / discount codes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS registration_promo_codes (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid         REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  form_id        uuid         REFERENCES registration_forms(id) ON DELETE CASCADE,
  code           text         NOT NULL,
  discount_type  text         CHECK (discount_type IN ('percent','flat')) DEFAULT 'percent',
  discount_value numeric(10,2) NOT NULL,
  max_uses       int,
  uses_count     int          DEFAULT 0,
  expires_at     timestamptz,
  active         boolean      DEFAULT true,
  created_by     uuid         REFERENCES profiles(id),
  created_at     timestamptz  DEFAULT now(),
  UNIQUE(club_id, code)
);

ALTER TABLE registration_promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club members manage promo codes"
  ON registration_promo_codes FOR ALL
  USING (club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()));

-- ── Payment plan installments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS registration_installments (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid         REFERENCES registration_submissions(id) ON DELETE CASCADE NOT NULL,
  amount         numeric(10,2) NOT NULL,
  due_date       date,
  paid_at        timestamptz,
  payment_method text         CHECK (payment_method IN ('stripe','cash','bank_transfer','cheque','other')),
  reference      text,
  notes          text,
  created_at     timestamptz  DEFAULT now()
);

ALTER TABLE registration_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club members manage installments"
  ON registration_installments FOR ALL
  USING (submission_id IN (
    SELECT rs.id FROM registration_submissions rs
    JOIN registration_forms rf ON rf.id = rs.form_id
    JOIN profiles p ON p.club_id = rf.club_id
    WHERE p.id = auth.uid()
  ));

-- ── Document uploads ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS registration_document_uploads (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid        REFERENCES registration_submissions(id) ON DELETE CASCADE NOT NULL,
  doc_name       text        NOT NULL,
  file_url       text,
  uploaded_at    timestamptz,
  verified_at    timestamptz,
  verified_by    uuid        REFERENCES profiles(id),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE registration_document_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club members manage doc uploads"
  ON registration_document_uploads FOR ALL
  USING (submission_id IN (
    SELECT rs.id FROM registration_submissions rs
    JOIN registration_forms rf ON rf.id = rs.form_id
    JOIN profiles p ON p.club_id = rf.club_id
    WHERE p.id = auth.uid()
  ));

-- ── Late registration invite tokens ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS registration_late_invites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id    uuid        REFERENCES registration_forms(id) ON DELETE CASCADE NOT NULL,
  email      text        NOT NULL,
  token      text        UNIQUE DEFAULT gen_random_uuid()::text,
  sent_at    timestamptz DEFAULT now(),
  used_at    timestamptz,
  expires_at timestamptz
);

ALTER TABLE registration_late_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club members manage late invites"
  ON registration_late_invites FOR ALL
  USING (form_id IN (
    SELECT rf.id FROM registration_forms rf
    JOIN profiles p ON p.club_id = rf.club_id
    WHERE p.id = auth.uid()
  ));

-- ── Automated email templates ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS registration_email_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid        REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  trigger_name text        NOT NULL CHECK (trigger_name IN (
    'approval','decline','waitlist','payment_reminder',
    'deadline_reminder','late_invite','early_access','waitlist_promoted'
  )),
  subject      text        NOT NULL,
  body_html    text        NOT NULL,
  active       boolean     DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(club_id, trigger_name)
);

ALTER TABLE registration_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club members manage email templates"
  ON registration_email_templates FOR ALL
  USING (club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()));

-- ── Volunteer duty signups ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS registration_volunteer_signups (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid        REFERENCES registration_submissions(id) ON DELETE CASCADE NOT NULL,
  form_id       uuid        REFERENCES registration_forms(id) ON DELETE CASCADE NOT NULL,
  slot_id       text        NOT NULL,
  slot_label    text        NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE registration_volunteer_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club members manage volunteer signups"
  ON registration_volunteer_signups FOR ALL
  USING (form_id IN (
    SELECT rf.id FROM registration_forms rf
    JOIN profiles p ON p.club_id = rf.club_id
    WHERE p.id = auth.uid()
  ));
CREATE POLICY "public can insert volunteer signups"
  ON registration_volunteer_signups FOR INSERT
  WITH CHECK (form_id IN (SELECT id FROM registration_forms WHERE status = 'open'));

-- ── Submission RLS additions (update + delete for club members) ───────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'registration_submissions' AND policyname = 'club members update submissions'
  ) THEN
    CREATE POLICY "club members update submissions"
      ON registration_submissions FOR UPDATE
      USING (form_id IN (
        SELECT rf.id FROM registration_forms rf
        JOIN profiles p ON p.club_id = rf.club_id
        WHERE p.id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'registration_submissions' AND policyname = 'club members delete submissions'
  ) THEN
    CREATE POLICY "club members delete submissions"
      ON registration_submissions FOR DELETE
      USING (form_id IN (
        SELECT rf.id FROM registration_forms rf
        JOIN profiles p ON p.club_id = rf.club_id
        WHERE p.id = auth.uid()
      ));
  END IF;
END $$;
