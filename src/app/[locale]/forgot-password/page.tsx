import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import ForgotPasswordForm from './ForgotPasswordForm';

type ForgotPasswordPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: ForgotPasswordPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations('Auth');
  const recoveryLinkInvalid = query.error === 'recovery';

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
        <ForgotPasswordForm
          locale={locale}
          initialMessage={
            recoveryLinkInvalid ? t('forgotPassword.recoveryLinkInvalidMessage') : ''
          }
          initialMessageTone="error"
        />
      </section>
    </main>
  );
}
