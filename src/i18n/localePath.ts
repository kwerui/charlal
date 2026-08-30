import { routing } from './routing';
import { getSafeNextPath } from '../lib/auth/safeNextPath';

const returnPathQueryKeys = ['from', 'next'] as const;

export function removeKnownLocalePrefix(path: string): string {
  for (const knownLocale of routing.locales) {
    if (path === `/${knownLocale}`) {
      return '/';
    }

    if (path.startsWith(`/${knownLocale}/`)) {
      return path.slice(knownLocale.length + 1) || '/';
    }
  }

  return path;
}

export function localizePath(path: string, locale: string): string {
  if (
    routing.locales.some(
      (knownLocale) =>
        path === `/${knownLocale}` ||
        path.startsWith(`/${knownLocale}/`)
    )
  ) {
    return path;
  }

  if (locale === routing.defaultLocale) {
    return path;
  }

  if (path === '/') {
    return `/${locale}`;
  }

  return `/${locale}${path}`;
}

export function localizeSafeInternalPath(path: string, locale: string): string {
  const safePath = getSafeNextPath(path, '');

  if (!safePath) {
    return path;
  }

  return localizePath(removeKnownLocalePrefix(safePath), locale);
}

export function localizeReturnPathQuery(queryString: string, locale: string): string {
  if (!queryString) {
    return '';
  }

  const params = new URLSearchParams(queryString);
  const localizedParams = new URLSearchParams();

  for (const [key, value] of params) {
    localizedParams.append(
      key,
      returnPathQueryKeys.includes(key as (typeof returnPathQueryKeys)[number])
        ? localizeSafeInternalPath(value, locale)
        : value
    );
  }

  return localizedParams.toString();
}
