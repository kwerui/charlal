import Link from 'next/link';
import Image from 'next/image';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { formatListingPrice } from '@/data/listings';

type Props = {
  listing: Listing;
};

export default function ListingCard({ listing }: Props) {
  return (
    <Link
      href={`/listing/${listing.id}`}
      className="listing-card"
      aria-label={`${content.openListingLabel}: ${listing.title}`}
    >
      <span className="listing-image-wrapper">
        <Image
          className="listing-image"
          src={listing.image}
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
    </Link>
  );
}
