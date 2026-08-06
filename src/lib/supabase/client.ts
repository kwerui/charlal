import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicEnv();

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
