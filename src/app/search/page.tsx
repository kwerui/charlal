import ListingCard from '@/app/components/ListingCard';
import ResultsScrollRestorer from '@/app/components/ResultsScrollRestorer';
import SearchForm from '@/app/components/SearchForm';
import { content } from '@/content/tyv';
import { listings } from '@/data/listings';
import { buildHrefWithSearchParams } from '@/lib/resultReturnHref';
import { searchListings } from '@/lib/searchListings';

type SearchPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = await searchParams;
  const rawSearchQuery = query.q;
  const searchQuery = Array.isArray(rawSearchQuery)
    ? rawSearchQuery[0] || ''
    : rawSearchQuery || '';
  const matchingListings = searchListings(listings, searchQuery);
  const resultsHref = buildHrefWithSearchParams('/search', query);

  return (
    <div className="app-container">
      <section className="category-page">
        <SearchForm
          defaultQuery={searchQuery}
          sectionClassName="search-section category-search-section"
        />

        <div className="search-results-heading">
          <h1 className="page-title">{content.searchResultsTitle}</h1>
          <div className="results-summary" aria-live="polite">
            <p>
              {content.resultsCountLabel}: {matchingListings.length}
            </p>
          </div>
        </div>

        {matchingListings.length > 0 ? (
          <div className="listings-grid">
            {matchingListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} fromHref={resultsHref} />
            ))}
          </div>
        ) : (
          <div className="empty-results" role="status">
            <h2>{content.emptyResultsTitle}</h2>
            <p>{content.emptyResultsMessage}</p>
          </div>
        )}

        <ResultsScrollRestorer resultsHref={resultsHref} />
      </section>
    </div>
  );
}
