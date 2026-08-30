import { Link } from '@/i18n/navigation';
import { content } from '@/content/tyv';
import { localizePath } from '@/i18n/localePath';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import SignUpForm from './SignUpForm';

type SignUpPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SignUpPage({ params, searchParams }: SignUpPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const nextPath = getSafeNextPath(query.next, localizePath('/account', locale));

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
