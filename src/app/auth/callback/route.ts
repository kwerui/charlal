import { NextResponse, type NextRequest } from 'next/server';
import { getAuthCallbackRedirectOrigin } from '@/lib/auth/callbackOrigin';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import { createClient } from '@/lib/supabase/server';

function getRequestOrigin(request: NextRequest): string {
  return getAuthCallbackRedirectOrigin({
    requestOrigin: request.nextUrl.origin,
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const nextPath = getSafeNextPath(
    request.nextUrl.searchParams.get('next'),
    '/account'
  );
  const origin = getRequestOrigin(request);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, origin));
    }
  }

  const failedUrl = new URL('/sign-in', origin);
  failedUrl.searchParams.set('error', 'confirmation');
  failedUrl.searchParams.set('next', nextPath);

  return NextResponse.redirect(failedUrl);
}
