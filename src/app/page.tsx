import Link from 'next/link';
import ListingResults from '@/app/components/ListingResults';
import SearchForm from '@/app/components/SearchForm';
import { content } from '@/content/tyv';
import { listings } from '@/data/listings';

/**
 * Tuvan Marketplace Homepage
 */

export default function Home(): React.ReactNode {
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
          builtInListings={listings}
          resultsHref="/"
          limit={6}
          showResultsSummary={false}
          showEmptyState={false}
        />
      </section>
    </div>
  );
}
