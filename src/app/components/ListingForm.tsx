'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { content } from '@/content/tyv';
import {
  getListingFormValues,
  type ListingFormCategory,
  type ListingFormMode,
  type ValidatedListingFormValues,
  validateListingFormValues,
} from '@/lib/listingFormValidation';

export type ListingFormInitialValues = {
  title: string;
  description: string;
  price: number;
  location: string;
  categorySlug: string;
  subcategorySlug: string;
  typeSlug?: string;
  buyTypeSlug?: string;
};

type Props = {
  mode: ListingFormMode;
  categories: ListingFormCategory[];
  initialValues?: ListingFormInitialValues;
  submitButtonLabel: string;
  submittingButtonLabel: string;
  isSubmitting: boolean;
  externalErrors: string[];
  successMessage?: string;
  cancelHref?: string;
  onSubmit: (values: ValidatedListingFormValues) => void;
};

export default function ListingForm({
  mode,
  categories,
  initialValues,
  submitButtonLabel,
  submittingButtonLabel,
  isSubmitting,
  externalErrors,
  successMessage,
  cancelHref,
  onSubmit,
}: Props) {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState(
    initialValues?.categorySlug || ''
  );
  const [selectedSubcategorySlug, setSelectedSubcategorySlug] = useState(
    initialValues?.subcategorySlug || ''
  );
  const [selectedTypeSlug, setSelectedTypeSlug] = useState(initialValues?.typeSlug || '');
  const [selectedBuyTypeSlug, setSelectedBuyTypeSlug] = useState(
    initialValues?.buyTypeSlug || ''
  );
  const selectedCategory = categories.find(
    (category) => category.slug === selectedCategorySlug
  );
  const hasSubcategories = Boolean(selectedCategory?.subcategories.length);
  const hasTypes = selectedCategory?.slug === 'housing' && Boolean(selectedCategory.types?.length);
  const hasBuyTypes =
    selectedCategory?.slug === 'marketplace' && selectedSubcategorySlug === 'buy';
  const marketplaceBuyTypes =
    selectedCategory?.buyTypes?.filter((buyType) => buyType.slug !== 'all-categories') || [];
  const errors = [...validationErrors, ...externalErrors];

  function clearValidationErrors(): void {
    setValidationErrors([]);
  }

  function handleCategoryChange(categorySlug: string): void {
    setSelectedCategorySlug(categorySlug);
    setSelectedSubcategorySlug('');
    setSelectedTypeSlug('');
    setSelectedBuyTypeSlug('');
    clearValidationErrors();
  }

  function handleSubcategoryChange(subcategorySlug: string): void {
    setSelectedSubcategorySlug(subcategorySlug);
    setSelectedBuyTypeSlug('');
    clearValidationErrors();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    clearValidationErrors();

    if (isSubmitting) {
      return;
    }

    const validationResult = validateListingFormValues(
      getListingFormValues(new FormData(event.currentTarget)),
      categories
    );

    if (!validationResult.ok) {
      setValidationErrors(validationResult.errors);
      return;
    }

    onSubmit(validationResult.values);
  }

  return (
    <form className="post-ad-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field" htmlFor="listing-title">
        <span>{content.listingTitleLabel}</span>
        <input
          id="listing-title"
          name="title"
          type="text"
          required
          defaultValue={initialValues?.title || ''}
          onChange={clearValidationErrors}
        />
      </label>

      <label className="form-field" htmlFor="listing-category">
        <span>{content.listingCategoryLabel}</span>
        <select
          id="listing-category"
          name="category"
          required
          value={selectedCategorySlug}
          onChange={(event) => handleCategoryChange(event.target.value)}
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
          <select
            id="listing-subcategory"
            name="subcategory"
            required
            value={selectedSubcategorySlug}
            onChange={(event) => handleSubcategoryChange(event.target.value)}
          >
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
          <select
            id="listing-type"
            name="type"
            required
            value={selectedTypeSlug}
            onChange={(event) => {
              setSelectedTypeSlug(event.target.value);
              clearValidationErrors();
            }}
          >
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
          <select
            id="listing-buy-type"
            name="buyType"
            required
            value={selectedBuyTypeSlug}
            onChange={(event) => {
              setSelectedBuyTypeSlug(event.target.value);
              clearValidationErrors();
            }}
          >
            <option value="" disabled>
              {content.listingBuyTypePlaceholder}
            </option>
            {marketplaceBuyTypes.map((buyType) => (
              <option key={buyType.slug} value={buyType.slug}>
                {buyType.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="form-field form-field-full" htmlFor="listing-description">
        <span>{content.listingDescriptionLabel}</span>
        <textarea
          id="listing-description"
          name="description"
          rows={5}
          required
          defaultValue={initialValues?.description || ''}
          onChange={clearValidationErrors}
        />
      </label>

      <label className="form-field" htmlFor="listing-price">
        <span>{content.listingPriceLabel}</span>
        <input
          id="listing-price"
          name="price"
          type="number"
          min="0"
          inputMode="decimal"
          required
          defaultValue={initialValues ? String(initialValues.price) : ''}
          onChange={clearValidationErrors}
        />
      </label>

      <label className="form-field" htmlFor="listing-location">
        <span>{content.listingLocationLabel}</span>
        <input
          id="listing-location"
          name="location"
          type="text"
          required
          defaultValue={initialValues?.location || ''}
          onChange={clearValidationErrors}
        />
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

      {errors.length > 0 ? (
        <div className="form-error" role="alert" aria-live="assertive">
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="listing-form-actions">
        {cancelHref ? (
          <Link
            href={cancelHref}
            className="listing-form-action listing-form-action--secondary"
          >
            {content.cancelButton}
          </Link>
        ) : null}
        <button
          type="submit"
          className="listing-form-action listing-form-action--primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? submittingButtonLabel : submitButtonLabel}
        </button>
      </div>
      <input type="hidden" name="mode" value={mode} />
    </form>
  );
}
