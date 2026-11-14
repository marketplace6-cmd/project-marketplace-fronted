-- Uvikart Supabase Database Schema Update
-- Adds missing front_image_url and back_image_url columns to the verifications table

ALTER TABLE IF EXISTS public.verifications
  ADD COLUMN IF NOT EXISTS front_image_url TEXT,
  ADD COLUMN IF NOT EXISTS back_image_url TEXT,
  ADD COLUMN IF NOT EXISTS front_data_url TEXT,
  ADD COLUMN IF NOT EXISTS back_data_url TEXT;

-- Comments explaining column usage
COMMENT ON COLUMN public.verifications.front_image_url IS 'Base64 data URI or public storage URL for the front ID card image';
COMMENT ON COLUMN public.verifications.back_image_url IS 'Base64 data URI or public storage URL for the back ID card image';
COMMENT ON COLUMN public.verifications.front_data_url IS 'Base64 data URI fallback for front ID card';
COMMENT ON COLUMN public.verifications.back_data_url IS 'Base64 data URI fallback for back ID card';

-- Ensure helpful indexes exist
CREATE INDEX IF NOT EXISTS idx_verifications_status ON public.verifications(status);
CREATE INDEX IF NOT EXISTS idx_verifications_user_id ON public.verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_email ON public.verifications(email);
