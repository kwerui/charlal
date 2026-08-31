import { Link } from '@/i18n/navigation';
import ListingResults from '@/app/components/ListingResults';
import SearchForm from '@/app/components/SearchForm';
import { categoryTaxonomy } from '@/content/categoryTaxonomy';
import { getCurrentUserFavoriteState } from '@/lib/supabase/listingFavorites';
import { listPublicDatabaseListings } from '@/lib/supabase/listingsServer';
import { getTranslations } from 'next-intl/server';

/**
 * Tuvan Marketplace Homepage
 */

export default async function Home(): Promise<React.ReactNode> {
  const homeT = await getTranslations('Home');
  const categoriesT = await getTranslations('Categories');
  const [databaseListingsResult, favoriteState] = await Promise.all([
    listPublicDatabaseListings({ limit: 6 }),
    getCurrentUserFavoriteState(),
  ]);
  const databaseListings = databaseListingsResult.ok
    ? databaseListingsResult.listings
    : [];
  const databaseError = databaseListingsResult.ok
    ? ''
    : homeT('databaseListingsLoadFailedMessage');

  return (
    <div className="app-container">
      <SearchForm />

      <section className="categories-section">
        <div className="categories-container">
          {categoryTaxonomy.map((category) => {
            const categoryLabel = categoriesT(`items.${category.slug}.label`);

            return (
            <Link
              key={category.slug}
              href={`/category/${category.slug}`}
              className={`category-button ${category.image ? 'has-image' : ''}`}
              aria-label={homeT('categoryAriaLabel', { category: categoryLabel })}
              title={categoryLabel}
              style={category.image ? { backgroundImage: `url(${category.image})` } : undefined}
            >
              <span className="category-label">{categoryLabel}</span>
            </Link>
            );
          })}
        </div>
      </section>

      <section className="listings-section">
        <ListingResults
          databaseListings={databaseListings}
          databaseError={databaseError}
          savedListingKeys={favoriteState.savedKeys}
          currentViewerId={favoriteState.userId}
          resultsHref="/"
          limit={6}
          showResultsSummary={false}
          showEmptyState={false}
        />
      </section>
    </div>
  );
}
