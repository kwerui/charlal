"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';
import {
  signUpWithEmailPassword,
  useAuthStatus,
} from '@/lib/auth/client';
import {
  MINIMUM_PASSWORD_LENGTH,
  isValidProfileDisplayName,
  sanitizeProfileDisplayName,
} from '@/lib/auth/types';

type Props = {
  nextPath: string;
};

function getSignUpErrorMessage(reason: string): string {
  if (reason === 'rate-limited') {
    return content.signInRateLimitMessage;
  }

  if (reason === 'network') {
    return content.authNetworkFailureMessage;
  }

  return content.unableCreateAccountMessage;
}

export default function SignUpForm({ nextPath }: Props) {
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
    const displayName = sanitizeProfileDisplayName(
      String(formData.get('displayName') || '')
    );
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const passwordConfirmation = String(formData.get('passwordConfirmation') || '');
    const agreedToPolicy = formData.get('policy') === 'on';

    if (!displayName || !email || !password || !passwordConfirmation) {
      setErrorMessage(content.signUpErrorRequired);
      return;
    }

    if (!isValidProfileDisplayName(displayName)) {
      setErrorMessage(content.displayNameInvalidMessage);
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

    if (!agreedToPolicy) {
      setErrorMessage(content.signUpErrorPolicy);
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const signUpResult = await signUpWithEmailPassword({
      displayName,
      email,
      password,
      nextPath,
    });

    if (!signUpResult.ok) {
      setIsSubmitting(false);
      setErrorMessage(getSignUpErrorMessage(signUpResult.reason));
      return;
    }

    if (signUpResult.requiresEmailConfirmation) {
      setIsSubmitting(false);
      setSuccessMessage(content.confirmYourEmailMessage);
      return;
    }

    await refreshAuth();
    router.refresh();
    router.replace(nextPath);
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="form-field" htmlFor="display-name">
        <span>{content.displayNameLabel}</span>
        <input id="display-name" name="displayName" type="text" autoComplete="name" required />
      </label>

      <label className="form-field" htmlFor="sign-up-email">
        <span>{content.emailLabel}</span>
        <input id="sign-up-email" name="email" type="email" autoComplete="email" required />
      </label>

      <label className="form-field" htmlFor="sign-up-password">
        <span>{content.passwordLabel}</span>
        <input id="sign-up-password" name="password" type="password" autoComplete="new-password" required />
      </label>

      <label className="form-field" htmlFor="sign-up-password-confirmation">
        <span>{content.passwordConfirmationLabel}</span>
        <input
          id="sign-up-password-confirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>

      <div className="checkbox-field policy-checkbox">
        <input id="policy-agreement" type="checkbox" name="policy" required />
        <label htmlFor="policy-agreement">
          {content.policyAgreementPrefix}{' '}
          <Link href="/terms" className="inline-link">
            {content.termsPageTitle}
          </Link>{' '}
          {content.policyAgreementMiddle}{' '}
          <Link href="/privacy" className="inline-link">
            {content.privacyPageTitle}
          </Link>
          {content.policyAgreementSuffix}
        </label>
      </div>

      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <div className="form-success" role="status">
          <strong>{content.checkYourEmailTitle}</strong>
          <p>{successMessage}</p>
        </div>
      ) : null}

      <button type="submit" className="search-button form-submit-button" disabled={isSubmitting}>
        {content.signUpButton}
      </button>
    </form>
  );
}
