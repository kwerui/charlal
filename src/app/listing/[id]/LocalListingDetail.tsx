'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ListingDetailView from '@/app/components/ListingDetailView';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import {
  findLocalListingById,
  subscribeToLocalListings,
} from '@/lib/localListings';
import { getListingFallbackResultsHref } from '@/lib/listingRoutes';

type TypeOption = {
  name: string;
  slug: string;
};

type CategoryOption = {
  name: string;
  slug: string;
  subcategories: TypeOption[];
  types?: TypeOption[];
  buyTypes?: TypeOption[];
};

type Props = {
  id: string;
  safeFromHref?: string;
  categories: CategoryOption[];
};

export default function LocalListingDetail({ id, safeFromHref, categories }: Props) {
  const [listing, setListing] = useState<Listing | null>();

  useEffect(() => {
    function refreshListing(): void {
      setListing(findLocalListingById(id) || null);
    }

    const frameId = window.requestAnimationFrame(refreshListing);
    const unsubscribe = subscribeToLocalListings(refreshListing);

    return () => {
      window.cancelAnimationFrame(frameId);
      unsubscribe();
    };
  }, [id]);

  if (listing === undefined) {
    return (
      <div className="app-container">
        <article className="listing-detail-page">
          <p className="page-description">{content.loadingListingMessage}</p>
        </article>
      </div>
    );
  }

  if (listing === null) {
    return (
      <div className="app-container">
        <article className="listing-detail-page">
          <Link href="/" className="page-back-link">
            {content.backToHome}
          </Link>
          <div className="empty-results" role="status">
            <h1>{content.localListingNotFoundTitle}</h1>
            <p>{content.localListingNotFoundMessage}</p>
          </div>
        </article>
      </div>
    );
  }

  const backHref = safeFromHref || getListingFallbackResultsHref(listing);

  return (
    <div className="app-container">
      <ListingDetailView listing={listing} categories={categories} backHref={backHref} />
    </div>
  );
}
