"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';

type Subcategory = {
  name: string;
  slug: string;
};

type CategoryProps = {
  slug: string;
  subcategories: Subcategory[];
};

type Props = {
  category: CategoryProps;
  showHeroSubcategories: boolean;
  showSearchBar: boolean;
};

export default function CategoryHeroControls({
  category,
  showHeroSubcategories,
  showSearchBar,
}: Props) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const usesSegmentedNavigation =
    category.slug === 'housing' ||
    category.slug === 'marketplace' ||
    category.slug === 'jobs';
  const navigationSubcategories =
    category.slug === 'housing'
      ? [{ name: content.housingAllOption, slug: 'all' }, ...category.subcategories]
      : category.subcategories;
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

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchValue.trim();
    const params = new URLSearchParams();

    if (query) {
      params.set('q', query);
    }

    const href = `/category/${category.slug}/all${params.toString() ? `?${params.toString()}` : ''}`;

    router.push(href);
  }

  return (
    <>
      {showHeroSubcategories ? (
        <nav
          className={
            usesSegmentedNavigation
              ? 'subcategory-tabs'
              : 'subcategory-pill-row'
          }
          aria-label={content.subcategoriesTitle}
        >
          {navigationSubcategories.map((subcategory, index) => (
            <Link
              key={subcategory.slug}
              href={`/category/${category.slug}/${subcategory.slug}`}
              className={
                usesSegmentedNavigation && category.slug === 'housing' && index === 0
                  ? 'subcategory-tab is-active'
                  : usesSegmentedNavigation
                  ? 'subcategory-tab'
                  : 'subcategory-pill'
              }
              aria-current={
                usesSegmentedNavigation && category.slug === 'housing' && index === 0
                  ? 'page'
                  : undefined
              }
            >
              {subcategory.name}
            </Link>
          ))}
          {category.slug === 'events' ? (
            <Link href={`/category/${category.slug}/all`} className="explore-button">
              {content.viewAllLabel}
            </Link>
          ) : null}
        </nav>
      ) : null}

      {showSearchBar ? (
        <section className="search-section category-search-section">
          <form className="search-container" onSubmit={handleSearchSubmit}>
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
            <button type="submit" className="search-button">
              {content.categorySearchButton}
            </button>
          </form>
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
