import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rssrbvlptyskfrvkcnlh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_tlSDEpNLvnAJprODrcYJ-A_xMZbQSsh';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.info('Supabase: Using default configured project credentials (https://rssrbvlptyskfrvkcnlh.supabase.co)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseClient = supabase;
export default supabase;
