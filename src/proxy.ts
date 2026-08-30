import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/proxy';

const handleI18nRouting = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return updateSession(request);
  }

  return updateSession(
    request,
    (nextRequest) => handleI18nRouting(nextRequest) || NextResponse.next({ request: nextRequest })
  );
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
