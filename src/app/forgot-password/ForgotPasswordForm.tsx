"use client";

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { content } from '@/content/tyv';
import { requestPasswordResetEmail } from '@/lib/auth/client';

function getForgotPasswordErrorMessage(reason: string): string {
  if (reason === 'rate-limited') {
    return content.authEmailRateLimitMessage;
  }

  if (reason === 'network') {
    return content.authNetworkFailureMessage;
  }

  return content.passwordResetRequestUnableMessage;
}

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();

    if (!email) {
      setErrorMessage(content.forgotPasswordEmailRequiredMessage);
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const result = await requestPasswordResetEmail(email);

    if (!result.ok) {
      setIsSubmitting(false);
      setErrorMessage(getForgotPasswordErrorMessage(result.reason));
      return;
    }

    router.replace('/check-email?type=recovery');
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="form-field" htmlFor="forgot-password-email">
        <span>{content.emailLabel}</span>
        <input id="forgot-password-email" name="email" type="email" autoComplete="email" required />
      </label>

      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        className="search-button form-submit-button"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? content.forgotPasswordSubmittingButton
          : content.forgotPasswordSubmitButton}
      </button>
    </form>
  );
}
