'use client';

import { useEffect, useMemo, useState } from 'react';
import ListingCard from '@/app/components/ListingCard';
import ResultsScrollRestorer from '@/app/components/ResultsScrollRestorer';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import {
  combineListings,
  readLocalListings,
  subscribeToLocalListings,
} from '@/lib/localListings';
import { filterListings, type ListingFilterCriteria } from '@/lib/listingFilters';

type Props = {
  builtInListings: Listing[];
  criteria?: ListingFilterCriteria;
  resultsHref?: string;
  limit?: number;
  showResultsSummary?: boolean;
  showEmptyState?: boolean;
  emptyHeadingLevel?: 'h2' | 'h3';
  requireSearchQuery?: boolean;
};

export default function ListingResults({
  builtInListings,
  criteria = {},
  resultsHref,
  limit,
  showResultsSummary = true,
  showEmptyState = true,
  emptyHeadingLevel = 'h3',
  requireSearchQuery = false,
}: Props) {
  const [localListings, setLocalListings] = useState<Listing[]>([]);

  useEffect(() => {
    function refreshLocalListings(): void {
      setLocalListings(readLocalListings());
    }

    refreshLocalListings();

    return subscribeToLocalListings(refreshLocalListings);
  }, []);

  const matchingListings = useMemo(() => {
    if (requireSearchQuery && !criteria.searchQuery?.trim()) {
      return [];
    }

    const combinedListings = combineListings(builtInListings, localListings);

    return filterListings(combinedListings, criteria);
  }, [builtInListings, criteria, localListings, requireSearchQuery]);

  const visibleListings =
    typeof limit === 'number' ? matchingListings.slice(0, limit) : matchingListings;
  const EmptyHeading = emptyHeadingLevel;

  return (
    <>
      {showResultsSummary ? (
        <div className="results-summary" aria-live="polite">
          <p>
            {content.resultsCountLabel}: {matchingListings.length}
          </p>
        </div>
      ) : null}

      {visibleListings.length > 0 ? (
        <div className="listings-grid">
          {visibleListings.map((listing) => (
            <ListingCard
              key={String(listing.id)}
              listing={listing}
              fromHref={resultsHref}
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
