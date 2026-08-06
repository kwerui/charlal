'use client';

const ACCOUNT_SCROLL_KEY = 'charlal-account-refresh-scroll:/account';
const ACCOUNT_PATH = '/account';
const MAX_SCROLL_AGE_MS = 30 * 60 * 1000;

type StoredAccountScroll = {
  pathname: typeof ACCOUNT_PATH;
  scrollY: number;
  savedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isFresh(timestamp: number): boolean {
  return Date.now() - timestamp <= MAX_SCROLL_AGE_MS;
}

function readStoredAccountScroll(): StoredAccountScroll | undefined {
  try {
    const storedValue = window.sessionStorage.getItem(ACCOUNT_SCROLL_KEY);
    return storedValue ? (JSON.parse(storedValue) as StoredAccountScroll) : undefined;
  } catch {
    return undefined;
  }
}

export function isAccountReloadNavigation(): boolean {
  if (!isBrowser()) {
    return false;
  }

  const navigationEntry = window.performance.getEntriesByType(
    'navigation'
  )[0] as PerformanceNavigationTiming | undefined;

  if (navigationEntry) {
    return navigationEntry.type === 'reload';
  }

  return window.performance.navigation?.type === window.performance.navigation?.TYPE_RELOAD;
}

export function saveAccountRefreshScrollPosition(): void {
  if (!isBrowser() || window.location.pathname !== ACCOUNT_PATH) {
    return;
  }

  const scrollPosition: StoredAccountScroll = {
    pathname: ACCOUNT_PATH,
    scrollY: window.scrollY,
    savedAt: Date.now(),
  };

  window.sessionStorage.setItem(ACCOUNT_SCROLL_KEY, JSON.stringify(scrollPosition));
}

export function takeAccountRefreshScrollPosition(): number | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const storedScroll = readStoredAccountScroll();
  window.sessionStorage.removeItem(ACCOUNT_SCROLL_KEY);

  if (
    !storedScroll ||
    storedScroll.pathname !== ACCOUNT_PATH ||
    !isFresh(storedScroll.savedAt) ||
    !isAccountReloadNavigation()
  ) {
    return undefined;
  }

  return storedScroll.scrollY;
}
