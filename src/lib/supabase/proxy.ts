import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnvironmentCheck } from '@/lib/supabase/env';

type ResponseFactory = (request: NextRequest) => NextResponse;

function createDefaultResponse(request: NextRequest): NextResponse {
  return NextResponse.next({ request });
}

export async function updateSession(
  request: NextRequest,
  createResponse: ResponseFactory = createDefaultResponse
): Promise<NextResponse> {
  const envCheck = getSupabaseEnvironmentCheck();

  if (!envCheck.ok) {
    return createResponse(request);
  }

  const { supabaseUrl, supabasePublishableKey } = envCheck.env;
  let supabaseResponse = createResponse(request);

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = createResponse(request);

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();

  return supabaseResponse;
}
