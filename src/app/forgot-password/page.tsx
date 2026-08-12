import Link from 'next/link';
import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { getCurrentUserResult } from '@/lib/auth/server';
import ForgotPasswordForm from './ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'authenticated') {
    redirect('/account');
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="forgot-password-title">
        <div className="auth-card-copy">
          <p className="hero-kicker">{content.forgotPasswordKicker}</p>
          <h2 id="forgot-password-title" className="auth-title">
            {content.forgotPasswordTitle}
          </h2>
          <p className="auth-register-copy">
            <Link href="/sign-in" className="inline-link">
              {content.backToSignInLink}
            </Link>
          </p>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
