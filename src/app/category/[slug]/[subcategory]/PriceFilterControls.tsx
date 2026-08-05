"use client";

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { content } from '@/content/tyv';

type Props = {
  basePath: string;
  minPrice: string;
  maxPrice: string;
  searchQuery: string;
  preservedPriceParams?: Record<string, string>;
  preservedSearchParams?: Record<string, string>;
};

function buildFilterHref(basePath: string, params: Record<string, string>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const queryString = query.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

export default function PriceFilterControls({
  basePath,
  minPrice,
  maxPrice,
  searchQuery,
  preservedPriceParams = {},
  preservedSearchParams = {},
}: Props) {
  const router = useRouter();

  function handlePriceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextMinPrice = String(formData.get('minPrice') || '').trim();
    const nextMaxPrice = String(formData.get('maxPrice') || '').trim();

    router.push(
      buildFilterHref(basePath, {
        ...preservedPriceParams,
        minPrice: nextMinPrice,
        maxPrice: nextMaxPrice,
      }),
      { scroll: false }
    );
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextSearchQuery = String(formData.get('searchQuery') || '').trim();

    router.push(
      buildFilterHref(basePath, {
        ...preservedSearchParams,
        q: nextSearchQuery,
      }),
      { scroll: false }
    );
  }

  function handleClearFilter() {
    router.push(buildFilterHref(basePath, preservedPriceParams), { scroll: false });
  }

  return (
    <div className="price-filter-card">
      <div className="listing-filter-grid">
        <form className="filter-field" onSubmit={handleSearchSubmit}>
          <span className="filter-label">{content.filterSearchLabel}</span>
          <input
            key={`search-${searchQuery}`}
            type="text"
            name="searchQuery"
            className="price-filter-input"
            placeholder={content.filterSearchPlaceholder}
            defaultValue={searchQuery}
          />
          <button type="submit" className="search-button price-filter-button">
            {content.categorySearchButton}
          </button>
        </form>
        <form className="filter-field" onSubmit={handlePriceSubmit}>
          <span className="filter-label">{content.priceFilterLabel}</span>
          <div className="price-filter-inputs">
            <input
              key={`min-${minPrice}`}
              type="number"
              name="minPrice"
              className="price-filter-input"
              placeholder={content.priceMinPlaceholder}
              min="0"
              inputMode="numeric"
              defaultValue={minPrice}
            />
            <input
              key={`max-${maxPrice}`}
              type="number"
              name="maxPrice"
              className="price-filter-input"
              placeholder={content.priceMaxPlaceholder}
              min="0"
              inputMode="numeric"
              defaultValue={maxPrice}
            />
          </div>
          <div className="price-filter-actions">
            <button type="submit" className="search-button price-filter-button">
              {content.filterButton}
            </button>
            <button
              type="button"
              className="secondary-button price-filter-button"
              onClick={handleClearFilter}
            >
              {content.clearFilterButton}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
