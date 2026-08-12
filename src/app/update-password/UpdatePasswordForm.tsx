"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';
import { updateCurrentUserPassword, useAuthStatus } from '@/lib/auth/client';
import { MINIMUM_PASSWORD_LENGTH } from '@/lib/auth/types';

function getUpdatePasswordErrorMessage(reason: string): string {
  if (reason === 'rate-limited') {
    return content.authEmailRateLimitMessage;
  }

  if (reason === 'network') {
    return content.authNetworkFailureMessage;
  }

  return content.updatePasswordUnableMessage;
}

export default function UpdatePasswordForm() {
  const router = useRouter();
  const { refreshAuth } = useAuthStatus();
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') || '');
    const passwordConfirmation = String(formData.get('passwordConfirmation') || '');

    if (!password || !passwordConfirmation) {
      setErrorMessage(content.updatePasswordRequiredMessage);
      return;
    }

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setErrorMessage(content.signUpPasswordTooShortMessage);
      return;
    }

    if (password !== passwordConfirmation) {
      setErrorMessage(content.signUpPasswordMismatchMessage);
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const result = await updateCurrentUserPassword(password);

    if (!result.ok) {
      setIsSubmitting(false);
      setErrorMessage(getUpdatePasswordErrorMessage(result.reason));
      return;
    }

    await fetch('/update-password/session', { method: 'DELETE' });
    await refreshAuth();
    setIsSubmitting(false);
    setSuccessMessage(content.passwordUpdatedMessage);
    event.currentTarget.reset();
  }

  if (successMessage) {
    return (
      <div className="auth-form">
        <p className="form-success" role="status">
          {successMessage}
        </p>
        <button
          type="button"
          className="search-button form-submit-button"
          onClick={() => router.replace('/account')}
        >
          {content.goToAccountButton}
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="form-field" htmlFor="new-password">
        <span>{content.newPasswordLabel}</span>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>

      <label className="form-field" htmlFor="new-password-confirmation">
        <span>{content.confirmNewPasswordLabel}</span>
        <input
          id="new-password-confirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
        />
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
          ? content.updatePasswordSubmittingButton
          : content.updatePasswordButton}
      </button>

      <Link href="/sign-in" className="inline-link">
        {content.backToSignInLink}
      </Link>
    </form>
  );
}
