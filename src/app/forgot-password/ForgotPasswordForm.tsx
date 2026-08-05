"use client";

import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';

export default function ForgotPasswordForm() {
  const [message, setMessage] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(content.forgotPasswordSuccessMessage);
    event.currentTarget.reset();
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="demo-auth-warning">{content.forgotPasswordDemoWarning}</p>

      <label className="form-field" htmlFor="forgot-password-email">
        <span>{content.emailLabel}</span>
        <input id="forgot-password-email" name="email" type="email" autoComplete="email" required />
      </label>

      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      <button type="submit" className="search-button form-submit-button">
        {content.forgotPasswordSubmitButton}
      </button>
    </form>
  );
}
