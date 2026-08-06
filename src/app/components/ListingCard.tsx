import Link from 'next/link';
import Image from 'next/image';
import ListingCardLink from '@/app/components/ListingCardLink';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { formatListingPrice } from '@/data/listings';
import { resolveListingImage } from '@/lib/listingPlaceholders';

type Props = {
  listing: Listing;
  fromHref?: string;
};

export default function ListingCard({ listing, fromHref }: Props) {
  const listingPath = `/listing/${listing.id}`;
  const listingImage = resolveListingImage(listing);
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
        <h3 className="listing-title">{listing.title}</h3>
        <p className="listing-price">{formatListingPrice(listing.price)}</p>
        <p className="listing-location">{listing.location}</p>
      </div>
    </>
  );

  if (fromHref) {
    return (
      <ListingCardLink
        href={listingHref}
        fromHref={fromHref}
        className="listing-card"
        ariaLabel={`${content.openListingLabel}: ${listing.title}`}
      >
        {cardContent}
      </ListingCardLink>
    );
  }

  return (
    <Link
      href={listingPath}
      className="listing-card"
      aria-label={`${content.openListingLabel}: ${listing.title}`}
    >
      {cardContent}
    </Link>
  );
}
