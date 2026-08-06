'use client';

import Link from 'next/link';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { isListingOwnedByUser } from '@/lib/listingOwnership';
import { useDemoAuthStatus } from '@/lib/useDemoAuthStatus';

type Props = {
  listing: Listing;
};

export default function ListingDetailOwnerActions({ listing }: Props) {
  const { status: authStatus, user: currentUser } = useDemoAuthStatus();
  const isLocalListing = typeof listing.id === 'string' && listing.id.startsWith('local-');
  const isOwnedByCurrentUser =
    authStatus === 'authenticated' &&
    isLocalListing &&
    isListingOwnedByUser(listing, currentUser);

  if (isOwnedByCurrentUser) {
    return (
      <div className="listing-detail-actions">
        <Link
          href={`/account/listings/${listing.id}/edit`}
          className="listing-management-button listing-management-button--edit listing-detail-edit-button"
        >
          {content.editAdvertisementButton}
        </Link>
      </div>
    );
  }

  if (authStatus === 'checking' && isLocalListing && listing.ownerId) {
    return <div className="listing-detail-actions" aria-busy="true" />;
  }

  return (
    <div className="listing-detail-actions">
      <button type="button" className="search-button listing-contact-button">
        {content.contactSellerButton}
      </button>
    </div>
  );
}
