"use client";

import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useState } from 'react';

type Subcategory = {
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
  const categoryPageT = useTranslations('CategoryPage');
  const categoriesT = useTranslations('Categories');
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const usesSegmentedNavigation =
    category.slug === 'housing' ||
    category.slug === 'marketplace' ||
    category.slug === 'jobs';
  const navigationSubcategories =
    category.slug === 'housing'
      ? [{ slug: 'all' }, ...category.subcategories]
      : category.subcategories;
  const searchPlaceholder =
    category.slug === 'services'
      ? categoryPageT('servicesSearchPlaceholder')
      : category.slug === 'marketplace'
      ? categoryPageT('marketplaceSearchPlaceholder')
      : categoryPageT('searchPlaceholder');
  const formattedSearchPlaceholder =
    category.slug === 'services' ? (
      <>
        <em className="search-sample">{categoryPageT('servicesSearchSample')}</em>{' '}
        {categoryPageT('searchPromptSuffix')}
      </>
    ) : category.slug === 'marketplace' ? (
      <>
        <em className="search-sample">{categoryPageT('marketplaceSearchSample')}</em>{' '}
        {categoryPageT('searchPromptSuffix')}
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
          aria-label={categoryPageT('subcategoriesTitle')}
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
              {subcategory.slug === 'all'
                ? categoryPageT('viewAllLabel')
                : categoriesT(`items.${category.slug}.subcategories.${subcategory.slug}`)}
            </Link>
          ))}
          {category.slug === 'events' ? (
            <Link href={`/category/${category.slug}/all`} className="explore-button">
              {categoryPageT('viewAllLabel')}
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
              {categoryPageT('searchButton')}
            </button>
          </form>
          {category.slug === 'services' ? (
            <div className="category-cta-row">
              <Link href={`/category/${category.slug}/all`} className="explore-button">
                {categoryPageT('exploreAllServices')}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
