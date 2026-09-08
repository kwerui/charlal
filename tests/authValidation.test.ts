import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isValidAuthEmail } from '../src/lib/auth/types.js';
import {
  getAuthFailureSignInPath,
  getEmailConfirmationRedirectTo,
} from '../src/lib/auth/emailConfirmation.js';
import {
  getPasswordRecoveryErrorPath,
  getPasswordRecoveryRequestPath,
  getPasswordRecoveryRedirectTo,
  getPasswordResetSuccessPath,
  getPasswordResetValidationFailure,
  getPasswordUpdateFailureReason,
  isPasswordRecoveryNextPath,
} from '../src/lib/auth/passwordRecovery.js';

test('auth email validation accepts ordinary email addresses', () => {
  assert.equal(isValidAuthEmail('buyer@example.com'), true);
  assert.equal(isValidAuthEmail('  seller.name+tag@example.co  '), true);
});

test('auth email validation rejects values browser type=email would reject', () => {
  assert.equal(isValidAuthEmail(''), false);
  assert.equal(isValidAuthEmail('not-an-email'), false);
  assert.equal(isValidAuthEmail('missing-domain@'), false);
  assert.equal(isValidAuthEmail('@missing-local.test'), false);
  assert.equal(isValidAuthEmail('has whitespace@example.com'), false);
});

test('email confirmation redirect targets the localized account page', () => {
  assert.equal(
    getEmailConfirmationRedirectTo({
      nextPath: '/account',
      requestOrigin: 'http://localhost:3000',
      siteUrl: '',
      nodeEnv: 'development',
    }),
    'http://localhost:3000/auth/callback?next=%2Faccount'
  );
  assert.equal(
    getEmailConfirmationRedirectTo({
      nextPath: '/ru/account',
      requestOrigin: 'http://localhost:3000',
      siteUrl: '',
      nodeEnv: 'development',
    }),
    'http://localhost:3000/auth/callback?next=%2Fru%2Faccount'
  );
});

test('email confirmation redirect rejects unsafe next paths', () => {
  assert.equal(
    getEmailConfirmationRedirectTo({
      nextPath: 'https://attacker.example/account',
      requestOrigin: 'http://localhost:3000',
      siteUrl: '',
      nodeEnv: 'development',
    }),
    'http://localhost:3000/auth/callback?next=%2Faccount'
  );
});

test('auth confirmation failure sign-in path follows the safe next locale', () => {
  assert.equal(getAuthFailureSignInPath('/ru/account'), '/ru/sign-in');
  assert.equal(getAuthFailureSignInPath('/ru/account/messages'), '/ru/sign-in');
  assert.equal(getAuthFailureSignInPath('/account'), '/sign-in');
  assert.equal(getAuthFailureSignInPath('/'), '/sign-in');
});

test('signup keeps pending confirmation local and avoids account redirect', () => {
  const formSource = readFileSync(
    'src/app/[locale]/sign-up/SignUpForm.tsx',
    'utf8'
  );

  assert.equal(formSource.includes('setPendingConfirmationEmail(email)'), true);
  assert.equal(formSource.includes('setSuccessMessage(t(\'signUp.confirmEmailMessage\'))'), true);
  assert.equal(
    formSource.includes('router.replace(nextPath)') &&
      formSource.indexOf('setSuccessMessage(t(\'signUp.confirmEmailMessage\'))') <
        formSource.indexOf('router.replace(nextPath)'),
    true
  );
  assert.equal(formSource.includes('setPendingConfirmationEmail(password)'), false);
});

test('resend confirmation uses signup type and locale-aware redirect target', () => {
  const clientSource = readFileSync('src/lib/auth/client.tsx', 'utf8');
  const signUpFormSource = readFileSync(
    'src/app/[locale]/sign-up/SignUpForm.tsx',
    'utf8'
  );
  const signInFormSource = readFileSync(
    'src/app/[locale]/sign-in/SignInForm.tsx',
    'utf8'
  );

  assert.equal(clientSource.includes('requestEmailConfirmationResend'), true);
  assert.equal(clientSource.includes("type: 'signup'"), true);
  assert.equal(clientSource.includes('emailRedirectTo'), true);
  assert.equal(clientSource.includes('getEmailConfirmationRedirectTo'), true);
  assert.equal(signUpFormSource.includes('handleResendConfirmation'), true);
  assert.equal(signUpFormSource.includes('pendingConfirmationEmail'), true);
  assert.equal(signUpFormSource.includes("setPendingConfirmationEmail('')"), true);
  assert.equal(signInFormSource.includes('handleResendConfirmation'), true);
  assert.equal(signInFormSource.includes('unconfirmedEmail'), true);
  assert.equal(signInFormSource.includes("setUnconfirmedEmail('')"), true);
});

test('resend confirmation UI exposes only safe feedback', () => {
  const signUpFormSource = readFileSync(
    'src/app/[locale]/sign-up/SignUpForm.tsx',
    'utf8'
  );
  const signInFormSource = readFileSync(
    'src/app/[locale]/sign-in/SignInForm.tsx',
    'utf8'
  );

  for (const source of [signUpFormSource, signInFormSource]) {
    assert.equal(source.includes('confirmation.resendSuccess'), true);
    assert.equal(source.includes('confirmation.resendRateLimited'), true);
    assert.equal(source.includes('error.message'), false);
    assert.equal(source.includes('error_description'), false);
    assert.equal(source.includes('User already registered'), false);
  }
});

test('password recovery redirect targets the localized reset-password page', () => {
  assert.equal(
    getPasswordRecoveryRedirectTo({
      locale: 'tyv',
      requestOrigin: 'http://localhost:3000',
      siteUrl: '',
      nodeEnv: 'development',
    }),
    'http://localhost:3000/auth/callback?next=%2Freset-password'
  );
  assert.equal(
    getPasswordRecoveryRedirectTo({
      locale: 'ru',
      requestOrigin: 'http://localhost:3000',
      siteUrl: '',
      nodeEnv: 'development',
    }),
    'http://localhost:3000/auth/callback?next=%2Fru%2Freset-password'
  );
});

test('password recovery redirect uses configured site origin in production', () => {
  assert.equal(
    getPasswordRecoveryRedirectTo({
      locale: 'ru',
      requestOrigin: 'https://attacker.example',
      siteUrl: 'https://charlal.example/account?ignored=1',
      nodeEnv: 'production',
    }),
    'https://charlal.example/auth/callback?next=%2Fru%2Freset-password'
  );
});

test('password reset validation requires matching minimum-length passwords', () => {
  assert.equal(getPasswordResetValidationFailure('', ''), 'required');
  assert.equal(getPasswordResetValidationFailure('abcdefgh', ''), 'required');
  assert.equal(
    getPasswordResetValidationFailure('short', 'short'),
    'password-too-short'
  );
  assert.equal(
    getPasswordResetValidationFailure('abcdefgh', 'abcdefgi'),
    'password-mismatch'
  );
  assert.equal(getPasswordResetValidationFailure('abcdefgh', 'abcdefgh'), null);
});

test('password recovery helper recognizes only localized reset-password destinations', () => {
  assert.equal(isPasswordRecoveryNextPath('/reset-password'), true);
  assert.equal(isPasswordRecoveryNextPath('/ru/reset-password'), true);
  assert.equal(isPasswordRecoveryNextPath('/account'), false);
  assert.equal(isPasswordRecoveryNextPath('/ru/account'), false);
});

test('password recovery request and success paths preserve locale', () => {
  assert.equal(getPasswordRecoveryRequestPath('tyv'), '/forgot-password');
  assert.equal(getPasswordRecoveryRequestPath('ru'), '/ru/forgot-password');
  assert.equal(getPasswordRecoveryErrorPath('tyv'), '/forgot-password?error=recovery');
  assert.equal(
    getPasswordRecoveryErrorPath('ru'),
    '/ru/forgot-password?error=recovery'
  );
  assert.equal(getPasswordResetSuccessPath('tyv'), '/account');
  assert.equal(getPasswordResetSuccessPath('ru'), '/ru/account');
});

test('password update failures map stable same_password code safely', () => {
  assert.equal(
    getPasswordUpdateFailureReason(
      { code: 'same_password', message: 'ignored' },
      'unable-to-update'
    ),
    'same-password'
  );
  assert.equal(
    getPasswordUpdateFailureReason({ code: 'unexpected_failure' }, 'network'),
    'network'
  );
  assert.equal(
    getPasswordUpdateFailureReason(new Error('same password'), 'unable-to-update'),
    'unable-to-update'
  );
});
