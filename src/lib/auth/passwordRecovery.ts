import { localizePath, removeKnownLocalePrefix } from '../../i18n/localePath';
import { getAuthCallbackRedirectOrigin } from './callbackOrigin';
import { MINIMUM_PASSWORD_LENGTH } from './types';

export const PASSWORD_RECOVERY_STATE_COOKIE = 'charlal-password-recovery';
export const PASSWORD_RECOVERY_STATE_MAX_AGE_SECONDS = 10 * 60;

type PasswordRecoveryRedirectInput = {
  locale: string;
  requestOrigin: string;
  siteUrl?: string | null;
  nodeEnv?: string;
};

export type PasswordResetValidationFailure =
  | 'required'
  | 'password-too-short'
  | 'password-mismatch';

export type PasswordUpdateFailureReason =
  | 'same-password'
  | 'network'
  | 'unable-to-update';

function getStableAuthErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const authError = error as { code?: unknown };

  return typeof authError.code === 'string'
    ? authError.code.toLocaleLowerCase()
    : '';
}

export function getPasswordRecoveryNextPath(locale: string): string {
  return localizePath('/reset-password', locale);
}

export function getPasswordRecoveryRequestPath(locale: string): string {
  return localizePath('/forgot-password', locale);
}

export function getPasswordRecoveryErrorPath(locale: string): string {
  return `${getPasswordRecoveryRequestPath(locale)}?error=recovery`;
}

export function getPasswordResetSuccessPath(locale: string): string {
  return localizePath('/account', locale);
}

export function isPasswordRecoveryNextPath(nextPath: string): boolean {
  return removeKnownLocalePrefix(nextPath) === '/reset-password';
}

export function getPasswordRecoveryRedirectTo({
  locale,
  requestOrigin,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv = process.env.NODE_ENV,
}: PasswordRecoveryRedirectInput): string {
  const origin = getAuthCallbackRedirectOrigin({
    nodeEnv,
    requestOrigin,
    siteUrl,
  });
  const callbackUrl = new URL('/auth/callback', origin);

  callbackUrl.searchParams.set('next', getPasswordRecoveryNextPath(locale));

  return callbackUrl.toString();
}

export function getPasswordResetValidationFailure(
  password: string,
  passwordConfirmation: string
): PasswordResetValidationFailure | null {
  if (!password || !passwordConfirmation) {
    return 'required';
  }

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return 'password-too-short';
  }

  if (password !== passwordConfirmation) {
    return 'password-mismatch';
  }

  return null;
}

export function getPasswordUpdateFailureReason(
  error: unknown,
  fallbackReason: 'network' | 'unable-to-update'
): PasswordUpdateFailureReason {
  if (getStableAuthErrorCode(error) === 'same_password') {
    return 'same-password';
  }

  return fallbackReason;
}
