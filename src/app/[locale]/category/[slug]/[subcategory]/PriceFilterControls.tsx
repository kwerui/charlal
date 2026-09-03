"use client";

import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useState } from 'react';

type FilterOption = {
  slug: string;
};

type Props = {
  basePath: string;
  minPrice: string;
  maxPrice: string;
  minLabel?: string;
  maxLabel?: string;
  priceLabel?: string;
  typeOptions?: FilterOption[];
  selectedType?: string;
  typeLabel?: string;
  typePlaceholder?: string;
  preservedPriceParams?: Record<string, string>;
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
  minLabel,
  maxLabel,
  priceLabel,
  typeOptions = [],
  selectedType = '',
  typeLabel,
  typePlaceholder,
  preservedPriceParams = {},
}: Props) {
  const categoryPageT = useTranslations('CategoryPage');
  const categoriesT = useTranslations('Categories');
  const router = useRouter();
  const [draftMinPrice, setDraftMinPrice] = useState(minPrice);
  const [draftMaxPrice, setDraftMaxPrice] = useState(maxPrice);
  const [draftType, setDraftType] = useState(selectedType);

  function applyFilters() {
    const nextParams: Record<string, string> = {
      ...preservedPriceParams,
      minPrice: draftMinPrice.trim(),
      maxPrice: draftMaxPrice.trim(),
    };

    if (typeOptions.length > 0) {
      nextParams.type = draftType;
    }

    router.push(buildFilterHref(basePath, nextParams), { scroll: false });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters();
  }

  function handleClearFilter() {
    if (typeOptions.length > 0) {
      setDraftType('');
    }

    setDraftMinPrice('');
    setDraftMaxPrice('');
  }

  return (
    <div className="price-filter-card">
      <form className="listing-filter-grid" onSubmit={handleSubmit}>
        {typeOptions.length > 0 ? (
          <label className="filter-field" htmlFor="listing-type-filter">
            <span className="filter-label">
              {typeLabel || categoryPageT('typeLabel')}
            </span>
            <select
              id="listing-type-filter"
              className={`filter-select ${draftType ? '' : 'placeholder-selected'}`}
              value={draftType}
              onChange={(event) => setDraftType(event.target.value)}
            >
              <option value="" disabled>
                {typePlaceholder || categoryPageT('typePlaceholder')}
              </option>
              {typeOptions.map((typeItem) => (
                <option key={typeItem.slug} value={typeItem.slug}>
                  {categoriesT(`items.marketplace.buyTypes.${typeItem.slug}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="filter-field">
          <span className="filter-label">
            {priceLabel || categoryPageT('priceFilterLabel')}
          </span>
          <div className="price-filter-inputs">
            <input
              type="number"
              name="minPrice"
              className="price-filter-input"
              placeholder={minLabel || categoryPageT('priceMinPlaceholder')}
              min="0"
              inputMode="numeric"
              value={draftMinPrice}
              onChange={(event) => setDraftMinPrice(event.target.value)}
            />
            <input
              type="number"
              name="maxPrice"
              className="price-filter-input"
              placeholder={maxLabel || categoryPageT('priceMaxPlaceholder')}
              min="0"
              inputMode="numeric"
              value={draftMaxPrice}
              onChange={(event) => setDraftMaxPrice(event.target.value)}
            />
          </div>
        </div>

        <div className="price-filter-actions">
          <button type="submit" className="search-button price-filter-button">
            {categoryPageT('filterButton')}
          </button>
          <button
            type="button"
            className="secondary-button price-filter-button"
            onClick={handleClearFilter}
          >
            {categoryPageT('clearFilterButton')}
          </button>
        </div>
      </form>
    </div>
  );
}
