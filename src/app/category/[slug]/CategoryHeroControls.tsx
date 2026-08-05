"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';

type Subcategory = {
  name: string;
  slug: string;
};

type TypeOption = {
  name: string;
  slug: string;
};

type CategoryProps = {
  slug: string;
  subcategories: Subcategory[];
  types?: TypeOption[];
};

type Props = {
  category: CategoryProps;
  showTypeSelect: boolean;
  showHeroSubcategories: boolean;
  showSearchBar: boolean;
};

export default function CategoryHeroControls({
  category,
  showTypeSelect,
  showHeroSubcategories,
  showSearchBar,
}: Props) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const searchPlaceholder =
    category.slug === 'services'
      ? content.servicesSearchPlaceholder
      : category.slug === 'marketplace'
      ? content.marketplaceSearchPlaceholder
      : content.searchPlaceholder;
  const formattedSearchPlaceholder =
    category.slug === 'services' ? (
      <>
        <em className="search-sample">Электрик</em> дээн ышкаш кылдыр парлаптыңар
      </>
    ) : category.slug === 'marketplace' ? (
      <>
        <em className="search-sample">Тон</em> дээн ышкаш кылдыр парлаптыңар
      </>
    ) : (
      searchPlaceholder
    );

function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {  
      const value = event.target.value;
    if (value) {
      router.push(`/category/${category.slug}/${value}`);
    }
  }

  return (
    <>
      {showTypeSelect ? (
        <label className="filter-card" htmlFor="category-type">
          <span className="filter-label">
            {category.slug === 'housing' ? content.housingPropertyTypeLabel : content.typeLabel}
          </span>
          <select id="category-type" className="filter-select" defaultValue="" onChange={handleTypeChange}>
            <option value="" disabled>
              {category.slug === 'housing' ? content.housingPropertyTypeLabel : content.typePlaceholder}
            </option>
            {(category.types || []).map((typeItem) => (
              <option key={typeItem.slug} value={typeItem.slug}>
                {typeItem.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showHeroSubcategories ? (
        <div className="subcategory-pill-row" role="list" aria-label={content.subcategoriesTitle}>
          {category.subcategories.map((subcategory) => (
            <Link
              key={subcategory.slug}
              href={`/category/${category.slug}/${subcategory.slug}`}
              className="subcategory-pill"
              role="listitem"
            >
              {subcategory.name}
            </Link>
          ))}
          {category.slug === 'events' ? (
            <Link href={`/category/${category.slug}/all`} className="explore-button">
              {content.viewAllLabel}
            </Link>
          ) : null}
        </div>
      ) : null}

      {showSearchBar ? (
        <section className="search-section category-search-section">
          <div className="search-container">
            <div className="search-input-frame">
              <input
                type="text"
                className="search-input"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                aria-label={searchPlaceholder}
              />
              {searchValue ? null : (
                <span className="formatted-search-placeholder" aria-hidden="true">
                  {formattedSearchPlaceholder}
                </span>
              )}
            </div>
            <button type="button" className="search-button">
              {content.categorySearchButton}
            </button>
          </div>
          {category.slug === 'services' ? (
            <div className="category-cta-row">
              <Link href={`/category/${category.slug}/all`} className="explore-button">
                {content.exploreAllServices}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
