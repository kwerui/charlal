'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ListingForm, { type ListingFormInitialValues } from '@/app/components/ListingForm';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { getUserOwnerId } from '@/lib/listingOwnership';
import type {
  ListingFormCategory,
  ValidatedListingFormValues,
} from '@/lib/listingFormValidation';
import type { ListingPhotoFormItem } from '@/lib/listingPhotoForm';
import { useAuthStatus } from '@/lib/auth/client';
import { hasActiveEditNavigation } from '@/lib/editNavigationStorage';
import { recordListingMutationRefreshIntent } from '@/lib/listingMutationRefreshStorage';
import {
  findOwnedDatabaseListingById,
  saveDatabaseListingImagesOwnedBy,
  updateDatabaseListingOwnedBy,
} from '@/lib/supabase/listingsClient';
import {
  cleanupUploadedListingPhotos,
  prepareListingPhotoMetadata,
} from '@/lib/supabase/listingPhotoUploadsClient';
import { hasActiveResultsNavigation } from '@/lib/resultsScrollStorage';
import { revalidateEditedListingRoutes } from './actions';

type Props = {
  id: string;
  categories: ListingFormCategory[];
  initialEditStatus: EditListingStatus;
  initialListing: Listing | null;
  editOrigin: string | undefined;
};

type EditListingStatus =
  | 'checking'
  | 'ready'
  | 'not-found'
  | 'not-owned'
  | 'unavailable';

function getEditListingInitialValues(listing: Listing): ListingFormInitialValues {
  return {
    title: listing.title,
    description: listing.description,
    price: listing.price,
    location: listing.location,
    categorySlug: listing.categorySlug,
    subcategorySlug: listing.subcategorySlug,
    typeSlug: listing.propertyType,
    buyTypeSlug: listing.marketplaceType,
  };
}

export default function EditListingForm({
  id,
  categories,
  initialEditStatus,
  initialListing,
  editOrigin,
}: Props) {
  const router = useRouter();
  const { status: authStatus, profileStatus, user: currentUser } = useAuthStatus();
  const ownerId = getUserOwnerId(currentUser);
  const [listing, setListing] = useState<Listing | null>(initialListing);
  const [editStatus, setEditStatus] =
    useState<EditListingStatus>(initialEditStatus);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace(
        `/sign-in?next=${encodeURIComponent(`/account/listings/${id}/edit`)}`
      );
    }
  }, [authStatus, id, router]);

  useEffect(() => {
    if (
      authStatus !== 'authenticated' ||
      profileStatus !== 'loaded' ||
      !currentUser ||
      !ownerId
    ) {
      return undefined;
    }

    let active = true;
    const safeOwnerId = ownerId;

    async function refreshListing(): Promise<void> {
      const result = await findOwnedDatabaseListingById(id, safeOwnerId);

      if (!active) {
        return;
      }

      if (!result.ok) {
        setListing(null);
        setEditStatus(
          result.reason === 'database-unavailable'
            ? 'unavailable'
            : result.reason === 'not-found'
            ? 'not-found'
            : 'not-owned'
        );
        return;
      }

      setListing(result.listing);
      setEditStatus('ready');
    }

    void refreshListing();

    return () => {
      active = false;
    };
  }, [authStatus, currentUser, id, ownerId, profileStatus]);

  async function handleSubmit(
    values: ValidatedListingFormValues,
    photos: ListingPhotoFormItem[]
  ): Promise<void> {
    setErrors([]);
    setSuccessMessage('');

    if (!listing || !currentUser || !ownerId || isSubmitting) {
      return;
    }

    const publicDisplayName = currentUser.displayName.trim();

    if (!publicDisplayName) {
      setErrors([content.accountPublicNameRequiredMessage]);
      return;
    }

    setIsSubmitting(true);

    const updateResult = await updateDatabaseListingOwnedBy(
      String(listing.id),
      ownerId,
      values
    );

    if (!updateResult.ok) {
      setIsSubmitting(false);
      setErrors([
        updateResult.reason === 'not-owned'
          ? content.editAdvertisementNotOwnedMessage
          : content.editAdvertisementSaveFailed,
      ]);
      return;
    }

    const photoResult = await prepareListingPhotoMetadata(
      ownerId,
      String(updateResult.listing.id),
      photos
    );

    if (!photoResult.ok) {
      setIsSubmitting(false);
      setSuccessMessage(content.editAdvertisementSavedMessage);
      setErrors([content.unableUploadPhotoMessage]);
      return;
    }

    const imageSaveResult = await saveDatabaseListingImagesOwnedBy(
      String(updateResult.listing.id),
      ownerId,
      photoResult.images
    );

    if (!imageSaveResult.ok) {
      await cleanupUploadedListingPhotos(photoResult.uploadedStoragePaths);
      setIsSubmitting(false);
      setSuccessMessage(content.editAdvertisementSavedMessage);
      setErrors([content.unableUploadPhotoMessage]);
      return;
    }

    setSuccessMessage(content.editAdvertisementSavedMessage);
    await revalidateEditedListingRoutes({
      listingId: String(imageSaveResult.listing.id),
    });
    recordListingMutationRefreshIntent(String(imageSaveResult.listing.id));

    if (editOrigin === '/account' && hasActiveResultsNavigation('/account')) {
      router.back();
      return;
    }

    if (editOrigin && hasActiveEditNavigation(editOrigin)) {
      router.back();
      return;
    }

    router.replace('/account');
  }

  function handleCancel(): void {
    if (editOrigin === '/account' && hasActiveResultsNavigation('/account')) {
      router.back();
      return;
    }

    router.push(editOrigin || '/account');
  }

  if (authStatus === 'unauthenticated' || editStatus === 'checking') {
    return (
      <div className="edit-listing-loading-skeleton" aria-busy="true">
        <div className="edit-listing-loading-skeleton-row" />
        <div className="edit-listing-loading-skeleton-row" />
        <div className="edit-listing-loading-skeleton-block" />
        <div className="edit-listing-loading-skeleton-row edit-listing-loading-skeleton-row--short" />
      </div>
    );
  }

  if (authStatus === 'authenticated' && profileStatus === 'error') {
    return (
      <div className="empty-results" role="status">
        <h3>{content.editAdvertisementUnableMessage}</h3>
        <p>{content.unableLoadProfileMessage}</p>
        <Link href="/account" className="secondary-button edit-listing-state-link">
          {content.backToAccount}
        </Link>
      </div>
    );
  }

  if (editStatus === 'not-found') {
    return (
      <div className="empty-results" role="status">
        <h3>{content.editAdvertisementNotFoundTitle}</h3>
        <p>{content.editAdvertisementUnableMessage}</p>
        <Link href="/account" className="secondary-button edit-listing-state-link">
          {content.backToAccount}
        </Link>
      </div>
    );
  }

  if (editStatus === 'unavailable') {
    return (
      <div className="empty-results" role="alert">
        <h3>{content.editAdvertisementUnableMessage}</h3>
        <p>{content.databaseListingsLoadFailedMessage}</p>
        <Link href="/account" className="secondary-button edit-listing-state-link">
          {content.backToAccount}
        </Link>
      </div>
    );
  }

  if (editStatus === 'not-owned' || !listing) {
    return (
      <div className="empty-results" role="status">
        <h3>{content.editAdvertisementNotOwnedTitle}</h3>
        <p>{content.editAdvertisementNotOwnedMessage}</p>
        <Link href="/account" className="secondary-button edit-listing-state-link">
          {content.backToAccount}
        </Link>
      </div>
    );
  }

  return (
    <ListingForm
      mode="edit"
      categories={categories}
      initialValues={getEditListingInitialValues(listing)}
      initialImages={listing.images || []}
      submitButtonLabel={content.editAdvertisementSaveButton}
      submittingButtonLabel={content.editAdvertisementSavingButton}
      isSubmitting={isSubmitting}
      externalErrors={errors}
      successMessage={successMessage}
      cancelHref={editOrigin || '/account'}
      onCancel={handleCancel}
      onSubmit={handleSubmit}
    />
  );
}
