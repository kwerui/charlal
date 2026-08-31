"use client";

import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useState } from 'react';

type Props = {
  basePath: string;
  defaultQuery: string;
  placeholder: string;
  preservedParams?: Record<string, string>;
};

function buildSearchHref(basePath: string, params: Record<string, string>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const queryString = query.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

export default function CategoryResultsSearch({
  basePath,
  defaultQuery,
  placeholder,
  preservedParams = {},
}: Props) {
  const t = useTranslations('CategoryPage');
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(defaultQuery);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    router.push(
      buildSearchHref(basePath, {
        ...preservedParams,
        q: searchValue.trim(),
      })
    );
  }

  return (
    <section className="search-section category-search-section">
      <form className="search-container" onSubmit={handleSubmit}>
        <input
          type="text"
          className="search-input"
          value={searchValue}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => setSearchValue(event.target.value)}
        />
        <button type="submit" className="search-button">
          {t('searchButton')}
        </button>
      </form>
    </section>
  );
}
