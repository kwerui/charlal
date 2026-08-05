"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';
import { demoSignIn } from '@/lib/demoAuth';

type Props = {
  nextPath: string;
};

export default function SignInForm({ nextPath }: Props) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    if (!email || !password) {
      setErrorMessage(content.signInErrorRequired);
      return;
    }

    // DEMO ONLY: accepts any non-empty email and password. The password is never stored.
    // This is not secure and must be replaced before production use.
    demoSignIn(email);
    router.replace(nextPath);
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="demo-auth-warning">{content.demoAuthWarning}</p>

      <label className="form-field" htmlFor="email">
        <span>{content.emailLabel}</span>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </label>

      <label className="form-field" htmlFor="password">
        <span>{content.passwordLabel}</span>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </label>

      <div className="auth-options-row">
        <label className="checkbox-field">
          <input type="checkbox" name="remember" />
          <span>{content.rememberMeLabel}</span>
        </label>
        <Link href="/forgot-password" className="inline-link">
          {content.forgotPasswordLink}
        </Link>
      </div>

      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button type="submit" className="search-button form-submit-button">
        {content.signInButton}
      </button>
    </form>
  );
}
