import { createBrowserClient, createServerClient } from '@supabase/ssr';
import {
  getSupabaseEnvironmentCheck,
  type SupabaseEnvironmentCheck,
} from '@/lib/supabase/env';

export type SupabaseClientVerification =
  | { ok: true }
  | { ok: false; reason: 'missing-env'; missing: string[] }
  | { ok: false; reason: 'production-disabled' };

export function verifySupabaseClientsForDevelopment(): SupabaseClientVerification {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, reason: 'production-disabled' };
  }

  const envCheck: SupabaseEnvironmentCheck = getSupabaseEnvironmentCheck();

  if (!envCheck.ok) {
    return {
      ok: false,
      reason: 'missing-env',
      missing: envCheck.missing,
    };
  }

  createBrowserClient(
    envCheck.env.supabaseUrl,
    envCheck.env.supabasePublishableKey
  );
  createServerClient(
    envCheck.env.supabaseUrl,
    envCheck.env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          return undefined;
        },
      },
    }
  );

  return { ok: true };
}
