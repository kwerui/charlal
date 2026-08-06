import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

function isServerComponentCookieWriteError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /cookies can only be modified|readonlyrequestcookies/i.test(error.message)
  );
}

export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicEnv();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          if (isServerComponentCookieWriteError(error)) {
            return;
          }

          throw error;
        }
      },
    },
  });
}
