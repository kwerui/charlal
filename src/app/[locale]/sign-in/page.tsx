import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localizePath } from '@/i18n/localePath';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import { getCurrentUserResult } from '@/lib/auth/server';
import SignInForm from './SignInForm';

type SignInPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getAuthenticatedRedirectPath(nextPath: string): string {
  if (
    nextPath === '/sign-in' ||
    nextPath.startsWith('/sign-in?') ||
    nextPath === '/sign-up' ||
    nextPath.startsWith('/sign-up?') ||
    nextPath === '/ru/sign-in' ||
    nextPath.startsWith('/ru/sign-in?') ||
    nextPath === '/ru/sign-up' ||
    nextPath.startsWith('/ru/sign-up?')
  ) {
    return '/account';
  }

  return nextPath;
}

export default async function SignInPage({ params, searchParams }: SignInPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const fallbackNextPath = localizePath('/account', locale);
  const nextPath = getSafeNextPath(query.next, fallbackNextPath);
  const authResult = await getCurrentUserResult();
  const t = await getTranslations('Auth');

  if (authResult.status === 'authenticated') {
    redirect(localizePath(getAuthenticatedRedirectPath(nextPath), locale));
  }

  const confirmationFailed = query.error === 'confirmation';
  const emailConfirmed = query.confirmed === '1';

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div className="auth-card-copy">
          <h2 id="sign-in-title" className="auth-title">
            {t('signIn.title')}
          </h2>
          <p className="auth-register-copy">
            {t('signIn.registerPrompt')}{' '}
            <Link href={`/sign-up?next=${encodeURIComponent(nextPath)}`} className="inline-link">
              {t('signIn.registerLink')}
            </Link>
          </p>
        </div>
        <SignInForm
          nextPath={nextPath}
          initialMessage={
            emailConfirmed
              ? t('signIn.emailConfirmedMessage')
              : confirmationFailed
              ? t('signIn.confirmationInvalidMessage')
              : ''
          }
          initialMessageTone={emailConfirmed ? 'success' : 'error'}
        />
      </section>
    </main>
  );
}
