import { NextResponse } from 'next/server';
import { PASSWORD_RECOVERY_STATE_COOKIE } from '@/lib/auth/passwordRecovery';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(PASSWORD_RECOVERY_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });

  return response;
}
