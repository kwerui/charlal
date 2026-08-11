'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { useAuthStatus } from '@/lib/auth/client';
import { recordEditNavigation } from '@/lib/editNavigationStorage';
import { isListingOwnedByUser } from '@/lib/listingOwnership';

export type ListingDetailViewerState =
  | 'owner'
  | 'signed-in-non-owner'
  | 'signed-out'
  | 'unresolved';

type Props = {
  listing: Listing;
  initialViewerState: ListingDetailViewerState;
};

export default function ListingDetailOwnerActions({
  listing,
  initialViewerState,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status: authStatus, user: currentUser } = useAuthStatus();
  const currentSearch = searchParams.toString();
  const currentHref = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const editHref = `/account/listings/${listing.id}/edit?from=${encodeURIComponent(
    currentHref
  )}`;
  const isDatabaseListing =
    typeof listing.id === 'string' && listing.id.startsWith('db-');
  const hasDatabaseSeller = isDatabaseListing && Boolean(listing.ownerId);
  const viewerState: ListingDetailViewerState = !hasDatabaseSeller
    ? 'signed-out'
    : authStatus === 'authenticated'
    ? isListingOwnedByUser(listing, currentUser)
      ? 'owner'
      : 'signed-in-non-owner'
    : authStatus === 'unauthenticated'
    ? 'signed-out'
    : initialViewerState;

  if (hasDatabaseSeller && viewerState === 'owner') {
    return (
      <div className="listing-detail-actions">
        <Link
          href={{
            pathname: `/account/listings/${listing.id}/edit`,
            query: { from: currentHref },
          }}
          className="listing-detail-owner-button listing-detail-owner-button--edit"
          onClick={() => recordEditNavigation(editHref, currentHref)}
        >
          {content.editAdvertisementButton}
        </Link>
      </div>
    );
  }

  if (viewerState === 'unresolved') {
    return (
      <div className="listing-detail-actions" aria-busy="true">
        <div className="listing-detail-action-skeleton" aria-hidden="true" />
      </div>
    );
  }

  if (hasDatabaseSeller) {
    return (
      <div className="listing-detail-actions">
        <Link
          href={`/contact/${listing.id}`}
          className="search-button listing-contact-button"
        >
          {content.contactSellerButton}
        </Link>
      </div>
    );
  }

  return (
    <div className="listing-detail-actions">
      <p className="listing-messaging-unavailable">
        {content.demoListingMessagingUnavailableMessage}
      </p>
    </div>
  );
}
