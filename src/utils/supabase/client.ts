import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rssrbvlptyskfrvkcnlh.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_tlSDEpNLvnAJprODrcYJ-A_xMZbQSsh';

export const supabase = createClient(supabaseUrl, supabaseKey);
