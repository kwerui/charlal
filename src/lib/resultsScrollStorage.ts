import {
  localizeReturnPathQuery,
  removeKnownLocalePrefix,
} from '@/i18n/localePath';
import { routing } from '@/i18n/routing';

const ACTIVE_LISTING_NAVIGATION_KEY = 'charlal-active-listing-navigation';
const RESTORE_INTENT_KEY = 'charlal-restore-results-scroll';
const SCROLL_KEY_PREFIX = 'charlal-results-scroll:';
const MAX_SCROLL_AGE_MS = 30 * 60 * 1000;
const NEAR_BOTTOM_TOLERANCE_PX = 32;

type StoredListingNavigation = {
  resultsHref: string;
  targetHref: string;
  savedAt: number;
};

type StoredScrollPosition = StoredListingNavigation & {
  scrollY: number;
  maximumScrollY: number;
  nearBottom: boolean;
};

export type SavedResultsScrollPosition = {
  scrollY: number;
  maximumScrollY: number;
  nearBottom: boolean;
  savedAt: number;
};

type StoredRestoreIntent = {
  resultsHref: string;
  requestedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getLogicalNavigationHref(href: string): string {
  try {
    const parsedHref = new URL(href, 'https://internal.local');

    if (parsedHref.origin !== 'https://internal.local') {
      return href;
    }

    const logicalQueryString = localizeReturnPathQuery(
      parsedHref.searchParams.toString(),
      routing.defaultLocale
    );

    return `${removeKnownLocalePrefix(parsedHref.pathname)}${
      logicalQueryString ? `?${logicalQueryString}` : ''
    }${parsedHref.hash}`;
  } catch {
    return href;
  }
}

function getScrollStorageKey(resultsHref: string): string {
  return `${SCROLL_KEY_PREFIX}${resultsHref}`;
}

function getMaximumScrollY(): number {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function readJson<T>(key: string): T | undefined {
  try {
    const storedValue = window.sessionStorage.getItem(key);
    return storedValue ? (JSON.parse(storedValue) as T) : undefined;
  } catch {
    return undefined;
  }
}

function isFresh(timestamp: number): boolean {
  return Date.now() - timestamp <= MAX_SCROLL_AGE_MS;
}

export function saveResultsScrollPosition(resultsHref: string, listingHref: string): void {
  if (!isBrowser()) {
    return;
  }

  const savedAt = Date.now();
  const maximumScrollY = getMaximumScrollY();
  const scrollY = window.scrollY;
  const scrollPosition: StoredScrollPosition = {
    resultsHref,
    targetHref: listingHref,
    savedAt,
    scrollY,
    maximumScrollY,
    nearBottom: maximumScrollY - scrollY <= NEAR_BOTTOM_TOLERANCE_PX,
  };
  const listingNavigation: StoredListingNavigation = {
    resultsHref,
    targetHref: listingHref,
    savedAt,
  };

  window.sessionStorage.setItem(
    getScrollStorageKey(resultsHref),
    JSON.stringify(scrollPosition)
  );
  window.sessionStorage.setItem(
    ACTIVE_LISTING_NAVIGATION_KEY,
    JSON.stringify(listingNavigation)
  );
}

export function requestResultsScrollRestore(resultsHref: string): void {
  if (!isBrowser()) {
    return;
  }

  const logicalResultsHref = getLogicalNavigationHref(resultsHref);

  const currentHref = getLogicalNavigationHref(
    `${window.location.pathname}${window.location.search}`
  );

  const activeNavigation = readJson<StoredListingNavigation>(
    ACTIVE_LISTING_NAVIGATION_KEY
  );

  if (
    !activeNavigation ||
    getLogicalNavigationHref(activeNavigation.resultsHref) !== logicalResultsHref ||
    getLogicalNavigationHref(activeNavigation.targetHref) !== currentHref ||
    !isFresh(activeNavigation.savedAt)
  ) {
    window.sessionStorage.removeItem(ACTIVE_LISTING_NAVIGATION_KEY);
    return;
  }

  const restoreIntent: StoredRestoreIntent = {
    resultsHref: logicalResultsHref,
    requestedAt: Date.now(),
  };

  window.sessionStorage.setItem(
    RESTORE_INTENT_KEY,
    JSON.stringify(restoreIntent)
  );

  window.sessionStorage.removeItem(ACTIVE_LISTING_NAVIGATION_KEY);
}

export function takeResultsScrollPosition(resultsHref: string): number | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const restoreIntent = readJson<StoredRestoreIntent>(RESTORE_INTENT_KEY);

  if (
    !restoreIntent ||
    restoreIntent.resultsHref !== resultsHref ||
    !isFresh(restoreIntent.requestedAt)
  ) {
    return undefined;
  }

  window.sessionStorage.removeItem(RESTORE_INTENT_KEY);

  const storageKey = getScrollStorageKey(resultsHref);
  const scrollPosition = readJson<StoredScrollPosition>(storageKey);
  window.sessionStorage.removeItem(storageKey);

  if (
    !scrollPosition ||
    scrollPosition.resultsHref !== resultsHref ||
    !isFresh(scrollPosition.savedAt)
  ) {
    return undefined;
  }

  return scrollPosition.scrollY;
}

export function hasFreshResultsScrollRestoreIntent(resultsHref: string): boolean {
  if (!isBrowser()) {
    return false;
  }

  const restoreIntent = readJson<StoredRestoreIntent>(RESTORE_INTENT_KEY);

  return Boolean(
    restoreIntent &&
      restoreIntent.resultsHref === resultsHref &&
      isFresh(restoreIntent.requestedAt)
  );
}

export function hasActiveResultsNavigation(resultsHref: string): boolean {
  if (!isBrowser()) {
    return false;
  }

const currentHref = getLogicalNavigationHref(
  `${window.location.pathname}${window.location.search}`
);
  const activeNavigation = readJson<StoredListingNavigation>(
    ACTIVE_LISTING_NAVIGATION_KEY
  );

  if (
    !activeNavigation ||
    getLogicalNavigationHref(activeNavigation.resultsHref) !==
  getLogicalNavigationHref(resultsHref) ||
getLogicalNavigationHref(activeNavigation.targetHref) !== currentHref ||
    !isFresh(activeNavigation.savedAt)
  ) {
    window.sessionStorage.removeItem(ACTIVE_LISTING_NAVIGATION_KEY);
    return false;
  }

  return true;
}

export function getSavedResultsScrollPosition(
  resultsHref: string
): SavedResultsScrollPosition | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const scrollPosition = readJson<StoredScrollPosition>(
    getScrollStorageKey(resultsHref)
  );

  if (
    !scrollPosition ||
    scrollPosition.resultsHref !== resultsHref ||
    !isFresh(scrollPosition.savedAt)
  ) {
    return undefined;
  }

  const maximumScrollY =
    typeof scrollPosition.maximumScrollY === 'number' &&
    Number.isFinite(scrollPosition.maximumScrollY)
      ? Math.max(0, scrollPosition.maximumScrollY)
      : Math.max(0, scrollPosition.scrollY);
  const nearBottom =
    typeof scrollPosition.nearBottom === 'boolean'
      ? scrollPosition.nearBottom
      : maximumScrollY - scrollPosition.scrollY <= NEAR_BOTTOM_TOLERANCE_PX;

  return {
    scrollY: scrollPosition.scrollY,
    maximumScrollY,
    nearBottom,
    savedAt: scrollPosition.savedAt,
  };
}
