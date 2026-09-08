import { NextResponse, type NextRequest } from 'next/server';
import { getAuthCallbackRedirectOrigin } from '@/lib/auth/callbackOrigin';
import {
  PASSWORD_RECOVERY_STATE_COOKIE,
  PASSWORD_RECOVERY_STATE_MAX_AGE_SECONDS,
  getPasswordRecoveryErrorPath,
  isPasswordRecoveryNextPath,
} from '@/lib/auth/passwordRecovery';
import {
  getAuthFailureSignInPath,
  getLocaleFromSafeAuthPath,
} from '@/lib/auth/emailConfirmation';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import { createClient } from '@/lib/supabase/server';

function getLocaleFromSafePath(nextPath: string): string {
  return getLocaleFromSafeAuthPath(nextPath);
}

function getAuthRedirectType(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const authData = data as { redirectType?: unknown };

  return typeof authData.redirectType === 'string'
    ? authData.redirectType
    : null;
}

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (isPasswordRecoveryNextPath(nextPath)) {
        if (getAuthRedirectType(data) !== 'recovery') {
          return NextResponse.redirect(
            new URL(getPasswordRecoveryErrorPath(getLocaleFromSafePath(nextPath)), origin)
          );
        }

        const response = NextResponse.redirect(new URL(nextPath, origin));

        response.cookies.set(PASSWORD_RECOVERY_STATE_COOKIE, '1', {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: PASSWORD_RECOVERY_STATE_MAX_AGE_SECONDS,
          path: '/',
        });

        return response;
      }

      return NextResponse.redirect(new URL(nextPath, origin));
    }
  }

  if (isPasswordRecoveryNextPath(nextPath)) {
    return NextResponse.redirect(
      new URL(getPasswordRecoveryErrorPath(getLocaleFromSafePath(nextPath)), origin)
    );
  }

  const failedUrl = new URL(getAuthFailureSignInPath(nextPath), origin);
  failedUrl.searchParams.set('error', 'confirmation');
  failedUrl.searchParams.set('next', nextPath);

  return NextResponse.redirect(failedUrl);
}
