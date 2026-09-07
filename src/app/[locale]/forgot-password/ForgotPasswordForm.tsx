"use client";

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestPasswordResetEmail } from '@/lib/auth/client';
import { isValidAuthEmail } from '@/lib/auth/types';

type Props = {
  locale: string;
  initialMessage?: string;
  initialMessageTone?: 'success' | 'error';
};

function getForgotPasswordErrorMessage(
  reason: 'network' | 'unable-to-send',
  t: (key: string) => string
): string {
  if (reason === 'network') {
    return t('errors.networkFailure');
  }

  return t('forgotPassword.errors.unable');
}

export default function ForgotPasswordForm({
  locale,
  initialMessage = '',
  initialMessageTone = 'success',
}: Props) {
  const t = useTranslations('Auth');
  const [message, setMessage] = useState(initialMessage);
  const [messageTone, setMessageTone] =
    useState<'success' | 'error'>(initialMessageTone);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!window.location.hash) {
      return;
    }

    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`
    );
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();

    if (!email) {
      setMessageTone('error');
      setMessage(t('forgotPassword.errors.required'));
      return;
    }

    if (!isValidAuthEmail(email)) {
      setMessageTone('error');
      setMessage(t('errors.invalidEmail'));
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const resetResult = await requestPasswordResetEmail(email, locale);

    setIsSubmitting(false);

    if (!resetResult.ok) {
      setMessageTone('error');
      setMessage(getForgotPasswordErrorMessage(resetResult.reason, t));
      return;
    }

    setMessageTone('success');
    setMessage(t('forgotPassword.successMessage'));
    form.reset();
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field" htmlFor="forgot-password-email">
        <span>{t('fields.email')}</span>
        <input id="forgot-password-email" name="email" type="email" autoComplete="email" required />
      </label>

      {message ? (
        <p
          className={messageTone === 'success' ? 'form-success' : 'form-error'}
          role={messageTone === 'success' ? 'status' : 'alert'}
        >
          {message}
        </p>
      ) : null}

      <button type="submit" className="search-button form-submit-button" disabled={isSubmitting}>
        {isSubmitting ? t('forgotPassword.submittingButton') : t('forgotPassword.submitButton')}
      </button>
    </form>
  );
}
