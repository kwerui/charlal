import { Link } from '@/i18n/navigation';
import { content } from '@/content/tyv';
import ForgotPasswordForm from './ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="forgot-password-title">
        <div className="auth-card-copy">
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
