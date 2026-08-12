import Link from 'next/link';
import BackToResultsLink from '@/app/components/BackToResultsLink';
import ListingImageGallery from '@/app/components/ListingImageGallery';
import ListingMutationRefreshBoundary from '@/app/components/ListingMutationRefreshBoundary';
import ListingStatusBadge from '@/app/components/ListingStatusBadge';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import ListingDetailOwnerActions, {
  type ListingDetailViewerState,
} from '@/app/components/ListingDetailOwnerActions';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { formatListingPrice, getListingStatus } from '@/data/listings';
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
  const marketplaceType = category?.buyTypes?.find(
    (item) => item.slug === listing.marketplaceType
  );
  const transactionType =
    listing.transactionType === 'sale'
      ? content.housingSaleOption
      : listing.transactionType === 'rent'
      ? content.housingRentOption
      : undefined;

  return (
    <article className="listing-detail-page">
      <ListingMutationRefreshBoundary listingIds={[String(listing.id)]} />
      <BackToResultsLink href={backHref} className="page-back-link">
        {backLabel}
      </BackToResultsLink>

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

          <dl className="listing-detail-meta">
            <div>
              <dt>{content.listingDetailSellerLabel}</dt>
              <dd>
                <span className="listing-detail-seller-identity">
                  {sellerPublicSlug ? (
                    <ProfileAvatar
                      avatarPath={sellerAvatarPath}
                      displayName={publicSellerName}
                      size="small"
                      focusX={sellerAvatarFocusX}
                      focusY={sellerAvatarFocusY}
                      zoom={sellerAvatarZoom}
                    />
                  ) : null}
                  {sellerPublicSlug ? (
                    <Link
                      href={`/seller/${sellerPublicSlug}`}
                      className="listing-detail-seller-link"
                    >
                      {publicSellerName}
                    </Link>
                  ) : (
                    publicSellerName
                  )}
                </span>
              </dd>
            </div>
            <div>
              <dt>{content.listingDetailDatePostedLabel}</dt>
              <dd>{listing.datePosted}</dd>
            </div>
            {listing.updatedAt ? (
              <div>
                <dt>{content.listingDetailUpdatedAtLabel}</dt>
                <dd>{listing.updatedAt}</dd>
              </div>
            ) : null}
            <div>
              <dt>{content.listingDetailCategoryLabel}</dt>
              <dd>{category?.name || listing.categorySlug}</dd>
            </div>
            <div>
              <dt>{content.listingDetailSubcategoryLabel}</dt>
              <dd>{subcategory?.name || listing.subcategorySlug}</dd>
            </div>
            {transactionType ? (
              <div>
                <dt>{content.listingDetailTransactionTypeLabel}</dt>
                <dd>{transactionType}</dd>
              </div>
            ) : null}
            {propertyType ? (
              <div>
                <dt>{content.listingDetailPropertyTypeLabel}</dt>
                <dd>{propertyType.name}</dd>
              </div>
            ) : null}
            {marketplaceType ? (
              <div>
                <dt>{content.listingDetailMarketplaceTypeLabel}</dt>
                <dd>{marketplaceType.name}</dd>
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
        </section>
      </div>
    </article>
  );
}
