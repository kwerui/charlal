import Link from 'next/link';
import Image from 'next/image';
import FavoriteListingButton from '@/app/components/FavoriteListingButton';
import ListingCardLink from '@/app/components/ListingCardLink';
import ListingStatusBadge from '@/app/components/ListingStatusBadge';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { formatListingPrice, getListingStatus } from '@/data/listings';
import {
  getListingFavoriteKey,
  getListingFavoriteReference,
} from '@/lib/listingFavoriteKeys';
import { resolveListingImage } from '@/lib/listingPlaceholders';

type Props = {
  listing: Listing;
  fromHref?: string;
  showActiveStatus?: boolean;
  savedListingKeys?: string[];
  currentViewerId?: string | null;
  onFavoriteRemoved?: (listingId: string) => void;
};

export default function ListingCard({
  listing,
  fromHref,
  showActiveStatus = false,
  savedListingKeys = [],
  currentViewerId = null,
  onFavoriteRemoved,
}: Props) {
  const listingPath = `/listing/${listing.id}`;
  const listingImage = resolveListingImage(listing);
  const listingStatus = getListingStatus(listing);
  const favoriteReference = getListingFavoriteReference(listing);
  const isSaved = favoriteReference
    ? savedListingKeys.includes(getListingFavoriteKey(favoriteReference))
    : false;
  const isOwnDatabaseListing =
    favoriteReference?.source === 'database' &&
    Boolean(listing.ownerId) &&
    listing.ownerId === currentViewerId;
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
        <p className="listing-price">{formatListingPrice(listing.price)}</p>
        <p className="listing-location">{listing.location}</p>
      </div>
    </>
  );

  const favoriteControl = favoriteReference && !isOwnDatabaseListing ? (
    <FavoriteListingButton
      reference={favoriteReference}
      initiallySaved={isSaved}
      initiallySavedForUserId={currentViewerId}
      returnHref={fromHref}
      onRemoved={() => onFavoriteRemoved?.(String(listing.id))}
    />
  ) : null;

  const cardLink = fromHref ? (
      <ListingCardLink
        href={listingHref}
        fromHref={fromHref}
        className="listing-card"
        ariaLabel={`${content.openListingLabel}: ${listing.title}`}
      >
        {cardContent}
      </ListingCardLink>
  ) : (
    <Link
      href={listingPath}
      className="listing-card"
      aria-label={`${content.openListingLabel}: ${listing.title}`}
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
