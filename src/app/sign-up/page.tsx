import Link from 'next/link';
import { content } from '@/content/tyv';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import SignUpForm from './SignUpForm';

type SignUpPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const query = await searchParams;
  const nextPath = getSafeNextPath(query.next);

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-up-title">
        <div className="auth-card-copy">
          <h2 id="sign-up-title" className="auth-title">
            {content.signUpTitle}
          </h2>
          <p className="auth-register-copy">
            {content.signUpSignInPrompt}{' '}
            <Link href={`/sign-in?next=${encodeURIComponent(nextPath)}`} className="inline-link">
              {content.signUpSignInLink}
            </Link>
          </p>
        </div>
        <SignUpForm nextPath={nextPath} />
      </section>
    </main>
  );
}
