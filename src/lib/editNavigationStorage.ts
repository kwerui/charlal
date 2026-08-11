'use client';

const EDIT_NAVIGATION_KEY = 'charlal-edit-navigation:v1';
const MAX_EDIT_NAVIGATION_AGE_MS = 30 * 60 * 1000;

type EditNavigationMarker = {
  editHref: string;
  returnHref: string;
  savedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readMarker(): EditNavigationMarker | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const storedValue = window.sessionStorage.getItem(EDIT_NAVIGATION_KEY);

    if (!storedValue) {
      return null;
    }

    const marker = JSON.parse(storedValue) as Partial<EditNavigationMarker>;

    if (
      typeof marker.editHref !== 'string' ||
      typeof marker.returnHref !== 'string' ||
      typeof marker.savedAt !== 'number'
    ) {
      window.sessionStorage.removeItem(EDIT_NAVIGATION_KEY);
      return null;
    }

    if (Date.now() - marker.savedAt > MAX_EDIT_NAVIGATION_AGE_MS) {
      window.sessionStorage.removeItem(EDIT_NAVIGATION_KEY);
      return null;
    }

    return {
      editHref: marker.editHref,
      returnHref: marker.returnHref,
      savedAt: marker.savedAt,
    };
  } catch {
    window.sessionStorage.removeItem(EDIT_NAVIGATION_KEY);
    return null;
  }
}

export function recordEditNavigation(editHref: string, returnHref: string): void {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.setItem(
    EDIT_NAVIGATION_KEY,
    JSON.stringify({
      editHref,
      returnHref,
      savedAt: Date.now(),
    })
  );
}

export function hasActiveEditNavigation(returnHref: string): boolean {
  if (!isBrowser()) {
    return false;
  }

  const currentHref = `${window.location.pathname}${window.location.search}`;
  const marker = readMarker();
  const currentUrl = new URL(currentHref, window.location.origin);
  const markerUrl = marker
    ? new URL(marker.editHref, window.location.origin)
    : null;

  if (
    !marker ||
    !markerUrl ||
    markerUrl.pathname !== currentUrl.pathname ||
    marker.returnHref !== returnHref
  ) {
    window.sessionStorage.removeItem(EDIT_NAVIGATION_KEY);
    return false;
  }

  return true;
}
