'use client';

import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import FavoriteListingButton from '@/app/components/FavoriteListingButton';
import ListingCardLink from '@/app/components/ListingCardLink';
import ListingStatusBadge from '@/app/components/ListingStatusBadge';
import type { Listing } from '@/data/listings';
import { getListingStatus } from '@/data/listings';
import {
  canOfferListingFavoriteControl,
  getListingFavoriteKey,
  getListingFavoriteReference,
} from '@/lib/listingFavoriteKeys';
import { resolveListingImage } from '@/lib/listingPlaceholders';

type Props = {
  listing: Listing;
  listingHref?: string;
  fromHref?: string;
  showActiveStatus?: boolean;
  savedListingKeys?: string[];
  currentViewerId?: string | null;
  onFavoriteRemoved?: (listingId: string) => void;
};

export default function ListingCard({
  listing,
  listingHref: listingHrefOverride,
  fromHref,
  showActiveStatus = false,
  savedListingKeys = [],
  currentViewerId = null,
  onFavoriteRemoved,
}: Props) {
  const t = useTranslations('ListingCard');
  const listingPath = listingHrefOverride || `/listing/${listing.id}`;
  const listingImage = resolveListingImage(listing);
  const listingStatus = getListingStatus(listing);
  const favoriteReference = getListingFavoriteReference(listing);
  const isSaved = favoriteReference
    ? savedListingKeys.includes(getListingFavoriteKey(favoriteReference))
    : false;
  const canOfferFavoriteControl = canOfferListingFavoriteControl({
    listing,
    reference: favoriteReference,
    isSaved,
    currentViewerId,
  });
  const listingHref = fromHref
    ? {
        pathname: listingPath,
        query: { from: fromHref },
      }
    : listingPath;

  const cardContent = (
    <>
      <span className="listing-image-wrapper">
        <Image
          className="listing-image"
          src={listingImage}
          alt={listing.title}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </span>
      <div className="listing-info">
        <ListingStatusBadge
          status={listingStatus}
          showActive={showActiveStatus}
        />
        <h3 className="listing-title">{listing.title}</h3>
        <p className="listing-price">
          {listing.price === 0
            ? t('freePriceLabel')
            : new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                maximumFractionDigits: 0,
              }).format(listing.price)}
        </p>
        <p className="listing-location">{listing.location}</p>
      </div>
    </>
  );

  const favoriteControl = canOfferFavoriteControl && favoriteReference ? (
    <FavoriteListingButton
      reference={favoriteReference}
      initiallySaved={isSaved}
      initiallySavedForUserId={currentViewerId}
      returnHref={fromHref}
      onRemoved={
        onFavoriteRemoved
          ? () => onFavoriteRemoved(String(listing.id))
          : undefined
      }
    />
  ) : null;

  const cardLink = fromHref ? (
      <ListingCardLink
        href={listingHref}
        fromHref={fromHref}
        className="listing-card"
        ariaLabel={`${t('openListingLabel')}: ${listing.title}`}
      >
        {cardContent}
      </ListingCardLink>
  ) : (
    <Link
      href={listingPath}
      className="listing-card"
      aria-label={`${t('openListingLabel')}: ${listing.title}`}
    >
      {cardContent}
    </Link>
  );

  return (
    <article
      className={
        favoriteControl
          ? 'listing-card-shell listing-card-shell--has-favorite'
          : 'listing-card-shell'
      }
    >
      {cardLink}
      {favoriteControl}
    </article>
  );
}
