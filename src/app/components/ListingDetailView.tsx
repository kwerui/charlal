import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
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
import type { CategoryTaxonomyItem, TaxonomyOption } from '@/content/categoryTaxonomy';
import type { Listing } from '@/data/listings';
import { getListingStatus } from '@/data/listings';
import { getListingFallbackResultsHref } from '@/lib/listingRoutes';
import {
  canOfferListingFavoriteControl,
  getListingFavoriteKey,
  getListingFavoriteReference,
  isKnownOwnDatabaseFavoriteListing,
} from '@/lib/listingFavoriteKeys';
import { resolveListingImage } from '@/lib/listingPlaceholders';

type Props = {
  listing: Listing;
  categories: CategoryTaxonomyItem[];
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
  initialAlreadyReported?: boolean;
};

function formatPrice(price: number, freePriceLabel: string): string {
  if (price === 0) {
    return freePriceLabel;
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
}

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
  initialAlreadyReported = false,
}: Props) {
  const t = useTranslations('ListingDetail');
  const categoriesT = useTranslations('Categories');
  const listingImage = resolveListingImage(listing);
  const listingStatus = getListingStatus(listing);
  const hasDatabaseStatus = listing.status !== undefined;
  const publicSellerName = sellerName || listing.sellerName;
  const backLabel =
    backHref === '/'
      ? t('backToHomepage')
      : backHref === '/account'
      ? t('backToAccount')
      : backHref.startsWith('/seller/')
      ? t('backToSellerProfile')
      : backHref.startsWith('/category/')
      ? t('backToCategory')
      : t('backToResults');
  const category = categories.find(
    (item) => item.slug === listing.categorySlug
  );
  const subcategory: TaxonomyOption | undefined = category?.subcategories.find(
    (item) => item.slug === listing.subcategorySlug
  );
  const propertyType: TaxonomyOption | undefined = category?.types?.find(
    (item) => item.slug === listing.propertyType
  );
  const marketplaceType: TaxonomyOption | undefined = category?.buyTypes?.find(
    (item) => item.slug === listing.marketplaceType
  );
  const detailType = propertyType || marketplaceType;
  const detailTypeMessageGroup = propertyType ? 'types' : 'buyTypes';
  const categoryHref = category ? `/category/${category.slug}` : '';
  const subcategoryHref =
    category && subcategory
      ? `/category/${category.slug}/${subcategory.slug}`
      : '';
  const detailTypeHref = detailType
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
  const priceLabel = formatPrice(listing.price, t('freePriceLabel'));

  return (
    <article className="listing-detail-page">
      <ListingMutationRefreshBoundary listingIds={[String(listing.id)]} />
      <BackToResultsLink href={backHref} className="page-back-link">
        {backLabel}
      </BackToResultsLink>
      <nav className="listing-detail-breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">{t('homeBreadcrumb')}</Link>
          </li>
          {category ? (
            <li>
              <Link href={categoryHref}>
                {categoriesT(`items.${category.slug}.label`)}
              </Link>
            </li>
          ) : null}
          {category && subcategory ? (
            <li>
              <Link href={subcategoryHref}>
                {categoriesT(
                  `items.${category.slug}.subcategories.${subcategory.slug}`
                )}
              </Link>
            </li>
          ) : null}
          {category && detailType ? (
            <li>
              <Link href={detailTypeHref}>
                {categoriesT(
                  `items.${category.slug}.${detailTypeMessageGroup}.${detailType.slug}`
                )}
              </Link>
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
          <p className="listing-detail-price">{priceLabel}</p>
          <p className="listing-detail-location">{listing.location}</p>
          {hasDatabaseStatus && listingStatus === 'reserved' ? (
            <p className="listing-detail-status-note">
              {t('listingReservedDetailMessage')}
            </p>
          ) : hasDatabaseStatus && listingStatus === 'sold' ? (
            <p className="listing-detail-status-note">
              {t('listingSoldDetailMessage')}
            </p>
          ) : hasDatabaseStatus && listingStatus === 'archived' ? (
            <p className="listing-detail-status-note">
              {t('listingArchivedDetailMessage')}
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
                {t('sellerLabel')}
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
              <dt>{t('datePostedLabel')}</dt>
              <dd>{listing.datePosted}</dd>
            </div>
            {listing.updatedAt ? (
              <div>
                <dt>{t('updatedAtLabel')}</dt>
                <dd>{listing.updatedAt}</dd>
              </div>
            ) : null}
          </dl>

          <section className="listing-detail-description">
            <h2>{t('descriptionTitle')}</h2>
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
              key={reportListingId}
              listingId={reportListingId}
              returnHref={favoriteReturnHref}
              initialAlreadyReported={initialAlreadyReported}
            />
          ) : null}
        </section>
      </div>
    </article>
  );
}
