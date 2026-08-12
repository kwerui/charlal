"use client";

import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';
import { resendSignupConfirmationEmail } from '@/lib/auth/client';

function getEmailActionErrorMessage(reason: string): string {
  if (reason === 'rate-limited') {
    return content.authEmailRateLimitMessage;
  }

  if (reason === 'network') {
    return content.authNetworkFailureMessage;
  }

  return content.resendConfirmationUnableMessage;
}

export default function ResendConfirmationForm() {
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage('');

    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();

    if (!email) {
      setMessageTone('error');
      setMessage(content.resendConfirmationEmailRequiredMessage);
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const result = await resendSignupConfirmationEmail(email);

    setIsSubmitting(false);

    if (!result.ok) {
      setMessageTone('error');
      setMessage(getEmailActionErrorMessage(result.reason));
      return;
    }

    form.reset();
    setMessageTone('success');
    setMessage(content.confirmationEmailResentMessage);
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="form-field" htmlFor="resend-confirmation-email">
        <span>{content.emailLabel}</span>
        <input
          id="resend-confirmation-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>

      {message ? (
        <p
          className={messageTone === 'success' ? 'form-success' : 'form-error'}
          role={messageTone === 'success' ? 'status' : 'alert'}
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        className="search-button form-submit-button"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? content.resendConfirmationSendingButton
          : content.resendConfirmationButton}
      </button>
    </form>
  );
}
