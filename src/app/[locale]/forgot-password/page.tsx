import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import ForgotPasswordForm from './ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('Auth');

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="forgot-password-title">
        <div className="auth-card-copy">
          <h2 id="forgot-password-title" className="auth-title">
            {t('forgotPassword.title')}
          </h2>
          <p className="auth-register-copy">
            <Link href="/sign-in" className="inline-link">
              {t('forgotPassword.backToSignInLink')}
            </Link>
          </p>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
