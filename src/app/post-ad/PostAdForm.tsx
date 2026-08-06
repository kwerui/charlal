"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ListingForm from '@/app/components/ListingForm';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { listings } from '@/data/listings';
import {
  getDemoUserDisplayName,
  getDemoUser,
} from '@/lib/demoAuth';
import {
  addLocalListing,
  createLocalListingId,
  readLocalListings,
} from '@/lib/localListings';
import { getListingPlaceholder } from '@/lib/listingPlaceholders';
import { getDemoUserOwnerId } from '@/lib/listingOwnership';
import type {
  ListingFormCategory,
  ValidatedListingFormValues,
} from '@/lib/listingFormValidation';
import { useDemoAuthStatus } from '@/lib/useDemoAuthStatus';

type Props = {
  categories: ListingFormCategory[];
};

export default function PostAdForm({ categories }: Props) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { status: authStatus } = useDemoAuthStatus();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace('/sign-in?next=/post-ad');
    }
  }, [authStatus, router]);

  function handleSubmit(values: ValidatedListingFormValues): void {
    setErrors([]);
    setSuccessMessage('');

    if (isSubmitting) {
      return;
    }

    const demoUser = getDemoUser();
    const ownerId = getDemoUserOwnerId(demoUser);
    const publicDisplayName = getDemoUserDisplayName(demoUser);
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

    setIsSubmitting(true);

    try {
      const localListings = readLocalListings();
      const id = createLocalListingId([
        ...listings.map((listing) => listing.id),
        ...localListings.map((listing) => listing.id),
      ]);

      const newListing: Listing = {
        id,
        title: values.title,
        description: values.description,
        price: values.price,
        location: values.location,
        categorySlug: values.categorySlug,
        subcategorySlug: values.subcategorySlug,
        // TODO: replace this placeholder with real image upload when a backend is added.
        image: getListingPlaceholder(values),
        sellerName: publicDisplayName,
        datePosted: new Date().toISOString().slice(0, 10),
        ownerId,
        ...(values.transactionType ? { transactionType: values.transactionType } : {}),
        ...(values.propertyType ? { propertyType: values.propertyType } : {}),
        ...(values.marketplaceType ? { marketplaceType: values.marketplaceType } : {}),
      };

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

  if (authStatus !== 'authenticated') {
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
