import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localizePath } from '@/i18n/localePath';
import { PASSWORD_RECOVERY_STATE_COOKIE } from '@/lib/auth/passwordRecovery';
import { getCurrentViewerId } from '@/lib/auth/server';
import ResetPasswordForm from './ResetPasswordForm';

type ResetPasswordPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ResetPasswordPage({
  params,
}: ResetPasswordPageProps) {
  const { locale } = await params;
  const authResult = await getCurrentViewerId();
  const cookieStore = await cookies();
  const hasRecoveryState =
    cookieStore.get(PASSWORD_RECOVERY_STATE_COOKIE)?.value === '1';
  const t = await getTranslations('Auth');

  if (authResult.status !== 'signed-in' || !hasRecoveryState) {
    redirect(localizePath('/forgot-password', locale));
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-password-title">
        <div className="auth-card-copy">
          <h2 id="reset-password-title" className="auth-title">
            {t('resetPassword.title')}
          </h2>
          <p className="auth-register-copy">
            {t('resetPassword.instructions')}
          </p>
        </div>
        <ResetPasswordForm locale={locale} />
      </section>
    </main>
  );
}
