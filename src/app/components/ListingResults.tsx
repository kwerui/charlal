'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ListingCard from '@/app/components/ListingCard';
import ListingMutationRefreshBoundary from '@/app/components/ListingMutationRefreshBoundary';
import ResultsScrollRestorer from '@/app/components/ResultsScrollRestorer';
import type { Listing } from '@/data/listings';
import { filterListings, type ListingFilterCriteria } from '@/lib/listingFilters';

type Props = {
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

export default function ListingResults({
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
  const t = useTranslations('ListingResults');
  const matchingListings = useMemo(() => {
    if (requireSearchQuery && !criteria.searchQuery?.trim()) {
      return [];
    }

    return filterListings(databaseListings, criteria);
  }, [criteria, databaseListings, requireSearchQuery]);

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
            {t('resultsCountLabel')}: {matchingListings.length}
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
          <EmptyHeading>{t('emptyResultsTitle')}</EmptyHeading>
          <p>{t('emptyResultsMessage')}</p>
        </div>
      ) : null}

      {resultsHref ? <ResultsScrollRestorer resultsHref={resultsHref} /> : null}
    </>
  );
}
