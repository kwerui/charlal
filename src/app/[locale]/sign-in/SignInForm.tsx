"use client";

import { Link } from '@/i18n/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';
import { signInWithEmailPassword, useAuthStatus } from '@/lib/auth/client';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';

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

function getSignInErrorMessage(reason: string): string {
  if (reason === 'invalid-credentials') {
    return content.signInInvalidCredentialsMessage;
  }

  if (reason === 'email-not-confirmed') {
    return content.signInUnconfirmedEmailMessage;
  }

  if (reason === 'rate-limited') {
    return content.signInRateLimitMessage;
  }

  if (reason === 'network') {
    return content.authNetworkFailureMessage;
  }

  return content.unableSignInMessage;
}

export default function SignInForm({
  nextPath,
  initialMessage = '',
  initialMessageTone = 'success',
}: Props) {
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
      setFormMessage(content.signInErrorRequired);
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
      setFormMessage(getSignInErrorMessage(signInResult.reason));
      return;
    }

    await refreshAuth();

    window.location.replace(
      getAuthenticatedRedirectPath(getSafeNextPath(nextPath, '/account'))
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="form-field" htmlFor="email">
        <span>{content.emailLabel}</span>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </label>

      <label className="form-field" htmlFor="password">
        <span>{content.passwordLabel}</span>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </label>

      <div className="auth-options-row">
        <Link href="/forgot-password" className="inline-link">
          {content.forgotPasswordLink}
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
        {content.signInButton}
      </button>
    </form>
  );
}
