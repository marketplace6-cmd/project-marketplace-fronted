-- Unikart Supabase Database Schema Update
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
COMMENT ON COLUMN public.verifications.status IS 'Verification status: PENDING (new), RE-UPLOADED (priority re-upload after rejection), APPROVED, VERIFIED, REJECTED, BLOCKED';
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

-- Student Notifications and Messages Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  student_id TEXT,
  email TEXT,
  notification_type TEXT NOT NULL DEFAULT 'verification_rejected',
  title TEXT,
  message TEXT NOT NULL,
  rejection_reason TEXT,
  remaining_attempts INTEGER DEFAULT 1,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_email ON public.notifications(email);

-- Student Users and Authentication Table (Section 7)
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  college TEXT NOT NULL,
  course TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);

-- One-Time Password (OTP) Verification Records Table (Section 5 & 7)
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id BIGSERIAL PRIMARY KEY,
  contact TEXT NOT NULL,
  contact_type TEXT NOT NULL, -- 'email' or 'phone'
  otp_code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_verifications_contact ON public.otp_verifications(contact);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires_at ON public.otp_verifications(expires_at);

-- -----------------------------------------------------------------------------
-- Verifications Table Compatibility & Row Level Security (RLS) Policies
-- Ensures user_id supports UUID/Text, is nullable, and allows public/student submissions & admin operations
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.verifications
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT,
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert on verifications" ON public.verifications;
DROP POLICY IF EXISTS "Allow public select on verifications" ON public.verifications;
DROP POLICY IF EXISTS "Allow public update on verifications" ON public.verifications;
DROP POLICY IF EXISTS "Allow public delete on verifications" ON public.verifications;

CREATE POLICY "Allow public insert on verifications" 
  ON public.verifications FOR INSERT 
  TO anon, authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow public select on verifications" 
  ON public.verifications FOR SELECT 
  TO anon, authenticated 
  USING (true);

CREATE POLICY "Allow public update on verifications" 
  ON public.verifications FOR UPDATE 
  TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Allow public delete on verifications" 
  ON public.verifications FOR DELETE 
  TO anon, authenticated 
  USING (true);

GRANT ALL ON TABLE public.verifications TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;



