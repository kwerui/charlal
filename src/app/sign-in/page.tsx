import Link from 'next/link';
import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import { getCurrentUserResult } from '@/lib/auth/server';
import SignInForm from './SignInForm';

type SignInPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getAuthenticatedRedirectPath(nextPath: string): string {
  if (
    nextPath === '/sign-in' ||
    nextPath.startsWith('/sign-in?') ||
    nextPath === '/sign-up' ||
    nextPath.startsWith('/sign-up?')
  ) {
    return '/account';
  }

  return nextPath;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const query = await searchParams;
  const nextPath = getSafeNextPath(query.next, '/account');
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'authenticated') {
    redirect(getAuthenticatedRedirectPath(nextPath));
  }

  const confirmationFailed = query.error === 'confirmation';
  const emailConfirmed = query.confirmed === '1';

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div className="auth-card-copy">
          <p className="hero-kicker">{content.signInKicker}</p>
          <h2 id="sign-in-title" className="auth-title">
            {content.signInTitle}
          </h2>
          <p className="auth-register-copy">
            {content.signInRegisterPrompt}{' '}
            <Link href={`/sign-up?next=${encodeURIComponent(nextPath)}`} className="inline-link">
              {content.signInRegisterLink}
            </Link>
          </p>
        </div>
        <SignInForm
          nextPath={nextPath}
          initialMessage={
            emailConfirmed
              ? content.emailConfirmedMessage
              : confirmationFailed
              ? content.confirmationInvalidMessage
              : ''
          }
          initialMessageTone={emailConfirmed ? 'success' : 'error'}
        />
      </section>
    </main>
  );
}
