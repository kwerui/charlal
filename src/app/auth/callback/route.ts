import { NextResponse, type NextRequest } from 'next/server';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import { createClient } from '@/lib/supabase/server';

function getConfiguredSiteOrigin(): string | null {
  const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!rawSiteUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawSiteUrl);

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null;
    }

    return parsedUrl.origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(request: NextRequest): string {
  const configuredOrigin = getConfiguredSiteOrigin();

  if (configuredOrigin) {
    return configuredOrigin;
  }

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
