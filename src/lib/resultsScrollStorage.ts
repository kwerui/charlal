import {
  localizeReturnPathQuery,
  removeKnownLocalePrefix,
} from '@/i18n/localePath';
import { routing } from '@/i18n/routing';

const ACTIVE_LISTING_NAVIGATION_KEY =
  'charlal-active-listing-navigation';

const RESTORE_INTENT_KEY =
  'charlal-restore-results-scroll';

const SCROLL_KEY_PREFIX =
  'charlal-results-scroll:';

const MAX_SCROLL_AGE_MS = 30 * 60 * 1000;
const NEAR_BOTTOM_TOLERANCE_PX = 32;

type StoredListingNavigation = {
  resultsHref: string;
  targetHref: string;
  savedAt: number;
};

type StoredScrollPosition =
  StoredListingNavigation & {
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

  /**
   * Correct physical localized URL that may consume the restore.
   *
   * Used only for native locale-normalized traversal.
   */
  targetHref?: string;

  /**
   * Document that initiated the native locale correction.
   *
   * That document must never consume the restore intended for
   * the replacement document.
   */
  sourceDocumentId?: string;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getCurrentDocumentInstanceId():
  | string
  | undefined {
  return window.__charlalDocumentInstanceId;
}

function getLogicalNavigationHref(
  href: string
): string {
  try {
    const parsedHref = new URL(
      href,
      'https://internal.local'
    );

    if (
      parsedHref.origin !==
      'https://internal.local'
    ) {
      return href;
    }

    const logicalQueryString =
      localizeReturnPathQuery(
        parsedHref.searchParams.toString(),
        routing.defaultLocale
      );

    return `${removeKnownLocalePrefix(
      parsedHref.pathname
    )}${
      logicalQueryString
        ? `?${logicalQueryString}`
        : ''
    }${parsedHref.hash}`;
  } catch {
    return href;
  }
}

function getCurrentBrowserHref(): string {
  return (
    window.location.pathname +
    window.location.search +
    window.location.hash
  );
}

function getScrollStorageKey(
  resultsHref: string
): string {
  return `${SCROLL_KEY_PREFIX}${resultsHref}`;
}

function getMaximumScrollY(): number {
  return Math.max(
    0,
    document.documentElement.scrollHeight -
      window.innerHeight
  );
}

function readJson<T>(
  key: string
): T | undefined {
  try {
    const storedValue =
      window.sessionStorage.getItem(key);

    return storedValue
      ? (JSON.parse(storedValue) as T)
      : undefined;
  } catch {
    return undefined;
  }
}

function isFresh(
  timestamp: number
): boolean {
  return (
    Date.now() - timestamp <=
    MAX_SCROLL_AGE_MS
  );
}

/**
 * Returns true when the current document is allowed to
 * consume this restore intent.
 */
function canCurrentDocumentConsumeRestore(
  restoreIntent: StoredRestoreIntent
): boolean {
  /*
   * The document that initiated location.replace() must not
   * consume the state intended for the replacement document.
   */
  if (
    restoreIntent.sourceDocumentId &&
    restoreIntent.sourceDocumentId ===
      getCurrentDocumentInstanceId()
  ) {
    return false;
  }

  /*
   * Native locale correction may briefly render the old physical
   * history entry. Only the final corrected physical URL may
   * consume the native restore.
   */
  if (
    restoreIntent.targetHref &&
    getCurrentBrowserHref() !==
      restoreIntent.targetHref
  ) {
    return false;
  }

  return true;
}

export function saveResultsScrollPosition(
  resultsHref: string,
  listingHref: string
): void {
  if (!isBrowser()) {
    return;
  }

  const savedAt = Date.now();
  const maximumScrollY =
    getMaximumScrollY();
  const scrollY = window.scrollY;

  const scrollPosition: StoredScrollPosition = {
    resultsHref,
    targetHref: listingHref,
    savedAt,
    scrollY,
    maximumScrollY,
    nearBottom:
      maximumScrollY - scrollY <=
      NEAR_BOTTOM_TOLERANCE_PX,
  };

  const listingNavigation: StoredListingNavigation =
    {
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

/**
 * Explicit "Back to results/homepage" navigation.
 */
export function requestResultsScrollRestore(
  resultsHref: string
): void {
  if (!isBrowser()) {
    return;
  }

  const logicalResultsHref =
    getLogicalNavigationHref(resultsHref);

  const currentHref =
    getLogicalNavigationHref(
      `${window.location.pathname}${window.location.search}`
    );

  const activeNavigation =
    readJson<StoredListingNavigation>(
      ACTIVE_LISTING_NAVIGATION_KEY
    );

  if (
    !activeNavigation ||
    getLogicalNavigationHref(
      activeNavigation.resultsHref
    ) !== logicalResultsHref ||
    getLogicalNavigationHref(
      activeNavigation.targetHref
    ) !== currentHref ||
    !isFresh(activeNavigation.savedAt)
  ) {
    window.sessionStorage.removeItem(
      ACTIVE_LISTING_NAVIGATION_KEY
    );

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

  window.sessionStorage.removeItem(
    ACTIVE_LISTING_NAVIGATION_KEY
  );
}

/**
 * Native browser Back/Forward traversal following a locale switch.
 *
 * The browser first traverses to the old physical history entry.
 * instrumentation-client then replaces it with the correctly
 * localized URL.
 */
export function requestResultsScrollRestoreAfterNativeTraversal(
  resultsHref: string
): void {
  if (!isBrowser()) {
    return;
  }

  const logicalResultsHref =
    getLogicalNavigationHref(resultsHref);

  const activeNavigation =
    readJson<StoredListingNavigation>(
      ACTIVE_LISTING_NAVIGATION_KEY
    );

  if (
    !activeNavigation ||
    getLogicalNavigationHref(
      activeNavigation.resultsHref
    ) !== logicalResultsHref ||
    !isFresh(activeNavigation.savedAt)
  ) {
    window.sessionStorage.removeItem(
      ACTIVE_LISTING_NAVIGATION_KEY
    );

    return;
  }

  const restoreIntent: StoredRestoreIntent = {
    resultsHref: logicalResultsHref,
    requestedAt: Date.now(),

    // Correct physical locale destination.
    targetHref: resultsHref,

    // Prevent the document initiating location.replace()
    // from consuming the restore.
    sourceDocumentId:
      getCurrentDocumentInstanceId(),
  };

  window.sessionStorage.setItem(
    RESTORE_INTENT_KEY,
    JSON.stringify(restoreIntent)
  );

  window.sessionStorage.removeItem(
    ACTIVE_LISTING_NAVIGATION_KEY
  );
}

/**
 * Existing destructive scroll-position consumer.
 *
 * Keep for compatibility with any existing callers/tests.
 */
export function takeResultsScrollPosition(
  resultsHref: string
): number | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const logicalResultsHref =
    getLogicalNavigationHref(resultsHref);

  const restoreIntent =
    readJson<StoredRestoreIntent>(
      RESTORE_INTENT_KEY
    );

  if (
    !restoreIntent ||
    restoreIntent.resultsHref !==
      logicalResultsHref ||
    !isFresh(restoreIntent.requestedAt)
  ) {
    return undefined;
  }

  if (
    !canCurrentDocumentConsumeRestore(
      restoreIntent
    )
  ) {
    return undefined;
  }

  const storageKey =
    getScrollStorageKey(
      logicalResultsHref
    );

  const scrollPosition =
    readJson<StoredScrollPosition>(
      storageKey
    );

  if (
    !scrollPosition ||
    getLogicalNavigationHref(
      scrollPosition.resultsHref
    ) !== logicalResultsHref ||
    !isFresh(scrollPosition.savedAt)
  ) {
    return undefined;
  }

  window.sessionStorage.removeItem(
    RESTORE_INTENT_KEY
  );

  window.sessionStorage.removeItem(
    storageKey
  );

  return scrollPosition.scrollY;
}

export function hasFreshResultsScrollRestoreIntent(
  resultsHref: string
): boolean {
  if (!isBrowser()) {
    return false;
  }

  const logicalResultsHref =
    getLogicalNavigationHref(resultsHref);

  const restoreIntent =
    readJson<StoredRestoreIntent>(
      RESTORE_INTENT_KEY
    );

  if (
    !restoreIntent ||
    restoreIntent.resultsHref !==
      logicalResultsHref ||
    !isFresh(restoreIntent.requestedAt)
  ) {
    return false;
  }

  return canCurrentDocumentConsumeRestore(
    restoreIntent
  );
}

export function hasActiveResultsNavigation(
  resultsHref: string
): boolean {
  if (!isBrowser()) {
    return false;
  }

  const currentHref =
    getLogicalNavigationHref(
      `${window.location.pathname}${window.location.search}`
    );

  const activeNavigation =
    readJson<StoredListingNavigation>(
      ACTIVE_LISTING_NAVIGATION_KEY
    );

  if (
    !activeNavigation ||
    getLogicalNavigationHref(
      activeNavigation.resultsHref
    ) !==
      getLogicalNavigationHref(
        resultsHref
      ) ||
    getLogicalNavigationHref(
      activeNavigation.targetHref
    ) !== currentHref ||
    !isFresh(activeNavigation.savedAt)
  ) {
    window.sessionStorage.removeItem(
      ACTIVE_LISTING_NAVIGATION_KEY
    );

    return false;
  }

  return true;
}

/**
 * Non-destructively reads the saved scroll position.
 *
 * The state stays in sessionStorage until
 * completeResultsScrollRestore() is called.
 */
export function peekResultsScrollPosition(
  resultsHref: string
): number | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const logicalResultsHref =
    getLogicalNavigationHref(resultsHref);

  const restoreIntent =
    readJson<StoredRestoreIntent>(
      RESTORE_INTENT_KEY
    );

  if (
    !restoreIntent ||
    restoreIntent.resultsHref !==
      logicalResultsHref ||
    !isFresh(restoreIntent.requestedAt)
  ) {
    return undefined;
  }

  if (
    !canCurrentDocumentConsumeRestore(
      restoreIntent
    )
  ) {
    return undefined;
  }

  const storageKey =
    getScrollStorageKey(
      logicalResultsHref
    );

  const scrollPosition =
    readJson<StoredScrollPosition>(
      storageKey
    );

  if (
    !scrollPosition ||
    getLogicalNavigationHref(
      scrollPosition.resultsHref
    ) !== logicalResultsHref ||
    !isFresh(scrollPosition.savedAt)
  ) {
    return undefined;
  }

  return scrollPosition.scrollY;
}


export function peekResultsScrollRestorePosition(
  resultsHref: string
): SavedResultsScrollPosition | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const logicalResultsHref =
    getLogicalNavigationHref(resultsHref);

  const restoreIntent =
    readJson<StoredRestoreIntent>(
      RESTORE_INTENT_KEY
    );

  if (
    !restoreIntent ||
    restoreIntent.resultsHref !== logicalResultsHref ||
    !isFresh(restoreIntent.requestedAt)
  ) {
    return undefined;
  }

  if (
    !canCurrentDocumentConsumeRestore(
      restoreIntent
    )
  ) {
    return undefined;
  }

  return getSavedResultsScrollPosition(
    logicalResultsHref
  );
}

/**
 * Consumes the restore state only after restoration succeeded.
 */
export function completeResultsScrollRestore(
  resultsHref: string
): void {
  if (!isBrowser()) {
    return;
  }

  const logicalResultsHref =
    getLogicalNavigationHref(resultsHref);

  const restoreIntent =
    readJson<StoredRestoreIntent>(
      RESTORE_INTENT_KEY
    );

  if (!restoreIntent) {
    return;
  }

  if (
    restoreIntent.resultsHref !==
    logicalResultsHref
  ) {
    return;
  }

  if (
    !canCurrentDocumentConsumeRestore(
      restoreIntent
    )
  ) {
    return;
  }

  window.sessionStorage.removeItem(
    RESTORE_INTENT_KEY
  );

  window.sessionStorage.removeItem(
    getScrollStorageKey(
      logicalResultsHref
    )
  );
}

export function getSavedResultsScrollPosition(
  resultsHref: string
): SavedResultsScrollPosition | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const logicalResultsHref =
    getLogicalNavigationHref(resultsHref);

  const scrollPosition =
    readJson<StoredScrollPosition>(
      getScrollStorageKey(
        logicalResultsHref
      )
    );

  if (
    !scrollPosition ||
    getLogicalNavigationHref(
      scrollPosition.resultsHref
    ) !== logicalResultsHref ||
    !isFresh(scrollPosition.savedAt)
  ) {
    return undefined;
  }

  const maximumScrollY =
    typeof scrollPosition.maximumScrollY ===
      'number' &&
    Number.isFinite(
      scrollPosition.maximumScrollY
    )
      ? Math.max(
          0,
          scrollPosition.maximumScrollY
        )
      : Math.max(
          0,
          scrollPosition.scrollY
        );

  const nearBottom =
    typeof scrollPosition.nearBottom ===
    'boolean'
      ? scrollPosition.nearBottom
      : maximumScrollY -
            scrollPosition.scrollY <=
          NEAR_BOTTOM_TOLERANCE_PX;

  return {
    scrollY: scrollPosition.scrollY,
    maximumScrollY,
    nearBottom,
    savedAt: scrollPosition.savedAt,
  };
}