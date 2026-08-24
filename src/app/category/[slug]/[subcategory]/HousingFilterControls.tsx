"use client";

import { useRouter } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { content } from '@/content/tyv';

type FilterOption = {
  name: string;
  slug: string;
};

type Props = {
  propertyTypeOptions: FilterOption[];
  transactionValue: string;
  propertyTypeValue: string;
  preservedParams?: Record<string, string>;
  idPrefix?: string;
  isCompact?: boolean;
};

function addPreservedParams(params: URLSearchParams, preservedParams: Record<string, string>) {
  Object.entries(preservedParams).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
}

function getHousingFilterHref(
  transaction: string,
  propertyType: string,
  preservedParams: Record<string, string>
) {
  const params = new URLSearchParams();

  if (transaction === 'sale' || transaction === 'rent') {
    if (propertyType) {
      params.set('propertyType', propertyType);
    }

    addPreservedParams(params, preservedParams);

    const queryString = params.toString();

    return queryString
      ? `/category/housing/${transaction}?${queryString}`
      : `/category/housing/${transaction}`;
  }

  if (propertyType && propertyType !== 'all') {
    if (transaction === 'all') {
      params.set('transaction', 'all');
    }

    addPreservedParams(params, preservedParams);

    const queryString = params.toString();

    return queryString
      ? `/category/housing/${propertyType}?${queryString}`
      : `/category/housing/${propertyType}`;
  }

  if (transaction === 'all') {
    params.set('transaction', 'all');
  }

  if (propertyType === 'all') {
    params.set('propertyType', 'all');
  }

  addPreservedParams(params, preservedParams);

  const queryString = params.toString();

  return queryString
    ? `/category/housing/all?${queryString}`
    : '/category/housing/all';
}

export default function HousingFilterControls({
  propertyTypeOptions,
  transactionValue,
  propertyTypeValue,
  preservedParams = {},
  idPrefix = 'housing',
  isCompact = false,
}: Props) {
  const router = useRouter();
  const propertyTypeSelectId = `${idPrefix}-property-type-filter`;

  function handlePropertyTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    router.push(getHousingFilterHref(transactionValue, event.target.value, preservedParams), { scroll: false });
  }

  return (
    <section
      className={
        isCompact
          ? 'housing-filter-card housing-filter-card--compact'
          : 'housing-filter-card'
      }
      aria-label={content.housingPropertyTypeLabel}
    >
      <div className="housing-filter-grid">
        <label className="filter-field" htmlFor={propertyTypeSelectId}>
          <span className={isCompact ? 'sr-only' : 'filter-label'}>
            {content.housingPropertyTypeLabel}
          </span>
          <select
            id={propertyTypeSelectId}
            className={`filter-select ${propertyTypeValue ? '' : 'placeholder-selected'}`}
            value={propertyTypeValue}
            onChange={handlePropertyTypeChange}
          >
            <option value="" disabled>
              {content.housingPropertyTypePlaceholder}
            </option>
            <option value="all">{content.housingAllOption}</option>
            {propertyTypeOptions.map((propertyType) => (
              <option key={propertyType.slug} value={propertyType.slug}>
                {propertyType.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
