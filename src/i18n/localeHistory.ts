'use client';

import {
  localizeSafeInternalPath,
  removeKnownLocalePrefix,
} from './localePath';
import { getSafeNextPath } from '../lib/auth/safeNextPath';

const LOCALE_HISTORY_NORMALIZATION_KEY = 'charlal-locale-history-normalization';
const returnPathQueryKeys = ['from', 'next'] as const;

type LocaleHistoryNormalization = {
  sourceHref: string;
  targetHref: string;
  recordedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
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
