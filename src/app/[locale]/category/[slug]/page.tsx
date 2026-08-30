import { Link } from '@/i18n/navigation';
import { notFound } from 'next/navigation';
import ListingResults from '@/app/components/ListingResults';
import { content } from '@/content/tyv';
import { getCurrentUserFavoriteState } from '@/lib/supabase/listingFavorites';
import { listPublicDatabaseListings } from '@/lib/supabase/listingsServer';
import CategoryHeroControls from './CategoryHeroControls';

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams(): { slug: string }[] {
  return content.categories.map((category) => ({
    slug: category.slug,
  }));
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = content.categories.find((item) => item.slug === slug);
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
    : content.databaseListingsLoadFailedMessage;

  return (
    <div className="app-container">
      <section className="category-page">
        <Link href="/" className="page-back-link">
          {content.backToHome}
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
              <p className="hero-kicker">{content.categoryPageTitle}</p>
              <h2 className="page-title">{category.name}</h2>
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
            <h2 id="category-latest-listings">{content.latestListingsTitle}</h2>
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
