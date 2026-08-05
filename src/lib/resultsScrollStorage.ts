const ACTIVE_LISTING_NAVIGATION_KEY = 'charlal-active-listing-navigation';
const RESTORE_INTENT_KEY = 'charlal-restore-results-scroll';
const SCROLL_KEY_PREFIX = 'charlal-results-scroll:';
const MAX_SCROLL_AGE_MS = 30 * 60 * 1000;

type StoredListingNavigation = {
  resultsHref: string;
  targetHref: string;
  savedAt: number;
};

type StoredScrollPosition = StoredListingNavigation & {
  scrollY: number;
};

type StoredRestoreIntent = {
  resultsHref: string;
  requestedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getScrollStorageKey(resultsHref: string): string {
  return `${SCROLL_KEY_PREFIX}${resultsHref}`;
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
  const scrollPosition: StoredScrollPosition = {
    resultsHref,
    targetHref: listingHref,
    savedAt,
    scrollY: window.scrollY,
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

  const currentHref = `${window.location.pathname}${window.location.search}`;
  const activeNavigation = readJson<StoredListingNavigation>(
    ACTIVE_LISTING_NAVIGATION_KEY
  );

  if (
    !activeNavigation ||
    activeNavigation.resultsHref !== resultsHref ||
    activeNavigation.targetHref !== currentHref ||
    !isFresh(activeNavigation.savedAt)
  ) {
    window.sessionStorage.removeItem(ACTIVE_LISTING_NAVIGATION_KEY);
    return;
  }

  const restoreIntent: StoredRestoreIntent = {
    resultsHref,
    requestedAt: Date.now(),
  };

  window.sessionStorage.setItem(RESTORE_INTENT_KEY, JSON.stringify(restoreIntent));
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
