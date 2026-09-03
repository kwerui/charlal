'use client';

import { Link } from '@/i18n/navigation';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Listing } from '@/data/listings';
import { useAuthStatus } from '@/lib/auth/client';
import { recordEditNavigation } from '@/lib/editNavigationStorage';
import { getListingStatus } from '@/data/listings';
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
  const t = useTranslations('ListingOwnerActions');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status: authStatus, user: currentUser } = useAuthStatus();
  const currentSearch = searchParams.toString();
  const currentHref = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const editHref = `/account/listings/${listing.id}/edit?from=${encodeURIComponent(
    currentHref
  )}`;
  const listingStatus = getListingStatus(listing);
  const isDatabaseListing =
    typeof listing.id === 'string' && listing.id.startsWith('db-');
  const hasDatabaseSeller = isDatabaseListing;
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
          {t('editAdvertisementButton')}
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

  if (listingStatus === 'sold' || listingStatus === 'archived') {
    return (
      <div className="listing-detail-actions">
        <p className="listing-messaging-unavailable">
          {listingStatus === 'sold'
            ? t('soldMessagingUnavailableMessage')
            : t('archivedMessagingUnavailableMessage')}
        </p>
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
          {t('contactSellerButton')}
        </Link>
      </div>
    );
  }

  return (
    <div className="listing-detail-actions">
      <p className="listing-messaging-unavailable">
        {t('demoListingMessagingUnavailableMessage')}
      </p>
    </div>
  );
}
