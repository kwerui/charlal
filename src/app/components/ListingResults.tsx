'use client';

import { useMemo } from 'react';
import ListingCard from '@/app/components/ListingCard';
import ListingMutationRefreshBoundary from '@/app/components/ListingMutationRefreshBoundary';
import ResultsScrollRestorer from '@/app/components/ResultsScrollRestorer';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { filterListings, type ListingFilterCriteria } from '@/lib/listingFilters';

type Props = {
  builtInListings: Listing[];
  databaseListings?: Listing[];
  databaseError?: string;
  criteria?: ListingFilterCriteria;
  resultsHref?: string;
  limit?: number;
  showResultsSummary?: boolean;
  showEmptyState?: boolean;
  emptyHeadingLevel?: 'h2' | 'h3';
  requireSearchQuery?: boolean;
  savedListingKeys?: string[];
  currentViewerId?: string | null;
};

function combineListings(
  builtInListings: Listing[],
  databaseListings: Listing[]
): Listing[] {
  const builtInIds = new Set(builtInListings.map((listing) => String(listing.id)));
  const safeDatabaseListings = databaseListings.filter(
    (listing) => !builtInIds.has(String(listing.id))
  );

  return [...safeDatabaseListings, ...builtInListings];
}

export default function ListingResults({
  builtInListings,
  databaseListings = [],
  databaseError = '',
  criteria = {},
  resultsHref,
  limit,
  showResultsSummary = true,
  showEmptyState = true,
  emptyHeadingLevel = 'h3',
  requireSearchQuery = false,
  savedListingKeys = [],
  currentViewerId = null,
}: Props) {
  const matchingListings = useMemo(() => {
    if (requireSearchQuery && !criteria.searchQuery?.trim()) {
      return [];
    }

    const combinedListings = combineListings(builtInListings, databaseListings);

    return filterListings(combinedListings, criteria);
  }, [builtInListings, criteria, databaseListings, requireSearchQuery]);

  const visibleListings =
    typeof limit === 'number' ? matchingListings.slice(0, limit) : matchingListings;
  const EmptyHeading = emptyHeadingLevel;

  return (
    <>
      <ListingMutationRefreshBoundary
        listingIds={databaseListings.map((listing) => String(listing.id))}
      />
      {showResultsSummary ? (
        <div className="results-summary" aria-live="polite">
          <p>
            {content.resultsCountLabel}: {matchingListings.length}
          </p>
        </div>
      ) : null}

      {databaseError ? (
        <p className="form-error" role="alert">
          {databaseError}
        </p>
      ) : null}

      {visibleListings.length > 0 ? (
        <div className="listings-grid">
          {visibleListings.map((listing) => (
            <ListingCard
              key={String(listing.id)}
              listing={listing}
              fromHref={resultsHref}
              savedListingKeys={savedListingKeys}
              currentViewerId={currentViewerId}
            />
          ))}
        </div>
      ) : showEmptyState ? (
        <div className="empty-results" role="status">
          <EmptyHeading>{content.emptyResultsTitle}</EmptyHeading>
          <p>{content.emptyResultsMessage}</p>
        </div>
      ) : null}

      {resultsHref ? <ResultsScrollRestorer resultsHref={resultsHref} /> : null}
    </>
  );
}
