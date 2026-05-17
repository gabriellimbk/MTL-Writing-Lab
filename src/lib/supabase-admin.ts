import { createClient } from '@supabase/supabase-js';

// Service role key for admin operations (server-side only)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase admin credentials missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
}

export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null as any;
