"use client";

import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  signUpWithEmailPassword,
  useAuthStatus,
} from '@/lib/auth/client';
import {
  MINIMUM_PASSWORD_LENGTH,
  isValidAuthEmail,
  isValidProfileDisplayName,
  sanitizeProfileDisplayName,
} from '@/lib/auth/types';

type Props = {
  nextPath: string;
};

function getSignUpErrorMessage(reason: string, t: (key: string) => string): string {
  if (reason === 'rate-limited') {
    return t('errors.rateLimited');
  }

  if (reason === 'network') {
    return t('errors.networkFailure');
  }

  return t('signUp.errors.unable');
}

export default function SignUpForm({ nextPath }: Props) {
  const t = useTranslations('Auth');
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
      setErrorMessage(t('signUp.errors.required'));
      return;
    }

    if (!isValidProfileDisplayName(displayName)) {
      setErrorMessage(t('signUp.errors.displayNameInvalid'));
      return;
    }

    if (!isValidAuthEmail(email)) {
      setErrorMessage(t('errors.invalidEmail'));
      return;
    }

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setErrorMessage(t('signUp.errors.passwordTooShort'));
      return;
    }

    if (password !== passwordConfirmation) {
      setErrorMessage(t('signUp.errors.passwordMismatch'));
      return;
    }

    if (!agreedToPolicy) {
      setErrorMessage(t('signUp.errors.policyRequired'));
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
      setErrorMessage(getSignUpErrorMessage(signUpResult.reason, t));
      return;
    }

    if (signUpResult.requiresEmailConfirmation) {
      setIsSubmitting(false);
      setSuccessMessage(t('signUp.confirmEmailMessage'));
      return;
    }

    await refreshAuth();
    router.refresh();
    router.replace(nextPath);
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field" htmlFor="display-name">
        <span>{t('fields.displayName')}</span>
        <input id="display-name" name="displayName" type="text" autoComplete="name" required />
      </label>

      <label className="form-field" htmlFor="sign-up-email">
        <span>{t('fields.email')}</span>
        <input id="sign-up-email" name="email" type="email" autoComplete="email" required />
      </label>

      <label className="form-field" htmlFor="sign-up-password">
        <span>{t('fields.password')}</span>
        <input id="sign-up-password" name="password" type="password" autoComplete="new-password" required />
      </label>

      <label className="form-field" htmlFor="sign-up-password-confirmation">
        <span>{t('fields.passwordConfirmation')}</span>
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
          {t('signUp.policy.prefix')}{' '}
          <Link href="/terms" className="inline-link">
            {t('signUp.policy.termsLink')}
          </Link>{' '}
          {t('signUp.policy.middle')}{' '}
          <Link href="/privacy" className="inline-link">
            {t('signUp.policy.privacyLink')}
          </Link>
          {t('signUp.policy.suffix')}
        </label>
      </div>

      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <div className="form-success" role="status">
          <strong>{t('signUp.checkEmailTitle')}</strong>
          <p>{successMessage}</p>
        </div>
      ) : null}

      <button type="submit" className="search-button form-submit-button" disabled={isSubmitting}>
        {isSubmitting ? t('signUp.submittingButton') : t('signUp.button')}
      </button>
    </form>
  );
}
