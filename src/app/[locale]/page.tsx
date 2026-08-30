import { Link } from '@/i18n/navigation';
import ListingResults from '@/app/components/ListingResults';
import SearchForm from '@/app/components/SearchForm';
import { content } from '@/content/tyv';
import { getCurrentUserFavoriteState } from '@/lib/supabase/listingFavorites';
import { listPublicDatabaseListings } from '@/lib/supabase/listingsServer';

/**
 * Tuvan Marketplace Homepage
 */

export default async function Home(): Promise<React.ReactNode> {
  const [databaseListingsResult, favoriteState] = await Promise.all([
    listPublicDatabaseListings({ limit: 6 }),
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
      <SearchForm />

      <section className="categories-section">
        <h2 className="section-title">{content.categorySectionTitle}</h2>
        <div className="categories-container">
          {content.categories.map((category) => (
            <Link
              key={category.slug}
              href={`/category/${category.slug}`}
              className={`category-button ${category.image ? 'has-image' : ''}`}
              aria-label={`Category: ${category.name}`}
              title={category.name}
              style={category.image ? { backgroundImage: `url(${category.image})` } : undefined}
            >
              <span className="category-label">{category.name}</span>
            </Link>
          ))}
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
