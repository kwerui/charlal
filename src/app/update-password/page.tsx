import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth/recovery';
import { getCurrentUserResult } from '@/lib/auth/server';
import UpdatePasswordForm from './UpdatePasswordForm';

type UpdatePasswordPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function hasQueryFlag(value: string | string[] | undefined, expected: string): boolean {
  const queryValue = Array.isArray(value) ? value[0] : value;

  return queryValue === expected;
}

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
  const query = await searchParams;
  const invalidLink = hasQueryFlag(query.error, 'invalid-link');
  const cookieStore = await cookies();
  const hasRecoverySession =
    cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === '1';
  const authResult = await getCurrentUserResult();

  if (!invalidLink && authResult.status === 'authenticated' && !hasRecoverySession) {
    redirect('/account');
  }

  const canUpdatePassword =
    !invalidLink &&
    hasRecoverySession &&
    authResult.status === 'authenticated';

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="update-password-title">
        <div className="auth-card-copy">
          <p className="hero-kicker">{content.resetPasswordKicker}</p>
          <h2 id="update-password-title" className="auth-title">
            {canUpdatePassword
              ? content.resetPasswordTitle
              : content.invalidResetLinkTitle}
          </h2>
          {!canUpdatePassword ? (
            <p className="auth-register-copy">
              {content.invalidResetLinkMessage}
            </p>
          ) : null}
        </div>

        {canUpdatePassword ? (
          <UpdatePasswordForm />
        ) : (
          <div className="auth-form">
            <Link href="/forgot-password" className="inline-link">
              {content.requestAnotherResetLink}
            </Link>
            <Link href="/sign-in" className="inline-link">
              {content.backToSignInLink}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
