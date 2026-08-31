'use client';

import {
  localizePath,
  localizeSafeInternalPath,
  localizeReturnPathQuery,
  removeKnownLocalePrefix,
} from './localePath';
import { routing } from './routing';
import { getSafeNextPath } from '../lib/auth/safeNextPath';

const LOCALE_HISTORY_NORMALIZATION_KEY = 'charlal-locale-history-normalization';
const PREFERRED_HISTORY_LOCALE_KEY = 'charlal-preferred-history-locale';
const returnPathQueryKeys = ['from', 'next'] as const;
const internalUrlBase = 'https://internal.local';
const excludedPathPrefixes = ['/auth/', '/_next/', '/api/'];
const staticAssetPathPattern =
  /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|pdf|png|svg|txt|webp|woff2?|xml|zip)$/i;

type AppLocale = (typeof routing.locales)[number];

type LocaleHistoryNormalization = {
  sourceHref: string;
  targetHref: string;
  recordedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}


function isAppLocale(value: string): value is AppLocale {
  return routing.locales.includes(value as AppLocale);
}

function getPhysicalLocaleFromPathname(
  pathname: string
): AppLocale {
  const localeSegment = pathname.split('/')[1];

  return isAppLocale(localeSegment)
    ? localeSegment
    : routing.defaultLocale;
}

function parseSameOriginHref(
  href: string
): URL | undefined {
  if (
    !href ||
    href.startsWith('//') ||
    href.includes('\\')
  ) {
    return undefined;
  }

  try {
    const parsedHref = new URL(
      href,
      internalUrlBase
    );

    if (parsedHref.origin !== internalUrlBase) {
      return undefined;
    }

    return parsedHref;
  } catch {
    return undefined;
  }
}

export function isNativeHistoryLocaleNormalizationHref(
  href: string
): boolean {
  const parsedHref = parseSameOriginHref(href);

  if (!parsedHref) {
    return false;
  }

  const logicalPathname = removeKnownLocalePrefix(
    parsedHref.pathname
  );

  if (
    excludedPathPrefixes.some(
      (prefix) =>
        logicalPathname === prefix.slice(0, -1) ||
        logicalPathname.startsWith(prefix)
    )
  ) {
    return false;
  }

  return !staticAssetPathPattern.test(logicalPathname);
}

export function recordPreferredHistoryLocale(
  locale: string
): void {
  if (!isBrowser() || !isAppLocale(locale)) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      PREFERRED_HISTORY_LOCALE_KEY,
      locale
    );
  } catch {
    // If storage is unavailable, native history keeps browser defaults.
  }
}

export function readPreferredHistoryLocale():
  | AppLocale
  | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  try {
    const storedLocale =
      window.sessionStorage.getItem(
        PREFERRED_HISTORY_LOCALE_KEY
      );

    return storedLocale && isAppLocale(storedLocale)
      ? storedLocale
      : undefined;
  } catch {
    return undefined;
  }
}

export function syncPreferredHistoryLocaleToUrl(
  locale: string
): void {
  recordPreferredHistoryLocale(locale);
}

export function getNativeHistoryLocaleCorrectionHref(
  currentHref: string
): string | null {
  const preferredLocale =
    readPreferredHistoryLocale();

  if (!preferredLocale) {
    return null;
  }

  if (
    !isNativeHistoryLocaleNormalizationHref(
      currentHref
    )
  ) {
    return null;
  }

  const parsedHref = parseSameOriginHref(currentHref);

  if (!parsedHref) {
    return null;
  }

  const currentLocale =
    getPhysicalLocaleFromPathname(
      parsedHref.pathname
    );

  if (currentLocale === preferredLocale) {
    return null;
  }

  const logicalPathname =
    removeKnownLocalePrefix(
      parsedHref.pathname
    );
  const localizedPathname = localizePath(
    logicalPathname,
    preferredLocale
  );
  const localizedQueryString =
    localizeReturnPathQuery(
      parsedHref.searchParams.toString(),
      preferredLocale
    );
  const correctedHref = `${localizedPathname}${
    localizedQueryString
      ? `?${localizedQueryString}`
      : ''
  }${parsedHref.hash}`;

  return correctedHref === currentHref
    ? null
    : correctedHref;
}

function readStoredNormalization(): LocaleHistoryNormalization | undefined {
  try {
    const storedValue = window.sessionStorage.getItem(
      LOCALE_HISTORY_NORMALIZATION_KEY
    );

    return storedValue
      ? (JSON.parse(storedValue) as LocaleHistoryNormalization)
      : undefined;
  } catch {
    return undefined;
  }
}

function isLogicalResultsHref(path: string): boolean {
  const unprefixedPath = removeKnownLocalePrefix(path);

  try {
    const parsedPath = new URL(unprefixedPath, 'https://internal.local');

    return (
      parsedPath.origin === 'https://internal.local' &&
      (parsedPath.pathname === '/' ||
        parsedPath.pathname === '/search' ||
        parsedPath.pathname === '/account' ||
        parsedPath.pathname.startsWith('/category/') ||
        parsedPath.pathname.startsWith('/seller/'))
    );
  } catch {
    return false;
  }
}

function isSafeStoredNormalization(
  normalization: LocaleHistoryNormalization
): boolean {
  const safeSourceHref = getSafeNextPath(
    normalization.sourceHref,
    ''
  );

  const safeTargetHref = getSafeNextPath(
    normalization.targetHref,
    ''
  );

  return (
    safeSourceHref === normalization.sourceHref &&
    safeTargetHref === normalization.targetHref &&
    isLogicalResultsHref(safeSourceHref) &&
    isLogicalResultsHref(safeTargetHref)
  );
}

export function createLocaleHistoryNormalization(
  queryString: string,
  currentLocale: string,
  nextLocale: string,
  now = Date.now()
): LocaleHistoryNormalization | null {
  const params = new URLSearchParams(queryString);

  for (const key of returnPathQueryKeys) {
    const rawReturnHref = params.get(key);
    const safeReturnHref = getSafeNextPath(rawReturnHref, '');

    if (!safeReturnHref || !isLogicalResultsHref(safeReturnHref)) {
      continue;
    }

    const sourceHref = localizeSafeInternalPath(safeReturnHref, currentLocale);
    const targetHref = localizeSafeInternalPath(safeReturnHref, nextLocale);

    if (sourceHref === targetHref) {
      return null;
    }

    return {
      sourceHref,
      targetHref,
      recordedAt: now,
    };
  }

  return null;
}

export function recordLocaleHistoryNormalization(
  queryString: string,
  currentLocale: string,
  nextLocale: string
): void {
  if (!isBrowser()) {
    return;
  }

  const normalization = createLocaleHistoryNormalization(
    queryString,
    currentLocale,
    nextLocale
  );

  try {
    if (!normalization) {
      window.sessionStorage.removeItem(LOCALE_HISTORY_NORMALIZATION_KEY);
      return;
    }

    window.sessionStorage.setItem(
      LOCALE_HISTORY_NORMALIZATION_KEY,
      JSON.stringify(normalization)
    );
  } catch {
    // If storage is unavailable, native history simply keeps browser defaults.
  }
}

export function clearLocaleHistoryNormalization(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(LOCALE_HISTORY_NORMALIZATION_KEY);
  } catch {
    // Storage can be unavailable in private or constrained browser contexts.
  }
}

export function takeLocaleHistoryNormalizationRedirect(
  currentHref: string,
  hasFreshNativeHistoryTraversalIntent: boolean
): string | null {
  if (!isBrowser() || !hasFreshNativeHistoryTraversalIntent) {
    return null;
  }

const normalization = readStoredNormalization();

if (
  !normalization ||
  !isSafeStoredNormalization(normalization)
) {
  window.sessionStorage.removeItem(LOCALE_HISTORY_NORMALIZATION_KEY);
  return null;
}

if (currentHref !== normalization.sourceHref) {
  window.sessionStorage.removeItem(LOCALE_HISTORY_NORMALIZATION_KEY);
  return null;
}

window.sessionStorage.removeItem(LOCALE_HISTORY_NORMALIZATION_KEY);
return normalization.targetHref;
}
