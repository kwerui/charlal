import { localizePath } from '../../i18n/localePath';
import { getAuthCallbackRedirectOrigin } from './callbackOrigin';
import { getSafeNextPath } from './safeNextPath';

type EmailConfirmationRedirectInput = {
  nextPath: string;
  requestOrigin: string;
  siteUrl?: string | null;
  nodeEnv?: string;
};

export type EmailConfirmationFailureReason =
  | 'rate-limited'
  | 'network'
  | 'unable-to-send';

export function getLocaleFromSafeAuthPath(nextPath: string): string {
  return nextPath === '/ru' || nextPath.startsWith('/ru/') ? 'ru' : 'tyv';
}

export function getAuthFailureSignInPath(nextPath: string): string {
  return localizePath('/sign-in', getLocaleFromSafeAuthPath(nextPath));
}

export function getEmailConfirmationRedirectTo({
  nextPath,
  requestOrigin,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv = process.env.NODE_ENV,
}: EmailConfirmationRedirectInput): string {
  const origin = getAuthCallbackRedirectOrigin({
    nodeEnv,
    requestOrigin,
    siteUrl,
  });
  const callbackUrl = new URL('/auth/callback', origin);

  callbackUrl.searchParams.set('next', getSafeNextPath(nextPath, '/account'));

  return callbackUrl.toString();
}
