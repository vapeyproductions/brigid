'use client';  // runs in the browser

import { createClient } from '@supabase/supabase-js';

// Named export (your pages import this as: import { supabase } from '@/lib/supabaseClient')
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
