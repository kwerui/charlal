import Image from 'next/image';
import { notFound } from 'next/navigation';
import BackToResultsLink from '@/app/components/BackToResultsLink';
import { content } from '@/content/tyv';
import { formatListingPrice, listings } from '@/data/listings';
import { getSafeResultsHref } from '@/lib/resultReturnHref';

type ListingPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

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

function getBackHref(listingCategorySlug: string, listingSubcategorySlug: string, propertyType?: string) {
  if (listingCategorySlug === 'housing' && propertyType) {
    return `/category/housing/${listingSubcategorySlug}?propertyType=${propertyType}`;
  }

  return `/category/${listingCategorySlug}/${listingSubcategorySlug}`;
}

export default async function ListingPage({ params, searchParams }: ListingPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const listingId = Number(id);
  const listing = listings.find((item) => item.id === listingId);

  if (!listing) {
    notFound();
  }

  const category = content.categories.find(
    (item) => item.slug === listing.categorySlug
  ) as CategoryWithTypeOptions | undefined;
  const subcategory = category?.subcategories.find((item) => item.slug === listing.subcategorySlug);
  const propertyType = category?.types?.find((item) => item.slug === listing.propertyType);
  const marketplaceType = category?.buyTypes?.find((item) => item.slug === listing.marketplaceType);
  const transactionType =
    listing.transactionType === 'sale'
      ? content.housingSaleOption
      : listing.transactionType === 'rent'
      ? content.housingRentOption
      : undefined;
  const fallbackBackHref = getBackHref(
    listing.categorySlug,
    listing.subcategorySlug,
    listing.propertyType
  );
  const backHref = getSafeResultsHref(query.from) || fallbackBackHref;

  return (
    <div className="app-container">
      <article className="listing-detail-page">
        <BackToResultsLink
          href={backHref}
          className="page-back-link"
        >
          {content.backToResults}
        </BackToResultsLink>

        <div className="listing-detail-layout">
          <div className="listing-detail-image-wrapper">
            <Image
              className="listing-detail-image"
              src={listing.image}
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
                <dd>{listing.sellerName}</dd>
              </div>
              <div>
                <dt>{content.listingDetailDatePostedLabel}</dt>
                <dd>{listing.datePosted}</dd>
              </div>
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

            <button type="button" className="search-button listing-contact-button">
              {content.contactSellerButton}
            </button>
          </section>
        </div>
      </article>
    </div>
  );
}
