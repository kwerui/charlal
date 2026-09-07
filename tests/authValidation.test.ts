import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidAuthEmail } from '../src/lib/auth/types.js';
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
