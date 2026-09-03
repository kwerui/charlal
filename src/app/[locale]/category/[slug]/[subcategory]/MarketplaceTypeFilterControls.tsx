"use client";

import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';

type TypeOption = {
  slug: string;
};

type Props = {
  basePath: string;
  options: TypeOption[];
  selectedValue: string;
  preservedParams?: Record<string, string>;
};

function buildTypeHref(basePath: string, params: Record<string, string>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const queryString = query.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

export default function MarketplaceTypeFilterControls({
  basePath,
  options,
  selectedValue,
  preservedParams = {},
}: Props) {
  const categoryPageT = useTranslations('CategoryPage');
  const categoriesT = useTranslations('Categories');
  const router = useRouter();

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value;

    if (nextValue) {
      router.push(
        buildTypeHref(basePath, {
          ...preservedParams,
          type: nextValue,
        }),
        { scroll: false }
      );
    }
  }

  return (
    <section className="housing-filter-card housing-filter-card--compact" aria-label={categoryPageT('typeLabel')}>
      <div className="housing-filter-grid">
        <label className="filter-field" htmlFor="marketplace-quick-type-filter">
          <span className="sr-only">{categoryPageT('typeLabel')}</span>
          <select
            id="marketplace-quick-type-filter"
            className={`filter-select ${selectedValue ? '' : 'placeholder-selected'}`}
            value={selectedValue}
            onChange={handleTypeChange}
          >
            <option value="" disabled>
              {categoryPageT('typePlaceholder')}
            </option>
            {options.map((typeItem) => (
              <option key={typeItem.slug} value={typeItem.slug}>
                {categoriesT(`items.marketplace.buyTypes.${typeItem.slug}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
