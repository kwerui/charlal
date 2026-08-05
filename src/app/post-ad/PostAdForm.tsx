"use client";

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { content } from '@/content/tyv';
import {
  getDemoAuthServerSnapshot,
  getDemoAuthSnapshot,
  subscribeToDemoAuth,
} from '@/lib/demoAuth';

type Props = {
  categories: CategoryOption[];
};

type NestedOption = {
  name: string;
  slug: string;
};

type CategoryOption = {
  name: string;
  slug: string;
  subcategories: NestedOption[];
  types?: NestedOption[];
  buyTypes?: NestedOption[];
};

export default function PostAdForm({ categories }: Props) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('');
  const selectedCategory = categories.find((category) => category.slug === selectedCategorySlug);
  const hasSubcategories = Boolean(selectedCategory?.subcategories.length);
  const hasTypes = Boolean(selectedCategory?.types?.length);
  const hasBuyTypes = Boolean(selectedCategory?.buyTypes?.length);
  const signedIn = useSyncExternalStore(
    subscribeToDemoAuth,
    getDemoAuthSnapshot,
    getDemoAuthServerSnapshot
  );

  useEffect(() => {
    if (!signedIn) {
      router.replace('/sign-in?next=/post-ad');
    }
  }, [router, signedIn]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(content.postAdSuccessMessage);
    event.currentTarget.reset();
    setSelectedCategorySlug('');
  }

  if (!signedIn) {
    return <p className="page-description">{content.checkingAuthMessage}</p>;
  }

  return (
    <form className="post-ad-form" onSubmit={handleSubmit}>
      <label className="form-field" htmlFor="listing-title">
        <span>{content.listingTitleLabel}</span>
        <input id="listing-title" name="title" type="text" required />
      </label>

      <label className="form-field" htmlFor="listing-category">
        <span>{content.listingCategoryLabel}</span>
        <select
          id="listing-category"
          name="category"
          required
          value={selectedCategorySlug}
          onChange={(event) => setSelectedCategorySlug(event.target.value)}
        >
          <option value="" disabled>
            {content.listingCategoryPlaceholder}
          </option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      {hasSubcategories ? (
        <label className="form-field" htmlFor="listing-subcategory">
          <span>{content.listingSubcategoryLabel}</span>
          <select id="listing-subcategory" name="subcategory" required defaultValue="">
            <option value="" disabled>
              {content.listingSubcategoryPlaceholder}
            </option>
            {selectedCategory?.subcategories.map((subcategory) => (
              <option key={subcategory.slug} value={subcategory.slug}>
                {subcategory.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {hasTypes ? (
        <label className="form-field" htmlFor="listing-type">
          <span>{content.listingTypeLabel}</span>
          <select id="listing-type" name="type" required defaultValue="">
            <option value="" disabled>
              {content.listingTypePlaceholder}
            </option>
            {selectedCategory?.types?.map((typeItem) => (
              <option key={typeItem.slug} value={typeItem.slug}>
                {typeItem.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {hasBuyTypes ? (
        <label className="form-field" htmlFor="listing-buy-type">
          <span>{content.listingBuyTypeLabel}</span>
          <select id="listing-buy-type" name="buyType" required defaultValue="">
            <option value="" disabled>
              {content.listingBuyTypePlaceholder}
            </option>
            {selectedCategory?.buyTypes?.map((buyType) => (
              <option key={buyType.slug} value={buyType.slug}>
                {buyType.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="form-field form-field-full" htmlFor="listing-description">
        <span>{content.listingDescriptionLabel}</span>
        <textarea id="listing-description" name="description" rows={5} required />
      </label>

      <label className="form-field" htmlFor="listing-price">
        <span>{content.listingPriceLabel}</span>
        <input id="listing-price" name="price" type="number" min="0" inputMode="decimal" required />
      </label>

      <label className="form-field" htmlFor="listing-location">
        <span>{content.listingLocationLabel}</span>
        <input id="listing-location" name="location" type="text" required />
      </label>

      <div className="disabled-upload-section form-field-full" aria-disabled="true">
        <span className="filter-label">{content.listingImageLabel}</span>
        <div className="disabled-upload-box">
          <span>{content.listingImagePlaceholder}</span>
          <small>{content.listingImageRequirements}</small>
        </div>
      </div>

      {successMessage ? (
        <p className="form-success" role="status">
          {successMessage}
        </p>
      ) : null}

      <button type="submit" className="search-button form-submit-button">
        {content.postAdSubmitButton}
      </button>
    </form>
  );
}
