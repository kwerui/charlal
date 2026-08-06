const REQUIRED_PUBLIC_SUPABASE_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;

type RequiredPublicSupabaseEnv = (typeof REQUIRED_PUBLIC_SUPABASE_ENV)[number];

export type SupabasePublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type SupabaseEnvironmentCheck =
  | { ok: true; env: SupabasePublicEnv }
  | { ok: false; missing: RequiredPublicSupabaseEnv[] };

function readSupabasePublicEnv(): SupabaseEnvironmentCheck {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const values: Record<RequiredPublicSupabaseEnv, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
  };
  const missing = REQUIRED_PUBLIC_SUPABASE_ENV.filter(
    (name) => !values[name]
  );

  if (missing.length > 0 || !supabaseUrl || !supabasePublishableKey) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    env: {
      supabaseUrl,
      supabasePublishableKey,
    },
  };
}

export function getSupabaseEnvironmentCheck(): SupabaseEnvironmentCheck {
  return readSupabasePublicEnv();
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const result = readSupabasePublicEnv();

  if (!result.ok) {
    throw new Error(
      `Missing Supabase environment variable(s): ${result.missing.join(
        ', '
      )}. Add them to .env.local using your Supabase Project URL and Publishable key.`
    );
  }

  return result.env;
}
