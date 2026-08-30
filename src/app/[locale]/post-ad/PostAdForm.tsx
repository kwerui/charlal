"use client";

import { useRouter } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import ListingForm from '@/app/components/ListingForm';
import { content } from '@/content/tyv';
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
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { status: authStatus, profileStatus, user: currentUser } = useAuthStatus();

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
      validationErrors.push(content.accountPublicNameRequiredMessage);
    }

    if (!ownerId) {
      validationErrors.push(content.postAdErrorSaveFailed);
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!ownerId) {
      setErrors([content.postAdErrorSaveFailed]);
      return;
    }

    setIsSubmitting(true);

    try {
      const createResult = await createDatabaseListingFromFormValues(values);

      if (!createResult.ok) {
        setErrors([content.postAdErrorSaveFailed]);
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
          setSuccessMessage(content.postAdSuccessMessage);
          setErrors([content.listingSavedPhotosFailedMessage]);
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
          setSuccessMessage(content.postAdSuccessMessage);
          setErrors([content.listingSavedPhotosFailedMessage]);
          setIsSubmitting(false);
          return;
        }
      }

      setSuccessMessage(content.postAdSuccessMessage);
      router.push(`/listing/${createResult.listing.id}`);
    } catch {
      setErrors([content.postAdErrorSaveFailed]);
      setIsSubmitting(false);
    }
  }

  if (authStatus === 'authenticated' && profileStatus === 'error') {
    return <p className="form-error" role="alert">{content.unableLoadProfileMessage}</p>;
  }

  if (authStatus !== 'authenticated' || profileStatus !== 'loaded' || !currentUser) {
    return <p className="page-description">{content.checkingAuthMessage}</p>;
  }

  return (
    <ListingForm
      mode="create"
      categories={categories}
      submitButtonLabel={content.postAdSubmitButton}
      submittingButtonLabel={content.postAdSubmittingButton}
      isSubmitting={isSubmitting}
      externalErrors={errors}
      successMessage={successMessage}
      onSubmit={handleSubmit}
    />
  );
}
