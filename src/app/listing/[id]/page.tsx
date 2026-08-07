import { notFound } from 'next/navigation';
import ListingDetailView from '@/app/components/ListingDetailView';
import { content } from '@/content/tyv';
import { listings } from '@/data/listings';
import {
  getCurrentViewerId,
  type CurrentViewerIdResult,
} from '@/lib/auth/server';
import type { ListingDetailViewerState } from '@/app/components/ListingDetailOwnerActions';
import { getListingFallbackResultsHref } from '@/lib/listingRoutes';
import { getSafeResultsHref } from '@/lib/resultReturnHref';
import { getPublicDatabaseListingById } from '@/lib/supabase/listingsServer';
import LocalListingDetail from './LocalListingDetail';

type ListingPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getListingDetailViewerState(
  listingOwnerId: string | undefined,
  viewer: CurrentViewerIdResult
): ListingDetailViewerState {
  if (!listingOwnerId) {
    return 'signed-out';
  }

  if (viewer.status === 'signed-in') {
    return viewer.userId === listingOwnerId ? 'owner' : 'signed-in-non-owner';
  }

  return viewer.status;
}

export default async function ListingPage({ params, searchParams }: ListingPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const builtInListing = listings.find((item) => String(item.id) === id);
  const safeFromHref = getSafeResultsHref(query.from);

  if (builtInListing) {
    const backHref =
      safeFromHref || getListingFallbackResultsHref(builtInListing);

    return (
      <div className="app-container">
        <ListingDetailView
          listing={builtInListing}
          categories={content.categories}
          backHref={backHref}
          initialViewerState="signed-out"
        />
      </div>
    );
  }

  const databaseListingResult = await getPublicDatabaseListingById(id);

  if (!databaseListingResult.ok) {
    return (
      <div className="app-container">
        <article className="listing-detail-page">
          <div className="empty-results" role="alert">
            <h1>{content.listingDatabaseUnavailableTitle}</h1>
            <p>{content.databaseListingsLoadFailedMessage}</p>
          </div>
        </article>
      </div>
    );
  }

  if (!databaseListingResult.listing) {
    if (id.startsWith('local-')) {
      return (
        <LocalListingDetail
          id={id}
          safeFromHref={safeFromHref}
          categories={content.categories}
        />
      );
    }

    notFound();
  }

  const listing = databaseListingResult.listing;
  const viewer = await getCurrentViewerId();
  const initialViewerState = getListingDetailViewerState(
    listing.ownerId,
    viewer
  );
  const backHref = safeFromHref || getListingFallbackResultsHref(listing);

  return (
    <div className="app-container">
      <ListingDetailView
        listing={listing}
        categories={content.categories}
        backHref={backHref}
        initialViewerState={initialViewerState}
      />
    </div>
  );
}
