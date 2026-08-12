"use client";

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';
import { signInWithEmailPassword } from '@/lib/auth/client';

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
    nextPath.startsWith('/sign-up?')
  ) {
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
  const [formMessage, setFormMessage] = useState(initialMessage);
  const [messageTone, setMessageTone] = useState<'success' | 'error'>(
    initialMessageTone
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResendConfirmationLink, setShowResendConfirmationLink] =
    useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage('');
    setShowResendConfirmationLink(false);

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
      setShowResendConfirmationLink(signInResult.reason === 'email-not-confirmed');
      return;
    }

    window.location.replace(getAuthenticatedRedirectPath(nextPath));
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
        <div
          className={messageTone === 'success' ? 'form-success' : 'form-error'}
          role={messageTone === 'success' ? 'status' : 'alert'}
        >
          <p>{formMessage}</p>
          {showResendConfirmationLink ? (
            <Link href="/check-email?type=signup" className="inline-link">
              {content.resendConfirmationButton}
            </Link>
          ) : null}
        </div>
      ) : null}

      <button type="submit" className="search-button form-submit-button" disabled={isSubmitting}>
        {content.signInButton}
      </button>
    </form>
  );
}
