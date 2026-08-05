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
}: Props) {
  const router = useRouter();

  function handleTransactionChange(event: ChangeEvent<HTMLSelectElement>) {
    router.push(getHousingFilterHref(event.target.value, propertyTypeValue, preservedParams), { scroll: false });
  }

  function handlePropertyTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    router.push(getHousingFilterHref(transactionValue, event.target.value, preservedParams), { scroll: false });
  }

  function clearTransaction() {
    router.push(getHousingFilterHref('', propertyTypeValue, preservedParams), { scroll: false });
  }

  function clearPropertyType() {
    router.push(getHousingFilterHref(transactionValue, '', preservedParams), { scroll: false });
  }

  function clearAllFilters() {
    router.push(getHousingFilterHref('', '', preservedParams), { scroll: false });
  }

  return (
    <section className="housing-filter-card" aria-label={content.housingTransactionLabel}>
      <div className="housing-filter-grid">
        <label className="filter-field" htmlFor="housing-transaction-filter">
          <span className="filter-label">{content.housingTransactionLabel}</span>
          <select
            id="housing-transaction-filter"
            className={`filter-select ${transactionValue ? '' : 'placeholder-selected'}`}
            value={transactionValue}
            onChange={handleTransactionChange}
          >
            <option value="" disabled>
              {content.housingTransactionPlaceholder}
            </option>
            <option value="all">{content.housingAllOption}</option>
            <option value="sale">{content.housingSaleOption}</option>
            <option value="rent">{content.housingRentOption}</option>
          </select>
        </label>

        <label className="filter-field" htmlFor="housing-property-type-filter">
          <span className="filter-label">{content.housingPropertyTypeLabel}</span>
          <select
            id="housing-property-type-filter"
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

      <div className="housing-filter-actions">
        <button type="button" className="secondary-button housing-filter-button" onClick={clearTransaction}>
          {content.housingClearTransaction}
        </button>
        <button type="button" className="secondary-button housing-filter-button" onClick={clearPropertyType}>
          {content.housingClearPropertyType}
        </button>
        <button type="button" className="secondary-button housing-filter-button" onClick={clearAllFilters}>
          {content.housingClearAllFilters}
        </button>
      </div>
    </section>
  );
}
