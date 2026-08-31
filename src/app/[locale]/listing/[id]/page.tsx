import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import ListingDetailView from '@/app/components/ListingDetailView';
import { categoryTaxonomy } from '@/content/categoryTaxonomy';
import {
  getCurrentViewerId,
  type CurrentViewerIdResult,
} from '@/lib/auth/server';
import type { ListingDetailViewerState } from '@/app/components/ListingDetailOwnerActions';
import { getListingFallbackResultsHref } from '@/lib/listingRoutes';
import {
  buildHrefWithSearchParams,
  getSafeResultsHref,
} from '@/lib/resultReturnHref';
import { getCurrentUserFavoriteState } from '@/lib/supabase/listingFavorites';
import { getCurrentUserListingReportState } from '@/lib/supabase/listingReports';
import {
  getPublicDatabaseListingById,
  getPublicSellerProfileForListingId,
} from '@/lib/supabase/listingsServer';

type ListingPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getListingDetailViewerState(
  isOwnedByViewer: boolean,
  viewer: CurrentViewerIdResult
): ListingDetailViewerState {
  if (viewer.status === 'signed-in') {
    return isOwnedByViewer ? 'owner' : 'signed-in-non-owner';
  }

  return viewer.status;
}

export default async function ListingPage({ params, searchParams }: ListingPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const t = await getTranslations('ListingDetail');
  const safeFromHref = getSafeResultsHref(query.from);
  const favoriteReturnHref = buildHrefWithSearchParams(`/listing/${id}`, query);
  const favoriteState = await getCurrentUserFavoriteState();
  const databaseListingResult = await getPublicDatabaseListingById(id);

  if (!databaseListingResult.ok) {
    return (
      <div className="app-container">
        <article className="listing-detail-page">
          <div className="empty-results" role="alert">
            <h1>{t('listingDatabaseUnavailableTitle')}</h1>
            <p>{t('databaseListingsLoadFailedMessage')}</p>
          </div>
        </article>
      </div>
    );
  }

  if (!databaseListingResult.listing) {
    notFound();
  }

  const listing = databaseListingResult.listing;
  const [viewer, sellerProfileResult, reportState] = await Promise.all([
    getCurrentViewerId(),
    getPublicSellerProfileForListingId(String(listing.id)),
    getCurrentUserListingReportState(String(listing.id)),
  ]);
  const initialViewerState = getListingDetailViewerState(
    listing.isOwnedByViewer === true,
    viewer
  );
  const backHref = safeFromHref || getListingFallbackResultsHref(listing);
  const sellerPublicProfile = sellerProfileResult.ok
    ? sellerProfileResult.profile
    : null;

  return (
    <div className="app-container">
      <ListingDetailView
        listing={listing}
        categories={categoryTaxonomy}
        backHref={backHref}
        sellerPublicSlug={sellerPublicProfile?.publicSlug || null}
        sellerAvatarPath={sellerPublicProfile?.avatarPath || null}
        sellerAvatarFocusX={sellerPublicProfile?.avatarFocusX ?? 50}
        sellerAvatarFocusY={sellerPublicProfile?.avatarFocusY ?? 50}
        sellerAvatarZoom={sellerPublicProfile?.avatarZoom ?? 100}
        sellerName={sellerPublicProfile?.displayName || undefined}
        initialViewerState={initialViewerState}
        savedListingKeys={favoriteState.savedKeys}
        currentViewerId={favoriteState.userId}
        favoriteReturnHref={favoriteReturnHref}
        initialAlreadyReported={reportState.alreadyReported}
      />
    </div>
  );
}
