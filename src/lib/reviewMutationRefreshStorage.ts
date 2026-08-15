'use client';

const REVIEW_MUTATION_REFRESH_KEY = 'charlal-review-mutation-refresh:v1';
const MAX_REFRESH_MARKER_AGE_MS = 5 * 60 * 1000;

type ReviewMutationRefreshMarker = {
  savedAt: number;
  refreshedHrefs: string[];
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readMarker(): ReviewMutationRefreshMarker | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const storedValue = window.sessionStorage.getItem(
      REVIEW_MUTATION_REFRESH_KEY
    );

    if (!storedValue) {
      return null;
    }

    const marker = JSON.parse(storedValue) as Partial<ReviewMutationRefreshMarker>;

    if (
      typeof marker.savedAt !== 'number' ||
      !Array.isArray(marker.refreshedHrefs)
    ) {
      window.sessionStorage.removeItem(REVIEW_MUTATION_REFRESH_KEY);
      return null;
    }

    if (Date.now() - marker.savedAt > MAX_REFRESH_MARKER_AGE_MS) {
      window.sessionStorage.removeItem(REVIEW_MUTATION_REFRESH_KEY);
      return null;
    }

    return {
      savedAt: marker.savedAt,
      refreshedHrefs: marker.refreshedHrefs.filter(
        (href): href is string => typeof href === 'string'
      ),
    };
  } catch {
    window.sessionStorage.removeItem(REVIEW_MUTATION_REFRESH_KEY);
    return null;
  }
}

function writeMarker(marker: ReviewMutationRefreshMarker): void {
  window.sessionStorage.setItem(
    REVIEW_MUTATION_REFRESH_KEY,
    JSON.stringify(marker)
  );
}

export function recordReviewMutationRefreshIntent(
  refreshedHref?: string
): void {
  if (!isBrowser()) {
    return;
  }

  writeMarker({
    savedAt: Date.now(),
    refreshedHrefs: refreshedHref ? [refreshedHref] : [],
  });
}

export function shouldRefreshForReviewMutation(currentHref: string): boolean {
  const marker = readMarker();

  if (!marker || !currentHref) {
    return false;
  }

  if (marker.refreshedHrefs.includes(currentHref)) {
    return false;
  }

  writeMarker({
    ...marker,
    refreshedHrefs: [...marker.refreshedHrefs, currentHref],
  });

  return true;
}
