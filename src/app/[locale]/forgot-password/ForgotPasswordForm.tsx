"use client";

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { isValidAuthEmail } from '@/lib/auth/types';

export default function ForgotPasswordForm() {
  const t = useTranslations('Auth');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const formData = new FormData(event.currentTarget);
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

    setIsSubmitting(true);
    setMessageTone('success');
    setMessage(t('forgotPassword.successMessage'));
    event.currentTarget.reset();
    setIsSubmitting(false);
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <p className="demo-auth-warning">{t('forgotPassword.demoWarning')}</p>

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
