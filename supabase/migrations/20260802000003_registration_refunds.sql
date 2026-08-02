-- Add refund tracking columns to registration_submissions
ALTER TABLE registration_submissions
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS refund_notes    text;
