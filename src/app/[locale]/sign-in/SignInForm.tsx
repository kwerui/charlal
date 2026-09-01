"use client";

import { Link } from '@/i18n/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { signInWithEmailPassword, useAuthStatus } from '@/lib/auth/client';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';
import { isValidAuthEmail } from '@/lib/auth/types';

type Props = {
  nextPath: string;
  initialMessage?: string;
  initialMessageTone?: 'success' | 'error';
};

function getAuthenticatedRedirectPath(nextPath: string): string {
  if (
    nextPath === '/sign-in' ||
    nextPath.startsWith('/sign-in?') ||
    nextPath === '/sign-up' ||
    nextPath.startsWith('/sign-up?') ||
    nextPath === '/ru/sign-in' ||
    nextPath.startsWith('/ru/sign-in?') ||
    nextPath === '/ru/sign-up' ||
    nextPath.startsWith('/ru/sign-up?')
  ) {
    if (nextPath === '/ru/sign-in' || nextPath.startsWith('/ru/sign-in?')) {
      return '/ru/account';
    }

    if (nextPath === '/ru/sign-up' || nextPath.startsWith('/ru/sign-up?')) {
      return '/ru/account';
    }

    return '/account';
  }

  return nextPath;
}

function getSignInErrorMessage(reason: string, t: (key: string) => string): string {
  if (reason === 'invalid-credentials') {
    return t('signIn.errors.invalidCredentials');
  }

  if (reason === 'email-not-confirmed') {
    return t('signIn.errors.unconfirmedEmail');
  }

  if (reason === 'rate-limited') {
    return t('errors.rateLimited');
  }

  if (reason === 'network') {
    return t('errors.networkFailure');
  }

  return t('signIn.errors.unable');
}

export default function SignInForm({
  nextPath,
  initialMessage = '',
  initialMessageTone = 'success',
}: Props) {
  const t = useTranslations('Auth');
  const { refreshAuth } = useAuthStatus();
  const [formMessage, setFormMessage] = useState(initialMessage);
  const [messageTone, setMessageTone] = useState<'success' | 'error'>(
    initialMessageTone
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage('');

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    if (!email || !password) {
      setMessageTone('error');
      setFormMessage(t('signIn.errors.required'));
      return;
    }

    if (!isValidAuthEmail(email)) {
      setMessageTone('error');
      setFormMessage(t('errors.invalidEmail'));
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const signInResult = await signInWithEmailPassword(email, password);

    if (!signInResult.ok) {
      setIsSubmitting(false);
      setMessageTone('error');
      setFormMessage(getSignInErrorMessage(signInResult.reason, t));
      return;
    }

    await refreshAuth();

    window.location.replace(
      getAuthenticatedRedirectPath(getSafeNextPath(nextPath, '/account'))
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field" htmlFor="email">
        <span>{t('fields.email')}</span>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </label>

      <label className="form-field" htmlFor="password">
        <span>{t('fields.password')}</span>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </label>

      <div className="auth-options-row">
        <Link href="/forgot-password" className="inline-link">
          {t('signIn.forgotPasswordLink')}
        </Link>
      </div>

      {formMessage ? (
        <p
          className={messageTone === 'success' ? 'form-success' : 'form-error'}
          role={messageTone === 'success' ? 'status' : 'alert'}
        >
          {formMessage}
        </p>
      ) : null}

      <button type="submit" className="search-button form-submit-button" disabled={isSubmitting}>
        {isSubmitting ? t('signIn.submittingButton') : t('signIn.button')}
      </button>
    </form>
  );
}
