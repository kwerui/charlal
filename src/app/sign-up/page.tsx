import Link from 'next/link';
import { content } from '@/content/tyv';
import SignUpForm from './SignUpForm';

type SignUpPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getSafeNextPath(nextValue: string | string[] | undefined) {
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;

  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/';
  }

  return nextPath;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const query = await searchParams;
  const nextPath = getSafeNextPath(query.next);

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-up-title">
        <div className="auth-card-copy">
          <p className="hero-kicker">{content.signUpKicker}</p>
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
