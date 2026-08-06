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

export default function SignUpForm({ nextPath }: Props) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('username') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const agreedToPolicy = formData.get('policy') === 'on';

    if (!username || !email || !password) {
      setErrorMessage(content.signUpErrorRequired);
      return;
    }

    if (!agreedToPolicy) {
      setErrorMessage(content.signUpErrorPolicy);
      return;
    }

    // DEMO ONLY: this does not create a real account. The password is never stored.
    // This is not secure and must be replaced before production use.
    demoSignIn(email, username);
    router.replace(nextPath);
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="demo-auth-warning">{content.demoAuthWarning}</p>

      <label className="form-field" htmlFor="username">
        <span>{content.usernameLabel}</span>
        <input id="username" name="username" type="text" autoComplete="username" required />
      </label>

      <label className="form-field" htmlFor="sign-up-email">
        <span>{content.emailLabel}</span>
        <input id="sign-up-email" name="email" type="email" autoComplete="email" required />
      </label>

      <label className="form-field" htmlFor="sign-up-password">
        <span>{content.passwordLabel}</span>
        <input id="sign-up-password" name="password" type="password" autoComplete="new-password" required />
      </label>

      <label className="checkbox-field policy-checkbox">
        <input type="checkbox" name="policy" required />
        <span>{content.policyAgreementLabel}</span>
      </label>

      <Link href="/forgot-password" className="inline-link">
        {content.forgotPasswordLink}
      </Link>

      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button type="submit" className="search-button form-submit-button">
        {content.signUpButton}
      </button>
    </form>
  );
}
