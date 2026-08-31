import { Link } from '@/i18n/navigation';
import { notFound } from 'next/navigation';
import ListingResults from '@/app/components/ListingResults';
import { categoryTaxonomy, findCategoryTaxonomy } from '@/content/categoryTaxonomy';
import { getCurrentUserFavoriteState } from '@/lib/supabase/listingFavorites';
import { listPublicDatabaseListings } from '@/lib/supabase/listingsServer';
import { getTranslations } from 'next-intl/server';
import CategoryHeroControls from './CategoryHeroControls';

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams(): { slug: string }[] {
  return categoryTaxonomy.map((category) => ({
    slug: category.slug,
  }));
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const categoryPageT = await getTranslations('CategoryPage');
  const categoriesT = await getTranslations('Categories');
  const { slug } = await params;
  const category = findCategoryTaxonomy(slug);
  const showSearchBar =
    category?.slug === 'housing' ||
    category?.slug === 'marketplace' ||
    category?.slug === 'services' ||
    category?.slug === 'jobs';
  const showHeroSubcategories = category ? category.slug !== 'services' : false;

  if (!category) {
    notFound();
  }

  const [databaseListingsResult, favoriteState] = await Promise.all([
    listPublicDatabaseListings({
      categorySlug: category.slug,
      housingTransaction: category.slug === 'housing' ? 'all' : undefined,
      housingPropertyType: category.slug === 'housing' ? 'all' : undefined,
      limit: 6,
    }),
    getCurrentUserFavoriteState(),
  ]);
  const databaseListings = databaseListingsResult.ok
    ? databaseListingsResult.listings
    : [];
  const databaseError = databaseListingsResult.ok
    ? ''
    : categoryPageT('databaseListingsLoadFailedMessage');
  const categoryLabel = categoriesT(`items.${category.slug}.label`);

  return (
    <div className="app-container">
      <section className="category-page">
        <Link href="/" className="page-back-link">
          {categoryPageT('backToHome')}
        </Link>

        <section
          className={`category-hero${category.image ? ' has-image' : ''}`}
          data-slug={category.slug}
          style={
            category.image
              ? {
                  backgroundImage: `linear-gradient(135deg, rgba(17,24,39,0.72), rgba(37,99,235,0.5)), url(${category.image})`
                }
              : undefined
          }
        >
          <div className="category-hero-inner">
            <div className="category-hero-copy">
              <h2 className="page-title">{categoryLabel}</h2>
            </div>

            <div className="category-hero-controls">
              <CategoryHeroControls
                category={category}
                showHeroSubcategories={showHeroSubcategories}
                showSearchBar={showSearchBar}
              />
            </div>
          </div>
        </section>

        <section className="category-listings-section" aria-labelledby="category-latest-listings">
          <div className="category-section-heading">
            <h2 id="category-latest-listings">{categoryPageT('latestListingsTitle')}</h2>
          </div>
          <ListingResults
            databaseListings={databaseListings}
            databaseError={databaseError}
            savedListingKeys={favoriteState.savedKeys}
            currentViewerId={favoriteState.userId}
            criteria={{
              categorySlug: category.slug,
              isAllPage: true,
              housingTransaction: category.slug === 'housing' ? 'all' : undefined,
              housingPropertyType: category.slug === 'housing' ? 'all' : undefined,
            }}
            resultsHref={`/category/${category.slug}`}
            limit={6}
            showResultsSummary={false}
            showEmptyState={false}
          />
        </section>

      </section>
    </div>
  );
}
