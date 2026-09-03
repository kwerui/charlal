'use client';

import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import { updateListingStatusAction } from '@/app/account/listingStatusActions';
import ListingForm, {
  type ListingFormInitialValues,
  type ListingFormMessages,
  type ListingFormStatusMessages,
} from '@/app/components/ListingForm';
import { useTranslations } from 'next-intl';
import type { Listing, ListingStatus } from '@/data/listings';
import { getListingStatus } from '@/data/listings';
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
import { createClient } from '@/lib/supabase/client';
import {
  getRecordedListingTransactionForListing,
  listSaleBuyerCandidates,
  type RecordedListingTransaction,
  type SaleBuyerCandidate,
} from '@/lib/supabase/reviews';
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

const SOLD_BUYER_PLACEHOLDER_VALUE = '__select_buyer__';
const SOLD_OUTSIDE_CHARLAL_VALUE = '__outside_charlal__';

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
  const t = useTranslations('EditListing');
  const postAdT = useTranslations('PostAd');
  const accountT = useTranslations('Account');
  const listingCardT = useTranslations('ListingCard');
  const listingDetailT = useTranslations('ListingDetail');
  const listingReportT = useTranslations('ListingReport');
  const { status: authStatus, profileStatus, user: currentUser } = useAuthStatus();
  const ownerId = getUserOwnerId(currentUser);
  const [listing, setListing] = useState<Listing | null>(initialListing);
  const [editStatus, setEditStatus] =
    useState<EditListingStatus>(initialEditStatus);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ListingStatus>(
    initialListing ? getListingStatus(initialListing) : 'active'
  );
  const [soldBuyerChoice, setSoldBuyerChoice] = useState(
    SOLD_BUYER_PLACEHOLDER_VALUE
  );
  const [saleBuyerCandidates, setSaleBuyerCandidates] = useState<
    SaleBuyerCandidate[]
  >([]);
  const [saleBuyerCandidatesLoaded, setSaleBuyerCandidatesLoaded] =
    useState(false);
  const [recordedListingTransaction, setRecordedListingTransaction] =
    useState<RecordedListingTransaction | null>(null);
  const [soldBuyerValidationError, setSoldBuyerValidationError] = useState('');
  const listingFormMessages: ListingFormMessages = {
    titleLabel: postAdT('form.titleLabel'),
    categoryLabel: postAdT('form.categoryLabel'),
    categoryPlaceholder: postAdT('form.categoryPlaceholder'),
    subcategoryLabel: postAdT('form.subcategoryLabel'),
    subcategoryPlaceholder: postAdT('form.subcategoryPlaceholder'),
    typeLabel: postAdT('form.typeLabel'),
    typePlaceholder: postAdT('form.typePlaceholder'),
    buyTypeLabel: postAdT('form.buyTypeLabel'),
    buyTypePlaceholder: postAdT('form.buyTypePlaceholder'),
    descriptionLabel: postAdT('form.descriptionLabel'),
    priceLabel: postAdT('form.priceLabel'),
    locationLabel: postAdT('form.locationLabel'),
    photosLabel: postAdT('form.photosLabel'),
    photosHelp: postAdT('form.photosHelp'),
    addPhotosButton: postAdT('form.addPhotosButton'),
    coverPhotoLabel: postAdT('form.coverPhotoLabel'),
    positionLabel: postAdT('form.positionLabel'),
    movePhotoEarlierButton: postAdT('form.movePhotoEarlierButton'),
    movePhotoLaterButton: postAdT('form.movePhotoLaterButton'),
    removePhotoButton: postAdT('form.removePhotoButton'),
    noPhotosMessage: postAdT('form.noPhotosMessage'),
    imageRequirements: postAdT('form.imageRequirements'),
    photoMaximumMessage: postAdT('form.photoMaximumMessage'),
    photoTooLargeMessage: postAdT('form.photoTooLargeMessage'),
    photoUnsupportedTypeMessage: postAdT('form.photoUnsupportedTypeMessage'),
    photoAlt: ({ current, total }) =>
      postAdT('form.photoAlt', { current, total }),
    cancelButton: listingReportT('cancelButton'),
    validation: {
      titleRequired: postAdT('validation.titleRequired'),
      descriptionRequired: postAdT('validation.descriptionRequired'),
      locationRequired: postAdT('validation.locationRequired'),
      categoryRequired: postAdT('validation.categoryRequired'),
      priceRequired: postAdT('validation.priceRequired'),
      housingTypeRequired: postAdT('validation.housingTypeRequired'),
      marketplaceTypeRequired: postAdT('validation.marketplaceTypeRequired'),
    },
  };
  const listingFormStatusMessages: ListingFormStatusMessages = {
    label: t('status.label'),
    options: {
      active: listingCardT('status.active'),
      reserved: listingCardT('status.reserved'),
      sold: listingCardT('status.sold'),
      archived: listingCardT('status.archived'),
    },
    help: {
      active: t('status.help.active'),
      reserved: t('status.help.reserved'),
      sold: t('status.help.sold'),
      archived: t('status.help.archived'),
    },
  };

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
      setSelectedStatus(getListingStatus(result.listing));
      setEditStatus('ready');
    }

    void refreshListing();

    return () => {
      active = false;
    };
  }, [authStatus, currentUser, id, ownerId, profileStatus]);

  useEffect(() => {
    if (
      selectedStatus !== 'sold' ||
      authStatus !== 'authenticated' ||
      !listing
    ) {
      return undefined;
    }

    let active = true;
    const currentListing = listing;

    async function refreshSaleBuyerCandidates(): Promise<void> {
      const supabase = createClient();
      const [candidates, recordedTransaction] = await Promise.all([
        listSaleBuyerCandidates(supabase, String(currentListing.id)),
        getRecordedListingTransactionForListing(
          supabase,
          String(currentListing.id)
        ),
      ]);

      if (!active) {
        return;
      }

      setSaleBuyerCandidates(candidates);
      setRecordedListingTransaction(recordedTransaction);
      setSaleBuyerCandidatesLoaded(true);
      setSoldBuyerValidationError('');
      setSoldBuyerChoice((currentBuyerChoice) => {
        if (recordedTransaction) {
          return recordedTransaction.buyerId;
        }

        if (candidates.length === 0) {
          return SOLD_OUTSIDE_CHARLAL_VALUE;
        }

        return candidates.some(
          (candidate) => candidate.buyerId === currentBuyerChoice
        )
          ? currentBuyerChoice
          : SOLD_BUYER_PLACEHOLDER_VALUE;
      });
    }

    void refreshSaleBuyerCandidates();

    return () => {
      active = false;
    };
  }, [authStatus, listing, selectedStatus]);

  async function handleSubmit(
    values: ValidatedListingFormValues,
    photos: ListingPhotoFormItem[]
  ): Promise<void> {
    setErrors([]);
    setSuccessMessage('');

    if (!listing || !currentUser || !ownerId || isSubmitting) {
      return;
    }

    const originalStatus = getListingStatus(listing);
    const publicDisplayName = currentUser.displayName.trim();
    const selectedSoldBuyerId =
      selectedStatus === 'sold' &&
      !recordedListingTransaction &&
      soldBuyerChoice !== SOLD_BUYER_PLACEHOLDER_VALUE &&
      soldBuyerChoice !== SOLD_OUTSIDE_CHARLAL_VALUE
        ? soldBuyerChoice
        : null;

    if (!publicDisplayName) {
      setErrors([accountT('publicNameRequiredMessage')]);
      return;
    }

    if (
      selectedStatus === 'sold' &&
      !recordedListingTransaction &&
      !saleBuyerCandidatesLoaded
    ) {
      setSoldBuyerValidationError(t('soldBuyer.loadingMessage'));
      setErrors([t('soldBuyer.loadingMessage')]);
      return;
    }

    if (
      selectedStatus === 'sold' &&
      !recordedListingTransaction &&
      saleBuyerCandidates.length > 0 &&
      soldBuyerChoice === SOLD_BUYER_PLACEHOLDER_VALUE
    ) {
      setSoldBuyerValidationError(t('soldBuyer.requiredMessage'));
      setErrors([t('soldBuyer.requiredMessage')]);
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
          ? t('notOwnedMessage')
          : t('saveFailedMessage'),
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
      setSuccessMessage(t('savedMessage'));
      setErrors([t('photosSaveFailedMessage')]);
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
      setSuccessMessage(t('savedMessage'));
      setErrors([t('photosSaveFailedMessage')]);
      return;
    }

    if (selectedStatus !== originalStatus) {
      const statusResult = await updateListingStatusAction({
        listingId: String(imageSaveResult.listing.id),
        status: selectedStatus,
        buyerId: selectedStatus === 'sold' ? selectedSoldBuyerId : null,
      });

      if (!statusResult.ok) {
        setIsSubmitting(false);
        setListing(imageSaveResult.listing);
        setSuccessMessage('');
        setErrors([t('statusUpdateFailedMessage')]);
        return;
      }
    }

    setSuccessMessage(t('savedMessage'));
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
        <h3>{t('unableTitle')}</h3>
        <p>{accountT('unableLoadProfileMessage')}</p>
        <Link href="/account" className="secondary-button edit-listing-state-link">
          {listingDetailT('backToAccount')}
        </Link>
      </div>
    );
  }

  if (editStatus === 'not-found') {
    return (
      <div className="empty-results" role="status">
        <h3>{t('notFoundTitle')}</h3>
        <p>{t('unableTitle')}</p>
        <Link href="/account" className="secondary-button edit-listing-state-link">
          {listingDetailT('backToAccount')}
        </Link>
      </div>
    );
  }

  if (editStatus === 'unavailable') {
    return (
      <div className="empty-results" role="alert">
        <h3>{t('unableTitle')}</h3>
        <p>{listingDetailT('databaseListingsLoadFailedMessage')}</p>
        <Link href="/account" className="secondary-button edit-listing-state-link">
          {listingDetailT('backToAccount')}
        </Link>
      </div>
    );
  }

  if (editStatus === 'not-owned' || !listing) {
    return (
      <div className="empty-results" role="status">
        <h3>{t('notOwnedTitle')}</h3>
        <p>{t('notOwnedMessage')}</p>
        <Link href="/account" className="secondary-button edit-listing-state-link">
          {listingDetailT('backToAccount')}
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
      statusField={{
        value: selectedStatus,
        messages: listingFormStatusMessages,
        onChange: (status) => {
          setSelectedStatus(status);
          if (status !== 'sold') {
            setSoldBuyerChoice(SOLD_BUYER_PLACEHOLDER_VALUE);
            setRecordedListingTransaction(null);
          } else {
            setSaleBuyerCandidatesLoaded(false);
          }
          setSoldBuyerValidationError('');
          setErrors([]);
          setSuccessMessage('');
        },
        disabled: isSubmitting,
        soldBuyerControl:
          selectedStatus === 'sold' ? (
            <div className="sold-buyer-control">
              {recordedListingTransaction ? (
                <div className="sold-buyer-recorded">
                  <span>{t('soldBuyer.recordedLabel')}</span>
                  <strong>
                    {saleBuyerCandidates.find(
                      (candidate) =>
                        candidate.buyerId === recordedListingTransaction.buyerId
                    )?.displayName || t('soldBuyer.recordedFallback')}
                  </strong>
                </div>
              ) : (
                <label className="form-field" htmlFor="sold-buyer">
                  <span>{t('soldBuyer.label')}</span>
                  <select
                    id="sold-buyer"
                    name="soldBuyer"
                    value={soldBuyerChoice}
                    onChange={(event) => {
                      setSoldBuyerChoice(event.target.value);
                      setSoldBuyerValidationError('');
                      setErrors([]);
                      setSuccessMessage('');
                    }}
                    disabled={isSubmitting || !saleBuyerCandidatesLoaded}
                    aria-invalid={Boolean(soldBuyerValidationError)}
                    aria-describedby={
                      soldBuyerValidationError ? 'sold-buyer-error' : undefined
                    }
                  >
                    {!saleBuyerCandidatesLoaded ? (
                      <option value={SOLD_BUYER_PLACEHOLDER_VALUE}>
                        {t('soldBuyer.loadingMessage')}
                      </option>
                    ) : null}
                    {saleBuyerCandidatesLoaded &&
                    saleBuyerCandidates.length > 0 ? (
                      <option value={SOLD_BUYER_PLACEHOLDER_VALUE} disabled>
                        {t('soldBuyer.placeholder')}
                      </option>
                    ) : null}
                    <option value={SOLD_OUTSIDE_CHARLAL_VALUE}>
                      {t('soldBuyer.outsideCharlalOption')}
                    </option>
                    {saleBuyerCandidates.map((candidate) => (
                      <option key={candidate.buyerId} value={candidate.buyerId}>
                        {candidate.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="form-help">
                {recordedListingTransaction
                  ? t('soldBuyer.recordedHelp')
                  : saleBuyerCandidatesLoaded
                  ? saleBuyerCandidates.length > 0
                    ? t('soldBuyer.help')
                    : t('soldBuyer.noCandidatesHelp')
                  : t('soldBuyer.loadingMessage')}
              </p>
              {soldBuyerValidationError ? (
                <p id="sold-buyer-error" className="form-error" role="alert">
                  {soldBuyerValidationError}
                </p>
              ) : null}
            </div>
          ) : null,
      }}
      submitButtonLabel={t('saveButton')}
      submittingButtonLabel={t('savingButton')}
      isSubmitting={isSubmitting}
      externalErrors={errors}
      successMessage={successMessage}
      messages={listingFormMessages}
      cancelHref={editOrigin || '/account'}
      onCancel={handleCancel}
      onSubmit={handleSubmit}
    />
  );
}
