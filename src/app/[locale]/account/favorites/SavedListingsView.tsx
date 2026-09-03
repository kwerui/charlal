'use client';

import { useState } from 'react';
import ListingCard from '@/app/components/ListingCard';
import type { Listing } from '@/data/listings';
import { useTranslations } from 'next-intl';

type Props = {
  initialListings: Listing[];
  savedListingKeys: string[];
  currentViewerId: string;
};

export default function SavedListingsView({
  initialListings,
  savedListingKeys,
  currentViewerId,
}: Props) {
  const t = useTranslations('SavedListings');
  const [listings, setListings] = useState(initialListings);

  return (
    <>
      <p className="results-summary saved-advertisements-count" aria-live="polite">
        {t('countLabel')}: {listings.length}
      </p>

      {listings.length > 0 ? (
        <div className="listings-grid saved-listings-grid">
          {listings.map((listing) => (
            <ListingCard
              key={String(listing.id)}
              listing={listing}
              fromHref="/account/favorites"
              savedListingKeys={savedListingKeys}
              currentViewerId={currentViewerId}
              onFavoriteRemoved={(listingId) => {
                setListings((currentListings) =>
                  currentListings.filter(
                    (currentListing) => String(currentListing.id) !== listingId
                  )
                );
              }}
            />
          ))}
        </div>
      ) : (
        <div className="empty-results" role="status">
          <h2>{t('emptyTitle')}</h2>
          <p>{t('emptyMessage')}</p>
        </div>
      )}
    </>
  );
}
