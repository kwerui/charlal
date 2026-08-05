import ListingResults from '@/app/components/ListingResults';
import SearchForm from '@/app/components/SearchForm';
import { content } from '@/content/tyv';
import { listings } from '@/data/listings';
import { buildHrefWithSearchParams } from '@/lib/resultReturnHref';

type SearchPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = await searchParams;
  const rawSearchQuery = query.q;
  const searchQuery = Array.isArray(rawSearchQuery)
    ? rawSearchQuery[0] || ''
    : rawSearchQuery || '';
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
        </div>

        <ListingResults
          builtInListings={listings}
          criteria={{ searchQuery }}
          resultsHref={resultsHref}
          emptyHeadingLevel="h2"
          requireSearchQuery
        />
      </section>
    </div>
  );
}
