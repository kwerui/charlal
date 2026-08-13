'use client';

import Link from 'next/link';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { content } from '@/content/tyv';
import type { ListingImage, ListingStatus } from '@/data/listings';
import {
  getListingFormValues,
  type ListingFormCategory,
  type ListingFormMode,
  type ValidatedListingFormValues,
  validateListingFormValues,
} from '@/lib/listingFormValidation';
import type { ListingPhotoFormItem } from '@/lib/listingPhotoForm';
import {
  LISTING_IMAGE_ACCEPT,
  LISTING_IMAGE_MIME_TYPES,
  MAX_LISTING_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
} from '@/lib/supabase/listingImages';

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
  initialImages?: ListingImage[];
  statusField?: {
    value: ListingStatus;
    onChange: (status: ListingStatus) => void;
    disabled?: boolean;
  };
  onCancel?: () => void;
  onSubmit: (
    values: ValidatedListingFormValues,
    photos: ListingPhotoFormItem[]
  ) => void;
};

function initialImageToPhotoItem(image: ListingImage): ListingPhotoFormItem | null {
  if (!image.storagePath) {
    return null;
  }

  return {
    id: image.id,
    kind: 'existing',
    url: image.url,
    storagePath: image.storagePath,
  };
}

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
  initialImages = [],
  statusField,
  onCancel,
  onSubmit,
}: Props) {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [photos, setPhotos] = useState<ListingPhotoFormItem[]>(
    initialImages
      .map(initialImageToPhotoItem)
      .filter((photo): photo is ListingPhotoFormItem => Boolean(photo))
      .slice(0, MAX_LISTING_IMAGES)
  );
  const photosRef = useRef(photos);
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
  const errors = [...validationErrors, ...photoErrors, ...externalErrors];

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) {
        if (photo.kind === 'new') {
          URL.revokeObjectURL(photo.url);
        }
      }
    };
  }, []);

  function clearValidationErrors(): void {
    setValidationErrors([]);
  }

  function clearPhotoErrors(): void {
    setPhotoErrors([]);
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

    onSubmit(validationResult.values, photos);
  }

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>): void {
    clearPhotoErrors();

    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) {
      return;
    }

    const nextErrors: string[] = [];
    const remainingSlots = MAX_LISTING_IMAGES - photos.length;
    const acceptedFiles = selectedFiles.slice(0, Math.max(remainingSlots, 0));

    if (selectedFiles.length > remainingSlots) {
      nextErrors.push(content.listingPhotoMaximumMessage);
    }

    const nextPhotos: ListingPhotoFormItem[] = [];

    for (const file of acceptedFiles) {
      if (!(LISTING_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
        nextErrors.push(`${file.name}: ${content.listingPhotoUnsupportedTypeMessage}`);
        continue;
      }

      if (file.size > MAX_LISTING_IMAGE_BYTES) {
        nextErrors.push(`${file.name}: ${content.listingPhotoTooLargeMessage}`);
        continue;
      }

      nextPhotos.push({
        id: crypto.randomUUID(),
        kind: 'new',
        file,
        url: URL.createObjectURL(file),
      });
    }

    setPhotos((currentPhotos) => [...currentPhotos, ...nextPhotos]);
    setPhotoErrors(nextErrors);
    event.target.value = '';
  }

  function removePhoto(photoId: string): void {
    clearPhotoErrors();
    setPhotos((currentPhotos) => {
      const photoToRemove = currentPhotos.find((photo) => photo.id === photoId);

      if (photoToRemove?.kind === 'new') {
        URL.revokeObjectURL(photoToRemove.url);
      }

      return currentPhotos.filter((photo) => photo.id !== photoId);
    });
  }

  function movePhoto(photoId: string, direction: -1 | 1): void {
    clearPhotoErrors();
    setPhotos((currentPhotos) => {
      const currentIndex = currentPhotos.findIndex((photo) => photo.id === photoId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= currentPhotos.length
      ) {
        return currentPhotos;
      }

      const nextPhotos = [...currentPhotos];
      const [photo] = nextPhotos.splice(currentIndex, 1);

      nextPhotos.splice(nextIndex, 0, photo);
      return nextPhotos;
    });
  }

  return (
    <form className="post-ad-form listing-editor-form" onSubmit={handleSubmit} noValidate>
      <div className="listing-form-section listing-form-section--details">
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
      </div>

      <div className="listing-form-section listing-form-section--commerce">
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
      </div>

      {statusField ? (
        <fieldset className="listing-status-edit-field form-field-full">
          <label className="form-field" htmlFor="listing-status">
            <span>{content.advertisementStatusLabel}</span>
            <select
              id="listing-status"
              name="status"
              value={statusField.value}
              onChange={(event) => {
                statusField.onChange(event.target.value as ListingStatus);
              }}
              disabled={Boolean(statusField.disabled)}
            >
              <option value="active">{content.listingStatusActive}</option>
              <option value="reserved">{content.listingStatusReserved}</option>
              <option value="sold">{content.listingStatusSold}</option>
              <option value="archived">{content.listingStatusArchived}</option>
            </select>
          </label>
          <dl className="listing-status-help">
            <div>
              <dt>{content.listingStatusActive}</dt>
              <dd>{content.listingStatusActiveHelp}</dd>
            </div>
            <div>
              <dt>{content.listingStatusReserved}</dt>
              <dd>{content.listingStatusReservedHelp}</dd>
            </div>
            <div>
              <dt>{content.listingStatusSold}</dt>
              <dd>{content.listingStatusSoldHelp}</dd>
            </div>
            <div>
              <dt>{content.listingStatusArchived}</dt>
              <dd>{content.listingStatusArchivedHelp}</dd>
            </div>
          </dl>
        </fieldset>
      ) : null}

      <div className="listing-photo-section form-field-full">
        <div className="listing-photo-heading">
          <span className="filter-label">{content.listingPhotosLabel}</span>
          <small>{content.listingPhotosHelp}</small>
        </div>
        <label className="listing-photo-picker" htmlFor="listing-photos">
          <span>{content.addPhotosButton}</span>
          <input
            id="listing-photos"
            type="file"
            accept={LISTING_IMAGE_ACCEPT}
            multiple
            onChange={handlePhotoSelection}
            disabled={isSubmitting || photos.length >= MAX_LISTING_IMAGES}
          />
        </label>
        {photos.length > 0 ? (
          <ul className="listing-photo-grid" aria-label={content.listingPhotosLabel}>
            {photos.map((photo, index) => {
              const photoNumber = index + 1;
              const totalPhotos = photos.length;

              return (
                <li key={photo.id} className="listing-photo-item">
                  <div className="listing-photo-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={content.listingPhotoAltTemplate
                        .replace('{current}', String(photoNumber))
                        .replace('{total}', String(totalPhotos))}
                    />
                    {index === 0 ? (
                      <span className="listing-photo-cover-badge">
                        {content.coverPhotoLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="listing-photo-controls">
                    <span className="listing-photo-position">
                      {content.listingPhotoPositionLabel}: {photoNumber}
                    </span>
                    <div className="listing-photo-control-row">
                      <button
                        type="button"
                        className="listing-photo-control"
                        onClick={() => movePhoto(photo.id, -1)}
                        disabled={isSubmitting || index === 0}
                      >
                        {content.movePhotoEarlierButton}
                      </button>
                      <button
                        type="button"
                        className="listing-photo-control"
                        onClick={() => movePhoto(photo.id, 1)}
                        disabled={isSubmitting || index === photos.length - 1}
                      >
                        {content.movePhotoLaterButton}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="listing-photo-remove"
                      onClick={() => removePhoto(photo.id)}
                      disabled={isSubmitting}
                    >
                      {content.removePhotoButton}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="listing-photo-empty">{content.listingNoPhotosMessage}</p>
        )}
        <div className="listing-photo-requirements">
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
        {onCancel ? (
          <button
            type="button"
            className="listing-form-action listing-form-action--secondary"
            onClick={onCancel}
          >
            {content.cancelButton}
          </button>
        ) : cancelHref ? (
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
