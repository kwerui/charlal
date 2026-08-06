import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import { createClient } from '@/lib/supabase/server';

// Optional compatibility for a future custom SMTP/template setup that can send
// token_hash links. The default locked Supabase template uses /auth/callback.
function isAllowedEmailOtpType(type: string | null): type is EmailOtpType {
  return type === 'email' || type === 'signup';
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get('next'), '/account');

  if (tokenHash && isAllowedEmailOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }
  }

  const failedUrl = new URL('/sign-in', request.url);
  failedUrl.searchParams.set('error', 'confirmation');
  failedUrl.searchParams.set('next', nextPath);

  return NextResponse.redirect(failedUrl);
}
