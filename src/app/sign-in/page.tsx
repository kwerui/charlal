import Link from 'next/link';
import { content } from '@/content/tyv';
import SignInForm from './SignInForm';

type SignInPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getSafeNextPath(nextValue: string | string[] | undefined) {
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;

  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/';
  }

  return nextPath;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const query = await searchParams;
  const nextPath = getSafeNextPath(query.next);

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
        <SignInForm nextPath={nextPath} />
      </section>
    </main>
  );
}
