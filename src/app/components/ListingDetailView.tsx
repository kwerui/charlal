import { Link } from '@/i18n/navigation';
import BackToResultsLink from '@/app/components/BackToResultsLink';
import FavoriteListingButton from '@/app/components/FavoriteListingButton';
import ListingImageGallery from '@/app/components/ListingImageGallery';
import ListingMutationRefreshBoundary from '@/app/components/ListingMutationRefreshBoundary';
import ListingReportButton from '@/app/components/ListingReportButton';
import ListingStatusBadge from '@/app/components/ListingStatusBadge';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import ListingDetailOwnerActions, {
  type ListingDetailViewerState,
} from '@/app/components/ListingDetailOwnerActions';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { formatListingPrice, getListingStatus } from '@/data/listings';
import { getListingFallbackResultsHref } from '@/lib/listingRoutes';
import {
  canOfferListingFavoriteControl,
  getListingFavoriteKey,
  getListingFavoriteReference,
  isKnownOwnDatabaseFavoriteListing,
} from '@/lib/listingFavoriteKeys';
import { resolveListingImage } from '@/lib/listingPlaceholders';

type TypeOption = {
  name: string;
  slug: string;
};

type CategoryWithTypeOptions = {
  name: string;
  slug: string;
  subcategories: TypeOption[];
  types?: TypeOption[];
  buyTypes?: TypeOption[];
};

type Props = {
  listing: Listing;
  categories: CategoryWithTypeOptions[];
  backHref: string;
  sellerName?: string;
  sellerPublicSlug?: string | null;
  sellerAvatarPath?: string | null;
  sellerAvatarFocusX?: number;
  sellerAvatarFocusY?: number;
  sellerAvatarZoom?: number;
  initialViewerState: ListingDetailViewerState;
  savedListingKeys?: string[];
  currentViewerId?: string | null;
  favoriteReturnHref?: string;
};

export default function ListingDetailView({
  listing,
  categories,
  backHref,
  sellerName,
  sellerPublicSlug,
  sellerAvatarPath,
  sellerAvatarFocusX = 50,
  sellerAvatarFocusY = 50,
  sellerAvatarZoom = 100,
  initialViewerState,
  savedListingKeys = [],
  currentViewerId = null,
  favoriteReturnHref,
}: Props) {
  const listingImage = resolveListingImage(listing);
  const listingStatus = getListingStatus(listing);
  const hasDatabaseStatus = listing.status !== undefined;
  const publicSellerName = sellerName || listing.sellerName;
const backLabel =
  backHref === '/'
    ? content.backToHomepage
    : backHref === '/account'
      ? content.backToAccount
      : backHref.startsWith('/seller/')
        ? content.backToSellerProfile
        : backHref.startsWith('/category/')
          ? content.backToCategory
          : content.backToResults;
  const category = categories.find(
    (item) => item.slug === listing.categorySlug
  );
  const subcategory = category?.subcategories.find(
    (item) => item.slug === listing.subcategorySlug
  );
  const propertyType = category?.types?.find(
    (item) => item.slug === listing.propertyType
  );
  const categoryHref = category ? `/category/${category.slug}` : '';
  const subcategoryHref =
    category && subcategory
      ? `/category/${category.slug}/${subcategory.slug}`
      : '';
  const propertyTypeHref = propertyType
    ? getListingFallbackResultsHref(listing)
    : '';
  const favoriteReference = getListingFavoriteReference(listing);
  const isSaved = favoriteReference
    ? savedListingKeys.includes(getListingFavoriteKey(favoriteReference))
    : false;
  const isOwnDatabaseListing = isKnownOwnDatabaseFavoriteListing(
    listing,
    favoriteReference,
    currentViewerId
  );
  const canOfferFavoriteControl = canOfferListingFavoriteControl({
    listing,
    reference: favoriteReference,
    isSaved,
    currentViewerId,
  });
  const reportListingId =
    favoriteReference?.source === 'database'
      ? favoriteReference.listingId
      : null;

  return (
    <article className="listing-detail-page">
      <ListingMutationRefreshBoundary listingIds={[String(listing.id)]} />
      <BackToResultsLink href={backHref} className="page-back-link">
        {backLabel}
      </BackToResultsLink>
      <nav className="listing-detail-breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          {category ? (
            <li>
              <Link href={categoryHref}>{category.name}</Link>
            </li>
          ) : null}
          {category && subcategory ? (
            <li>
              <Link href={subcategoryHref}>{subcategory.name}</Link>
            </li>
          ) : null}
          {propertyType ? (
            <li>
              <Link href={propertyTypeHref}>{propertyType.name}</Link>
            </li>
          ) : null}
        </ol>
      </nav>

      <div className="listing-detail-layout">
        <ListingImageGallery
          images={listing.images || []}
          fallbackImage={listingImage}
          listingTitle={listing.title}
        />

        <section className="listing-detail-panel">
          {hasDatabaseStatus ? (
            <ListingStatusBadge status={listingStatus} showActive />
          ) : null}
          <h1 className="listing-detail-title">{listing.title}</h1>
          <p className="listing-detail-price">{formatListingPrice(listing.price)}</p>
          <p className="listing-detail-location">{listing.location}</p>
          {hasDatabaseStatus && listingStatus === 'reserved' ? (
            <p className="listing-detail-status-note">
              {content.listingReservedDetailMessage}
            </p>
          ) : hasDatabaseStatus && listingStatus === 'sold' ? (
            <p className="listing-detail-status-note">
              {content.listingSoldDetailMessage}
            </p>
          ) : hasDatabaseStatus && listingStatus === 'archived' ? (
            <p className="listing-detail-status-note">
              {content.listingArchivedDetailMessage}
            </p>
          ) : null}

          <section
            className="listing-detail-seller-card"
            aria-labelledby="listing-detail-seller-title"
          >
            <ProfileAvatar
              avatarPath={sellerAvatarPath}
              displayName={publicSellerName}
              size="small"
              focusX={sellerAvatarFocusX}
              focusY={sellerAvatarFocusY}
              zoom={sellerAvatarZoom}
            />
            <div>
              <h2 id="listing-detail-seller-title" className="sr-only">
                {content.listingDetailSellerLabel}
              </h2>
              {sellerPublicSlug ? (
                <Link
                  href={`/seller/${sellerPublicSlug}`}
                  className="listing-detail-seller-link"
                >
                  {publicSellerName}
                </Link>
              ) : (
                <p>{publicSellerName}</p>
              )}
            </div>
          </section>

          <dl className="listing-detail-meta">
            <div>
              <dt>Posted</dt>
              <dd>{listing.datePosted}</dd>
            </div>
            {listing.updatedAt ? (
              <div>
                <dt>Updated</dt>
                <dd>{listing.updatedAt}</dd>
              </div>
            ) : null}
          </dl>

          <section className="listing-detail-description">
            <h2>{content.listingDetailDescriptionTitle}</h2>
            <p>{listing.description}</p>
          </section>

          <ListingDetailOwnerActions
            listing={listing}
            initialViewerState={initialViewerState}
          />
          {canOfferFavoriteControl && favoriteReference ? (
            <FavoriteListingButton
              reference={favoriteReference}
              initiallySaved={isSaved}
              initiallySavedForUserId={currentViewerId}
              variant="detail"
              returnHref={favoriteReturnHref}
            />
          ) : null}
          {reportListingId && !isOwnDatabaseListing ? (
            <ListingReportButton
              listingId={reportListingId}
              returnHref={favoriteReturnHref}
            />
          ) : null}
        </section>
      </div>
    </article>
  );
}
