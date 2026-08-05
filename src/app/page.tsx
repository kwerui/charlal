import Link from 'next/link';
import ListingCard from '@/app/components/ListingCard';
import { content } from '@/content/tyv';
import { listings } from '@/data/listings';

/**
 * Tuvan Marketplace Homepage
 */

export default function Home(): React.ReactNode {
  return (
    <div className="app-container">
      <section className="search-section">
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder={content.searchPlaceholder}
          />
          <button className="search-button">{content.searchButton}</button>
        </div>
      </section>

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
        <div className="listings-grid">
          {listings.slice(0, 6).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>
    </div>
  );
}
