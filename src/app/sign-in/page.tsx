import Link from 'next/link';
import { content } from '@/content/tyv';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import SignInForm from './SignInForm';

type SignInPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const query = await searchParams;
  const nextPath = getSafeNextPath(query.next);
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
