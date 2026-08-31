"use client";

import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';

type FilterOption = {
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
  const categoryPageT = useTranslations('CategoryPage');
  const categoriesT = useTranslations('Categories');
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
      aria-label={categoryPageT('housingPropertyTypeLabel')}
    >
      <div className="housing-filter-grid">
        <label className="filter-field" htmlFor={propertyTypeSelectId}>
          <span className={isCompact ? 'sr-only' : 'filter-label'}>
            {categoryPageT('housingPropertyTypeLabel')}
          </span>
          <select
            id={propertyTypeSelectId}
            className={`filter-select ${propertyTypeValue ? '' : 'placeholder-selected'}`}
            value={propertyTypeValue}
            onChange={handlePropertyTypeChange}
          >
            <option value="" disabled>
              {categoryPageT('housingPropertyTypePlaceholder')}
            </option>
            <option value="all">{categoryPageT('housingAllOption')}</option>
            {propertyTypeOptions.map((propertyType) => (
              <option key={propertyType.slug} value={propertyType.slug}>
                {categoriesT(`items.housing.types.${propertyType.slug}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
