import Link from 'next/link';
import { notFound } from 'next/navigation';
import ListingResults from '@/app/components/ListingResults';
import { content } from '@/content/tyv';
import { listings } from '@/data/listings';
import { buildHrefWithSearchParams } from '@/lib/resultReturnHref';
import { getCurrentUserFavoriteState } from '@/lib/supabase/listingFavorites';
import { listPublicDatabaseListings } from '@/lib/supabase/listingsServer';
import HousingFilterControls from './HousingFilterControls';
import MarketplaceBuyTypeDropdown from './MarketplaceBuyTypeDropdown';
import PriceFilterControls from './PriceFilterControls';

type TypeOption = {
  name: string;
  slug: string;
};

type CategoryWithTypeOptions = {
  types?: TypeOption[];
  buyTypes?: TypeOption[];
};

type SubcategoryPageProps = {
  params: Promise<{ slug: string; subcategory: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SubcategoryPage({ params, searchParams }: SubcategoryPageProps) {
  const { slug, subcategory } = await params;
  const query = await searchParams;
  const resultsHref = buildHrefWithSearchParams(`/category/${slug}/${subcategory}`, query);
  const category = content.categories.find((item) => item.slug === slug);

  if (!category) {
    notFound();
  }

  const typedCategory = category as typeof category & CategoryWithTypeOptions;
  const typeData = typedCategory.types?.find((item) => item.slug === subcategory);
  const subcategoryData = category.subcategories.find((item) => item.slug === subcategory) || typeData;
  const isAllPage = subcategory === 'all';
  const isHousingFilterPage =
    category.slug === 'housing' &&
    (isAllPage || subcategory === 'sale' || subcategory === 'rent' || Boolean(typeData));
  const marketplaceBuyTypes = typedCategory.buyTypes || [];
  const rawSelectedType = query.type;
  const rawPropertyType = query.propertyType;
  const rawTransaction = query.transaction;
  const selectedTypeSlug = Array.isArray(rawSelectedType)
    ? rawSelectedType[0] || ''
    : rawSelectedType || '';
  const selectedPropertyTypeFromQuery = Array.isArray(rawPropertyType)
    ? rawPropertyType[0] || ''
    : rawPropertyType || '';
  const selectedTransactionFromQuery = Array.isArray(rawTransaction)
    ? rawTransaction[0] || ''
    : rawTransaction || '';
  const rawMinPrice = query.minPrice;
  const rawMaxPrice = query.maxPrice;
  const rawSearchQuery = query.q;
  const selectedMinPrice = Array.isArray(rawMinPrice)
    ? rawMinPrice[0] || ''
    : rawMinPrice || '';
  const selectedMaxPrice = Array.isArray(rawMaxPrice)
    ? rawMaxPrice[0] || ''
    : rawMaxPrice || '';
  const selectedSearchQuery = Array.isArray(rawSearchQuery)
    ? rawSearchQuery[0] || ''
    : rawSearchQuery || '';
  const selectedBuyType =
    category.slug === 'marketplace' && subcategory === 'buy'
      ? marketplaceBuyTypes.find((typeItem) => typeItem.slug === selectedTypeSlug)
      : undefined;
  const showMarketplaceBuyTypes = category.slug === 'marketplace' && subcategory === 'buy';
  const validQueryPropertyType =
    selectedPropertyTypeFromQuery === 'all' ||
    Boolean(typedCategory.types?.some((typeItem) => typeItem.slug === selectedPropertyTypeFromQuery));
  const housingTransactionValue =
    category.slug === 'housing'
      ? subcategory === 'sale' || subcategory === 'rent'
        ? subcategory
        : selectedTransactionFromQuery === 'all'
        ? 'all'
        : ''
      : '';
  const housingPropertyTypeValue =
    category.slug === 'housing'
      ? typeData?.slug || (validQueryPropertyType ? selectedPropertyTypeFromQuery : '')
      : '';
  const housingTransaction = housingTransactionValue || 'all';
  const selectedHousingPropertyType = housingPropertyTypeValue || 'all';

  if (!subcategoryData && !isAllPage && !isHousingFilterPage) {
    notFound();
  }

  const subcategoryLabel = isAllPage ? content.viewAllLabel : subcategoryData?.name;
  const selectedHousingPropertyTypeData = typedCategory.types?.find(
    (typeItem) => typeItem.slug === selectedHousingPropertyType
  );
  const housingTransactionLabel =
    housingTransaction === 'sale'
      ? content.housingSaleOption
      : housingTransaction === 'rent'
      ? content.housingRentOption
      : content.housingAllOption;
  const activeListingLabel = selectedBuyType
    ? `${subcategoryLabel} · ${selectedBuyType.name}`
    : category.slug === 'housing'
    ? selectedHousingPropertyTypeData
      ? `${selectedHousingPropertyTypeData.name} · ${housingTransactionLabel}`
      : housingTransactionLabel
    : subcategoryLabel;
  const selectedMarketplaceType =
    showMarketplaceBuyTypes && selectedBuyType && selectedTypeSlug !== 'all-categories'
      ? selectedBuyType.slug
      : '';
  const preservedHousingParams: Record<string, string> = {};
  const preservedListingFilterParams: Record<string, string> = {
    q: selectedSearchQuery,
    minPrice: selectedMinPrice,
    maxPrice: selectedMaxPrice,
  };

  if (category.slug === 'housing') {
    if (housingTransactionValue === 'all') {
      preservedHousingParams.transaction = 'all';
    }

    if (
      housingPropertyTypeValue &&
      (housingTransactionValue === 'sale' ||
        housingTransactionValue === 'rent' ||
        housingPropertyTypeValue === 'all')
    ) {
      preservedHousingParams.propertyType = housingPropertyTypeValue;
    }
  }

  const preservedMarketplaceTypeParams: Record<string, string> =
    showMarketplaceBuyTypes && selectedTypeSlug ? { type: selectedTypeSlug } : {};
  const preservedPriceFilterParams: Record<string, string> = showMarketplaceBuyTypes
    ? { ...preservedMarketplaceTypeParams, q: selectedSearchQuery }
    : { ...preservedHousingParams, q: selectedSearchQuery };
  const preservedSearchParams: Record<string, string> = showMarketplaceBuyTypes
    ? {
        ...preservedMarketplaceTypeParams,
        minPrice: selectedMinPrice,
        maxPrice: selectedMaxPrice,
      }
    : {
        ...preservedHousingParams,
        minPrice: selectedMinPrice,
        maxPrice: selectedMaxPrice,
      };
  const preservedTypeFilterParams: Record<string, string> = {
    q: selectedSearchQuery,
    minPrice: selectedMinPrice,
    maxPrice: selectedMaxPrice,
  };
  const [databaseListingsResult, favoriteState] = await Promise.all([
    listPublicDatabaseListings({
      categorySlug: category.slug,
      subcategorySlug: subcategory,
      isAllPage,
      housingTransaction,
      housingPropertyType: selectedHousingPropertyType,
      marketplaceType: selectedMarketplaceType,
      minPrice: selectedMinPrice,
      maxPrice: selectedMaxPrice,
      searchQuery: selectedSearchQuery,
    }),
    getCurrentUserFavoriteState(),
  ]);
  const databaseListings = databaseListingsResult.ok
    ? databaseListingsResult.listings
    : [];
  const databaseError = databaseListingsResult.ok
    ? ''
    : content.databaseListingsLoadFailedMessage;

  return (
    <div className="app-container">
      <section className="category-page">
        <div className="page-nav-buttons">
          <Link href="/" className="explore-button">
            {content.backToCategories}
          </Link>
          <Link href={`/category/${category.slug}`} className="secondary-button">
            {content.backToCategory}
          </Link>
        </div>

        <div className="category-hero has-image" style={{ backgroundImage: `linear-gradient(135deg, rgba(17,24,39,0.72), rgba(37,99,235,0.5)), url(${category.image})` }}>
          <div className="category-hero-inner">
            <div className="category-hero-copy">
              <p className="hero-kicker">{content.categoryPageTitle}</p>
              <h2 className="page-title">
                {category.name} · {activeListingLabel}
              </h2>
            </div>
            {showMarketplaceBuyTypes ? (
              <MarketplaceBuyTypeDropdown
                basePath={`/category/${category.slug}/${subcategory}`}
                options={marketplaceBuyTypes}
                selectedValue={selectedBuyType?.slug || ''}
                preservedParams={preservedTypeFilterParams}
              />
            ) : null}
          </div>
        </div>

        <div className="category-page-content">
          {category.slug === 'housing' ? (
            <HousingFilterControls
              propertyTypeOptions={typedCategory.types || []}
              transactionValue={housingTransactionValue}
              propertyTypeValue={housingPropertyTypeValue}
              preservedParams={preservedListingFilterParams}
            />
          ) : null}

          <PriceFilterControls
            basePath={`/category/${category.slug}/${subcategory}`}
            minPrice={selectedMinPrice}
            maxPrice={selectedMaxPrice}
            searchQuery={selectedSearchQuery}
            preservedPriceParams={preservedPriceFilterParams}
            preservedSearchParams={preservedSearchParams}
          />

          <ListingResults
            builtInListings={listings}
            databaseListings={databaseListings}
            databaseError={databaseError}
            savedListingKeys={favoriteState.savedKeys}
            currentViewerId={favoriteState.userId}
            criteria={{
              categorySlug: category.slug,
              subcategorySlug: subcategory,
              isAllPage,
              housingTransaction,
              housingPropertyType: selectedHousingPropertyType,
              marketplaceType: selectedMarketplaceType,
              minPrice: selectedMinPrice,
              maxPrice: selectedMaxPrice,
              searchQuery: selectedSearchQuery,
            }}
            resultsHref={resultsHref}
          />
        </div>
      </section>
    </div>
  );
}
