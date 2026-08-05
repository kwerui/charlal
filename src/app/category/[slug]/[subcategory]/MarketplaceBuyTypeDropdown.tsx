"use client";

import { useRouter } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { content } from '@/content/tyv';

type TypeOption = {
  name: string;
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

export default function MarketplaceBuyTypeDropdown({
  basePath,
  options,
  selectedValue,
  preservedParams = {},
}: Props) {
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
    <div className="category-hero-controls">
      <label className="filter-card" htmlFor="marketplace-buy-type">
        <span className="filter-label">{content.typeLabel}</span>
        <select
          key={selectedValue}
          id="marketplace-buy-type"
          className="filter-select"
          defaultValue={selectedValue}
          onChange={handleTypeChange}
        >
          <option value="" disabled>
            {content.typePlaceholder}
          </option>
          {options.map((typeItem) => (
            <option key={typeItem.slug} value={typeItem.slug}>
              {typeItem.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
