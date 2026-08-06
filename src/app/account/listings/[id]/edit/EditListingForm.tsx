'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ListingForm, { type ListingFormInitialValues } from '@/app/components/ListingForm';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import {
  findLocalListingById,
  subscribeToLocalListings,
  updateLocalListingOwnedBy,
} from '@/lib/localListings';
import { getListingPlaceholder } from '@/lib/listingPlaceholders';
import {
  getUserOwnerId,
  isListingOwnedByUser,
} from '@/lib/listingOwnership';
import type {
  ListingFormCategory,
  ValidatedListingFormValues,
} from '@/lib/listingFormValidation';
import { useAuthStatus } from '@/lib/auth/client';

type Props = {
  id: string;
  categories: ListingFormCategory[];
};

type EditListingStatus = 'checking' | 'ready' | 'not-found' | 'not-owned';

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

export default function EditListingForm({ id, categories }: Props) {
  const router = useRouter();
  const { status: authStatus, profileStatus, user: currentUser } = useAuthStatus();
  const ownerId = getUserOwnerId(currentUser);
  const [listing, setListing] = useState<Listing | null>(null);
  const [editStatus, setEditStatus] = useState<EditListingStatus>('checking');
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

    function refreshListing(): void {
      if (!id.startsWith('local-')) {
        setListing(null);
        setEditStatus('not-owned');
        return;
      }

      const localListing = findLocalListingById(id);

      if (!localListing) {
        setListing(null);
        setEditStatus('not-found');
        return;
      }

      if (!isListingOwnedByUser(localListing, currentUser)) {
        setListing(null);
        setEditStatus('not-owned');
        return;
      }

      setListing(localListing);
      setEditStatus('ready');
    }

    const frameId = window.requestAnimationFrame(refreshListing);
    const unsubscribe = subscribeToLocalListings(refreshListing);

    return () => {
      window.cancelAnimationFrame(frameId);
      unsubscribe();
    };
  }, [authStatus, currentUser, id, ownerId, profileStatus]);

  function handleSubmit(values: ValidatedListingFormValues): void {
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

    const updateResult = updateLocalListingOwnedBy(listing.id, ownerId, {
      title: values.title,
      description: values.description,
      price: values.price,
      location: values.location,
      categorySlug: values.categorySlug,
      subcategorySlug: values.subcategorySlug,
      image: getListingPlaceholder(values),
      sellerName: publicDisplayName,
      updatedAt: new Date().toISOString().slice(0, 10),
      ...(values.transactionType ? { transactionType: values.transactionType } : {}),
      ...(values.propertyType ? { propertyType: values.propertyType } : {}),
      ...(values.marketplaceType ? { marketplaceType: values.marketplaceType } : {}),
    });

    if (!updateResult.ok) {
      setIsSubmitting(false);
      setErrors([
        updateResult.reason === 'not-owned'
          ? content.editAdvertisementNotOwnedMessage
          : content.editAdvertisementSaveFailed,
      ]);
      return;
    }

    setSuccessMessage(content.editAdvertisementSavedMessage);
    router.push(`/listing/${updateResult.listing.id}?from=/account`);
  }

  if (
    authStatus !== 'authenticated' ||
    profileStatus === 'loading' ||
    editStatus === 'checking'
  ) {
    return <p className="page-description">{content.checkingAuthMessage}</p>;
  }

  if (profileStatus === 'error') {
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
      submitButtonLabel={content.editAdvertisementSaveButton}
      submittingButtonLabel={content.editAdvertisementSavingButton}
      isSubmitting={isSubmitting}
      externalErrors={errors}
      successMessage={successMessage}
      cancelHref="/account"
      onSubmit={handleSubmit}
    />
  );
}
