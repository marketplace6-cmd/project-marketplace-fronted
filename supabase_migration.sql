-- Uvikart Supabase Database Schema Update
-- Adds missing front_image_url and back_image_url columns to the verifications table

ALTER TABLE IF EXISTS public.verifications
  ADD COLUMN IF NOT EXISTS front_image_url TEXT,
  ADD COLUMN IF NOT EXISTS back_image_url TEXT,
  ADD COLUMN IF NOT EXISTS front_data_url TEXT,
  ADD COLUMN IF NOT EXISTS back_data_url TEXT,
  ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Comments explaining column usage
COMMENT ON COLUMN public.verifications.front_image_url IS 'Base64 data URI or public storage URL for the front ID card image';
COMMENT ON COLUMN public.verifications.back_image_url IS 'Base64 data URI or public storage URL for the back ID card image';
COMMENT ON COLUMN public.verifications.front_data_url IS 'Base64 data URI fallback for front ID card';
COMMENT ON COLUMN public.verifications.back_data_url IS 'Base64 data URI fallback for back ID card';
COMMENT ON COLUMN public.verifications.rejection_count IS 'Counter tracking number of rejected verification submissions (max 2)';
COMMENT ON COLUMN public.verifications.rejection_reason IS 'Administrative rejection feedback for student correction';

-- Ensure helpful indexes exist
CREATE INDEX IF NOT EXISTS idx_verifications_status ON public.verifications(status);
CREATE INDEX IF NOT EXISTS idx_verifications_user_id ON public.verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_email ON public.verifications(email);

-- Payouts and Student Withdrawal Requests Table
CREATE TABLE IF NOT EXISTS public.payouts (
  id BIGSERIAL PRIMARY KEY,
  payout_id TEXT UNIQUE NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT,
  referral_code TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  payment_method TEXT NOT NULL DEFAULT 'UPI', -- 'UPI' or 'BANK_TRANSFER'
  upi_id TEXT,
  phone TEXT,
  bank_account TEXT,
  ifsc_code TEXT,
  branch_name TEXT,
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'PAID', 'REJECTED'
  utr_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_student_id ON public.payouts(student_id);
CREATE INDEX IF NOT EXISTS idx_payouts_referral_code ON public.payouts(referral_code);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status);

