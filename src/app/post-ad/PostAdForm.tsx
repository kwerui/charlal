"use client";

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { listings, LOCAL_LISTING_PLACEHOLDER_IMAGE } from '@/data/listings';
import {
  getDemoUser,
  getDemoAuthServerSnapshot,
  getDemoAuthSnapshot,
  subscribeToDemoAuth,
} from '@/lib/demoAuth';
import {
  addLocalListing,
  createLocalListingId,
  readLocalListings,
} from '@/lib/localListings';

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

function optionExists(options: NestedOption[] | undefined, slug: string): boolean {
  return Boolean(options?.some((option) => option.slug === slug));
}

export default function PostAdForm({ categories }: Props) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('');
  const [selectedSubcategorySlug, setSelectedSubcategorySlug] = useState('');
  const selectedCategory = categories.find((category) => category.slug === selectedCategorySlug);
  const hasSubcategories = Boolean(selectedCategory?.subcategories.length);
  const hasTypes = selectedCategory?.slug === 'housing' && Boolean(selectedCategory.types?.length);
  const hasBuyTypes = selectedCategory?.slug === 'marketplace' && selectedSubcategorySlug === 'buy';
  const marketplaceBuyTypes =
    selectedCategory?.buyTypes?.filter((buyType) => buyType.slug !== 'all-categories') || [];
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

  function handleCategoryChange(categorySlug: string): void {
    setSelectedCategorySlug(categorySlug);
    setSelectedSubcategorySlug('');
    setErrors([]);
  }

  function getFormValue(formData: FormData, name: string): string {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors([]);
    setSuccessMessage('');

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = getFormValue(formData, 'title');
    const description = getFormValue(formData, 'description');
    const location = getFormValue(formData, 'location');
    const categorySlug = getFormValue(formData, 'category');
    const selectedFormCategory = categories.find((category) => category.slug === categorySlug);
    const subcategorySlug = selectedFormCategory?.subcategories.length
      ? getFormValue(formData, 'subcategory')
      : 'all';
    const priceText = getFormValue(formData, 'price');
    const price = Number(priceText);
    const typeSlug = getFormValue(formData, 'type');
    const buyTypeSlug = getFormValue(formData, 'buyType');
    const validationErrors: string[] = [];

    if (!title) {
      validationErrors.push(content.postAdErrorTitleRequired);
    }

    if (!description) {
      validationErrors.push(content.postAdErrorDescriptionRequired);
    }

    if (!location) {
      validationErrors.push(content.postAdErrorLocationRequired);
    }

    const validSubcategory =
      selectedFormCategory && selectedFormCategory.subcategories.length > 0
        ? optionExists(selectedFormCategory.subcategories, subcategorySlug)
        : subcategorySlug === 'all';
    const formMarketplaceBuyTypes =
      selectedFormCategory?.buyTypes?.filter((buyType) => buyType.slug !== 'all-categories') ||
      [];
    const validHousingType =
      categorySlug === 'housing' && optionExists(selectedFormCategory?.types, typeSlug);
    const validMarketplaceType =
      categorySlug === 'marketplace' &&
      subcategorySlug === 'buy' &&
      formMarketplaceBuyTypes.some((buyType) => buyType.slug === buyTypeSlug);

    if (!selectedFormCategory || !subcategorySlug || !validSubcategory) {
      validationErrors.push(content.postAdErrorCategoryRequired);
    }

    if (priceText === '' || !Number.isFinite(price) || price < 0) {
      validationErrors.push(content.postAdErrorPriceRequired);
    }

    if (categorySlug === 'housing' && !validHousingType) {
      validationErrors.push(content.postAdErrorHousingTypeRequired);
    }

    if (categorySlug === 'marketplace' && subcategorySlug === 'buy' && !validMarketplaceType) {
      validationErrors.push(content.postAdErrorMarketplaceTypeRequired);
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const localListings = readLocalListings();
      const id = createLocalListingId([
        ...listings.map((listing) => listing.id),
        ...localListings.map((listing) => listing.id),
      ]);
      const demoUser = getDemoUser();
      const newListing: Listing = {
        id,
        title,
        description,
        price,
        location,
        categorySlug,
        subcategorySlug,
        // TODO: replace this placeholder with real image upload when a backend is added.
        image: LOCAL_LISTING_PLACEHOLDER_IMAGE,
        sellerName: demoUser?.email || content.localListingSellerName,
        datePosted: new Date().toISOString().slice(0, 10),
      };

      if (categorySlug === 'housing') {
        newListing.transactionType = subcategorySlug === 'rent' ? 'rent' : 'sale';
        newListing.propertyType = typeSlug as Listing['propertyType'];
      }

      if (categorySlug === 'marketplace' && subcategorySlug === 'buy') {
        newListing.marketplaceType = buyTypeSlug;
      }

      // DEMO ONLY: local ads exist only in this browser, are not shared with
      // other users/devices, and may disappear if browser storage is cleared.
      addLocalListing(newListing);
      setSuccessMessage(content.postAdSuccessMessage);
      router.push(`/listing/${id}`);
    } catch {
      setErrors([content.postAdErrorSaveFailed]);
      setIsSubmitting(false);
    }
  }

  if (!signedIn) {
    return <p className="page-description">{content.checkingAuthMessage}</p>;
  }

  return (
    <form className="post-ad-form" onSubmit={handleSubmit} noValidate>
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
            onChange={(event) => {
              setSelectedSubcategorySlug(event.target.value);
              setErrors([]);
            }}
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

      {errors.length > 0 ? (
        <div className="form-error" role="alert" aria-live="assertive">
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="submit"
        className="search-button form-submit-button"
        disabled={isSubmitting}
      >
        {isSubmitting ? content.postAdSubmittingButton : content.postAdSubmitButton}
      </button>
    </form>
  );
}
