"use client";

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  updateCurrentUserPassword,
  useAuthStatus,
} from '@/lib/auth/client';
import {
  getPasswordRecoveryRequestPath,
  getPasswordResetSuccessPath,
  getPasswordResetValidationFailure,
} from '@/lib/auth/passwordRecovery';

type Props = {
  locale: string;
};

function getResetPasswordErrorMessage(
  reason: 'same-password' | 'network' | 'unable-to-update',
  t: (key: string) => string
): string {
  if (reason === 'same-password') {
    return t('resetPassword.errors.same-password');
  }

  if (reason === 'network') {
    return t('errors.networkFailure');
  }

  return t('resetPassword.errors.unable');
}

async function clearPasswordRecoveryState(): Promise<void> {
  await fetch('/auth/recovery/complete', {
    method: 'POST',
    credentials: 'same-origin',
  });
}

export default function ResetPasswordForm({ locale }: Props) {
  const t = useTranslations('Auth');
  const { refreshAuth } = useAuthStatus();
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') || '');
    const passwordConfirmation = String(
      formData.get('passwordConfirmation') || ''
    );
    const validationFailure = getPasswordResetValidationFailure(
      password,
      passwordConfirmation
    );

    if (validationFailure) {
      setErrorMessage(t(`resetPassword.errors.${validationFailure}`));
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const updateResult = await updateCurrentUserPassword(password);

    if (!updateResult.ok) {
      setIsSubmitting(false);
      setErrorMessage(getResetPasswordErrorMessage(updateResult.reason, t));
      return;
    }

    await clearPasswordRecoveryState();
    await refreshAuth();
    window.location.replace(getPasswordResetSuccessPath(locale));
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field" htmlFor="new-password">
        <span>{t('resetPassword.fields.newPassword')}</span>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>

      <label className="form-field" htmlFor="new-password-confirmation">
        <span>{t('fields.passwordConfirmation')}</span>
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

      <div className="auth-options-row">
        <Link href={getPasswordRecoveryRequestPath(locale)} className="inline-link">
          {t('resetPassword.requestNewLink')}
        </Link>
      </div>

      <button type="submit" className="search-button form-submit-button" disabled={isSubmitting}>
        {isSubmitting ? t('resetPassword.submittingButton') : t('resetPassword.button')}
      </button>
    </form>
  );
}
