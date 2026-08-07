import Image from 'next/image';
import BackToResultsLink from '@/app/components/BackToResultsLink';
import ListingDetailOwnerActions, {
  type ListingDetailViewerState,
} from '@/app/components/ListingDetailOwnerActions';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { formatListingPrice } from '@/data/listings';
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
  initialViewerState: ListingDetailViewerState;
};

export default function ListingDetailView({
  listing,
  categories,
  backHref,
  sellerName,
  initialViewerState,
}: Props) {
  const listingImage = resolveListingImage(listing);
  const publicSellerName = sellerName || listing.sellerName;
  const backLabel =
    backHref === '/'
      ? content.backToHomepage
      : backHref === '/account'
      ? content.backToAccount
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
      <BackToResultsLink href={backHref} className="page-back-link">
        {backLabel}
      </BackToResultsLink>

      <div className="listing-detail-layout">
        <div className="listing-detail-image-wrapper">
          <Image
            className="listing-detail-image"
            src={listingImage}
            alt={listing.title}
            fill
            sizes="(max-width: 768px) 100vw, 55vw"
            priority
          />
        </div>

        <section className="listing-detail-panel">
          <h1 className="listing-detail-title">{listing.title}</h1>
          <p className="listing-detail-price">{formatListingPrice(listing.price)}</p>
          <p className="listing-detail-location">{listing.location}</p>

          <dl className="listing-detail-meta">
            <div>
              <dt>{content.listingDetailSellerLabel}</dt>
              <dd>{publicSellerName}</dd>
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
