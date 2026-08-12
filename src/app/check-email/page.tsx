import Link from 'next/link';
import { content } from '@/content/tyv';
import ResendConfirmationForm from './ResendConfirmationForm';

type CheckEmailPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getCheckEmailType(value: string | string[] | undefined): 'signup' | 'recovery' {
  const type = Array.isArray(value) ? value[0] : value;

  return type === 'recovery' ? 'recovery' : 'signup';
}

export default async function CheckEmailPage({ searchParams }: CheckEmailPageProps) {
  const query = await searchParams;
  const type = getCheckEmailType(query.type);
  const isRecovery = type === 'recovery';

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="check-email-title">
        <div className="auth-card-copy">
          <p className="hero-kicker">{content.checkEmailKicker}</p>
          <h2 id="check-email-title" className="auth-title">
            {content.checkYourEmailTitle}
          </h2>
          <p className="auth-register-copy">
            {isRecovery
              ? content.passwordResetEmailSentMessage
              : content.confirmationEmailSentMessage}
          </p>
        </div>

        {isRecovery ? (
          <div className="auth-form">
            <Link href="/forgot-password" className="inline-link">
              {content.requestAnotherResetLink}
            </Link>
            <Link href="/sign-in" className="inline-link">
              {content.backToSignInLink}
            </Link>
          </div>
        ) : (
          <>
            <ResendConfirmationForm />
            <Link href="/sign-in" className="inline-link">
              {content.backToSignInLink}
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
