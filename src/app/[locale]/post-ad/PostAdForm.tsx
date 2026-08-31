"use client";

import { useRouter } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import ListingForm, { type ListingFormMessages } from '@/app/components/ListingForm';
import { useTranslations } from 'next-intl';
import type {
  ListingFormCategory,
  ValidatedListingFormValues,
} from '@/lib/listingFormValidation';
import type { ListingPhotoFormItem } from '@/lib/listingPhotoForm';
import { useAuthStatus } from '@/lib/auth/client';
import {
  createDatabaseListingFromFormValues,
  saveDatabaseListingImagesOwnedBy,
} from '@/lib/supabase/listingsClient';
import {
  cleanupUploadedListingPhotos,
  prepareListingPhotoMetadata,
} from '@/lib/supabase/listingPhotoUploadsClient';

type Props = {
  categories: ListingFormCategory[];
};

export default function PostAdForm({ categories }: Props) {
  const router = useRouter();
  const t = useTranslations('PostAd');
  const accountT = useTranslations('Account');
  const listingReportT = useTranslations('ListingReport');
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { status: authStatus, profileStatus, user: currentUser } = useAuthStatus();
  const listingFormMessages: ListingFormMessages = {
    titleLabel: t('form.titleLabel'),
    categoryLabel: t('form.categoryLabel'),
    categoryPlaceholder: t('form.categoryPlaceholder'),
    subcategoryLabel: t('form.subcategoryLabel'),
    subcategoryPlaceholder: t('form.subcategoryPlaceholder'),
    typeLabel: t('form.typeLabel'),
    typePlaceholder: t('form.typePlaceholder'),
    buyTypeLabel: t('form.buyTypeLabel'),
    buyTypePlaceholder: t('form.buyTypePlaceholder'),
    descriptionLabel: t('form.descriptionLabel'),
    priceLabel: t('form.priceLabel'),
    locationLabel: t('form.locationLabel'),
    photosLabel: t('form.photosLabel'),
    photosHelp: t('form.photosHelp'),
    addPhotosButton: t('form.addPhotosButton'),
    coverPhotoLabel: t('form.coverPhotoLabel'),
    positionLabel: t('form.positionLabel'),
    movePhotoEarlierButton: t('form.movePhotoEarlierButton'),
    movePhotoLaterButton: t('form.movePhotoLaterButton'),
    removePhotoButton: t('form.removePhotoButton'),
    noPhotosMessage: t('form.noPhotosMessage'),
    imageRequirements: t('form.imageRequirements'),
    photoMaximumMessage: t('form.photoMaximumMessage'),
    photoTooLargeMessage: t('form.photoTooLargeMessage'),
    photoUnsupportedTypeMessage: t('form.photoUnsupportedTypeMessage'),
    photoAlt: ({ current, total }) => t('form.photoAlt', { current, total }),
    cancelButton: listingReportT('cancelButton'),
    validation: {
      titleRequired: t('validation.titleRequired'),
      descriptionRequired: t('validation.descriptionRequired'),
      locationRequired: t('validation.locationRequired'),
      categoryRequired: t('validation.categoryRequired'),
      priceRequired: t('validation.priceRequired'),
      housingTypeRequired: t('validation.housingTypeRequired'),
      marketplaceTypeRequired: t('validation.marketplaceTypeRequired'),
    },
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace('/sign-in?next=/post-ad');
    }
  }, [authStatus, router]);

  async function handleSubmit(
    values: ValidatedListingFormValues,
    photos: ListingPhotoFormItem[]
  ): Promise<void> {
    setErrors([]);
    setSuccessMessage('');

    if (isSubmitting) {
      return;
    }

    const ownerId = currentUser?.id;
    const publicDisplayName = currentUser?.displayName.trim() || '';
    const validationErrors: string[] = [];

    if (!publicDisplayName) {
      validationErrors.push(accountT('publicNameRequiredMessage'));
    }

    if (!ownerId) {
      validationErrors.push(t('saveFailedMessage'));
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!ownerId) {
      setErrors([t('saveFailedMessage')]);
      return;
    }

    setIsSubmitting(true);

    try {
      const createResult = await createDatabaseListingFromFormValues(values);

      if (!createResult.ok) {
        setErrors([t('saveFailedMessage')]);
        setIsSubmitting(false);
        return;
      }

      if (photos.length > 0) {
        const photoResult = await prepareListingPhotoMetadata(
          ownerId,
          String(createResult.listing.id),
          photos
        );

        if (!photoResult.ok) {
          setSuccessMessage(t('successMessage'));
          setErrors([t('photosSaveFailedMessage')]);
          setIsSubmitting(false);
          return;
        }

        const imageSaveResult = await saveDatabaseListingImagesOwnedBy(
          String(createResult.listing.id),
          ownerId,
          photoResult.images
        );

        if (!imageSaveResult.ok) {
          await cleanupUploadedListingPhotos(photoResult.uploadedStoragePaths);
          setSuccessMessage(t('successMessage'));
          setErrors([t('photosSaveFailedMessage')]);
          setIsSubmitting(false);
          return;
        }
      }

      setSuccessMessage(t('successMessage'));
      router.push(`/listing/${createResult.listing.id}`);
    } catch {
      setErrors([t('saveFailedMessage')]);
      setIsSubmitting(false);
    }
  }

  if (authStatus === 'authenticated' && profileStatus === 'error') {
    return <p className="form-error" role="alert">{accountT('unableLoadProfileMessage')}</p>;
  }

  if (authStatus !== 'authenticated' || profileStatus !== 'loaded' || !currentUser) {
    return <p className="page-description">{t('checkingAuthMessage')}</p>;
  }

  return (
    <ListingForm
      mode="create"
      categories={categories}
      submitButtonLabel={t('submitButton')}
      submittingButtonLabel={t('submittingButton')}
      isSubmitting={isSubmitting}
      externalErrors={errors}
      successMessage={successMessage}
      messages={listingFormMessages}
      onSubmit={handleSubmit}
    />
  );
}
