import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth/recovery';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import { createClient } from '@/lib/supabase/server';

function isAllowedEmailOtpType(type: string | null): type is EmailOtpType {
  return type === 'email' || type === 'recovery';
}

function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLocaleLowerCase();
  const host = forwardedHost || request.headers.get('host')?.split(',')[0]?.trim();

  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    const protocol =
      forwardedProto === 'http' || forwardedProto === 'https'
        ? forwardedProto
        : request.nextUrl.protocol.replace(':', '');

    return `${protocol}://${host}`;
  }

  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const nextPath = getSafeNextPath(
    request.nextUrl.searchParams.get('next'),
    type === 'recovery' ? '/update-password' : '/account'
  );
  const origin = getRequestOrigin(request);

  if (tokenHash && isAllowedEmailOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      const response = NextResponse.redirect(new URL(nextPath, origin));

      if (type === 'recovery') {
        response.cookies.set(PASSWORD_RECOVERY_COOKIE, '1', {
          httpOnly: true,
          maxAge: 10 * 60,
          path: '/',
          sameSite: 'lax',
          secure: origin.startsWith('https://'),
        });
      }

      return response;
    }
  }

  if (type === 'recovery' || nextPath === '/update-password') {
    const failedRecoveryUrl = new URL('/update-password', origin);
    failedRecoveryUrl.searchParams.set('error', 'invalid-link');

    return NextResponse.redirect(failedRecoveryUrl);
  }

  const failedUrl = new URL('/sign-in', origin);
  failedUrl.searchParams.set('error', 'confirmation');
  failedUrl.searchParams.set('next', nextPath);

  return NextResponse.redirect(failedUrl);
}
