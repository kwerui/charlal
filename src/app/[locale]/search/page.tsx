import ListingResults from '@/app/components/ListingResults';
import SearchForm from '@/app/components/SearchForm';
import { hasPublicListingSearchQuery } from '@/lib/publicListingQuery';
import { buildHrefWithSearchParams } from '@/lib/resultReturnHref';
import { getCurrentUserFavoriteState } from '@/lib/supabase/listingFavorites';
import { listPublicDatabaseListings } from '@/lib/supabase/listingsServer';
import { getTranslations } from 'next-intl/server';

type SearchPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const t = await getTranslations('Search');
  const listingResultsT = await getTranslations('ListingResults');
  const query = await searchParams;
  const rawSearchQuery = query.q;
  const searchQuery = Array.isArray(rawSearchQuery)
    ? rawSearchQuery[0] || ''
    : rawSearchQuery || '';
  const resultsHref = buildHrefWithSearchParams('/search', query);
  const hasSearchQuery = hasPublicListingSearchQuery({ searchQuery });
  const [databaseListingsResult, favoriteState] = hasSearchQuery
    ? await Promise.all([
        listPublicDatabaseListings({ searchQuery }),
        getCurrentUserFavoriteState(),
      ])
    : [
        { ok: true as const, listings: [] },
        { userId: null, favorites: [], savedKeys: [] },
      ];
  const databaseListings = databaseListingsResult.ok
    ? databaseListingsResult.listings
    : [];
  const databaseError = databaseListingsResult.ok
    ? ''
    : listingResultsT('databaseListingsLoadFailedMessage');

  return (
    <div className="app-container">
      <section className="category-page">
        <SearchForm
          defaultQuery={searchQuery}
          sectionClassName="search-section category-search-section"
        />

        <div className="search-results-heading">
          <h1 className="page-title">{t('resultsTitle')}</h1>
        </div>

        <ListingResults
          databaseListings={databaseListings}
          databaseError={databaseError}
          savedListingKeys={favoriteState.savedKeys}
          currentViewerId={favoriteState.userId}
          criteria={{ searchQuery }}
          resultsHref={resultsHref}
          emptyHeadingLevel="h2"
          requireSearchQuery
        />
      </section>
    </div>
  );
}
