'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AccountNativeHistoryRestorer from '@/app/account/AccountNativeHistoryRestorer';
import AccountRefreshScrollManager from '@/app/account/AccountRefreshScrollManager';
import ListingCard from '@/app/components/ListingCard';
import ResultsScrollRestorer from '@/app/components/ResultsScrollRestorer';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import { useMessagingRealtime } from '@/lib/messagingRealtime';
import {
  getUnassignedLocalListings,
  removeLocalListingsById,
  subscribeToLocalListings,
} from '@/lib/localListings';
import {
  getUserOwnerId,
  isListingOwnedByUser,
} from '@/lib/listingOwnership';
import { shouldRefreshForListingMutation } from '@/lib/listingMutationRefreshStorage';
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  PROFILE_LOCATION_MAX_LENGTH,
  type AppUser,
  type AppProfile,
  isValidProfileDisplayName,
  sanitizeProfileDisplayName,
  sanitizeOptionalProfileText,
} from '@/lib/auth/types';
import { useAuthStatus } from '@/lib/auth/client';
import {
  createDatabaseListingFromExistingListing,
  deleteDatabaseListingOwnedBy,
  listOwnedDatabaseListings,
} from '@/lib/supabase/listingsClient';
import { saveResultsScrollPosition } from '@/lib/resultsScrollStorage';

type Props = {
  initialAuthStatus: 'signed-in' | 'unresolved';
  initialUser: AppUser | null;
  initialProfile: AppProfile | null;
  initialOwnedListings: Listing[];
  initialListingsLoaded: boolean;
  initialListingsError: boolean;
};

type RefreshListingSectionsOptions = {
  force?: boolean;
};

export default function AccountDashboard({
  initialAuthStatus,
  initialUser,
  initialProfile,
  initialOwnedListings,
  initialListingsLoaded,
  initialListingsError,
}: Props) {
  const router = useRouter();
  const accountContentRef = useRef<HTMLDivElement | null>(null);
  const {
    status: authStatus,
    profileStatus,
    legacyMigrationStatus,
    legacyMigrationCount,
    legacyMigrationError,
    user: currentUser,
    profile: currentProfile,
    updateProfile,
  } = useAuthStatus();
  const { unreadConversationCount } = useMessagingRealtime();
  const accountUser =
    authStatus === 'unauthenticated' ? null : currentUser ?? initialUser;
  const accountProfile =
    authStatus === 'unauthenticated' ? null : currentProfile ?? initialProfile;
  const ownerId = getUserOwnerId(accountUser);
  const hasUsableInitialListings = Boolean(
    initialUser && initialListingsLoaded && !initialListingsError
  );
  const initialListingRefreshSettledRef = useRef(false);
  const [ownedListings, setOwnedListings] =
    useState<Listing[]>(initialOwnedListings);
  const [unassignedListings, setUnassignedListings] = useState<Listing[]>([]);
  const [listingSectionsLoaded, setListingSectionsLoaded] =
    useState(initialListingsLoaded);
  const [listingSectionsError, setListingSectionsError] = useState(
    initialListingsError ? content.databaseListingsLoadFailedMessage : ''
  );
  const [displayNameInput, setDisplayNameInput] = useState(
    initialUser?.displayName || ''
  );
  const [bioInput, setBioInput] = useState(initialProfile?.bio || '');
  const [locationInput, setLocationInput] = useState(
    initialProfile?.location || ''
  );
  const [publicNameMessage, setPublicNameMessage] = useState('');
  const [publicNameError, setPublicNameError] = useState('');
  const [listingToDelete, setListingToDelete] = useState<Listing | null>(null);
  const [listingToClaim, setListingToClaim] = useState<Listing | null>(null);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteErrorListingId, setDeleteErrorListingId] = useState<string | null>(
    null
  );
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const deleteConfirmationRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace('/sign-in?next=/account');
    }
  }, [authStatus, router]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setDisplayNameInput(accountUser?.displayName || '');
      setBioInput(accountProfile?.bio || '');
      setLocationInput(accountProfile?.location || '');
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [accountProfile, accountUser]);

  const refreshListingSections = useCallback(async (
    options: RefreshListingSectionsOptions = {}
  ) => {
    setUnassignedListings(getUnassignedLocalListings());

    if (authStatus === 'unauthenticated') {
      setOwnedListings([]);
      setListingSectionsLoaded(false);
      setListingSectionsError('');
      return;
    }

    if (!accountUser || !ownerId) {
      setListingSectionsLoaded(initialListingsLoaded);
      return;
    }

    if (legacyMigrationStatus !== 'complete') {
      setListingSectionsLoaded(initialListingsLoaded);
      return;
    }

    if (
      !options.force &&
      hasUsableInitialListings &&
      !initialListingRefreshSettledRef.current &&
      legacyMigrationCount === 0 &&
      !legacyMigrationError
    ) {
      initialListingRefreshSettledRef.current = true;
      setListingSectionsLoaded(true);
      return;
    }

    initialListingRefreshSettledRef.current = true;
    const ownedListingsResult = await listOwnedDatabaseListings(ownerId);

    if (ownedListingsResult.ok) {
      setOwnedListings(ownedListingsResult.listings);
      setListingSectionsError('');
    } else {
      setOwnedListings([]);
      setListingSectionsError(content.databaseListingsLoadFailedMessage);
    }

    setListingSectionsLoaded(true);
  }, [
    accountUser,
    authStatus,
    hasUsableInitialListings,
    initialListingsLoaded,
    legacyMigrationCount,
    legacyMigrationError,
    legacyMigrationStatus,
    ownerId,
  ]);

  useEffect(() => {
    function refreshIfActive(): void {
      void refreshListingSections();
    }

    const frameId = window.requestAnimationFrame(refreshIfActive);
    const unsubscribe = subscribeToLocalListings(refreshIfActive);

    return () => {
      window.cancelAnimationFrame(frameId);
      unsubscribe();
    };
  }, [refreshListingSections]);

  useEffect(() => {
    if (
      ownedListings.length === 0 ||
      !shouldRefreshForListingMutation(
        ownedListings.map((listing) => String(listing.id)),
        '/account'
      )
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      void refreshListingSections({ force: true });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [ownedListings, refreshListingSections]);

  useEffect(() => {
    if (!listingToDelete) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const confirmation =
        deleteConfirmationRefs.current[String(listingToDelete.id)];

      if (!confirmation) {
        return;
      }

      const rect = confirmation.getBoundingClientRect();
      const outsideViewport = rect.top < 0 || rect.bottom > window.innerHeight;

      if (outsideViewport) {
        confirmation.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [listingToDelete]);

  const deleteTargetStillOwned = useMemo(() => {
    return Boolean(
      listingToDelete &&
        accountUser &&
        isListingOwnedByUser(listingToDelete, accountUser) &&
        ownedListings.some((listing) => listing.id === listingToDelete.id)
    );
  }, [accountUser, listingToDelete, ownedListings]);

  const claimTargetStillUnassigned = useMemo(() => {
    return Boolean(
      listingToClaim &&
        !listingToClaim.ownerId &&
        unassignedListings.some((listing) => listing.id === listingToClaim.id)
    );
  }, [listingToClaim, unassignedListings]);

  async function handlePublicNameSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPublicNameMessage('');
    setPublicNameError('');

    const safeDisplayName = sanitizeProfileDisplayName(displayNameInput);
    const trimmedBio = bioInput.trim();
    const trimmedLocation = locationInput.trim();

    if (!isValidProfileDisplayName(safeDisplayName)) {
      setPublicNameError(
        safeDisplayName
          ? content.displayNameInvalidMessage
          : content.accountPublicNameRequiredMessage
      );
      return;
    }

    if (
      trimmedBio.length > PROFILE_BIO_MAX_LENGTH ||
      trimmedLocation.length > PROFILE_LOCATION_MAX_LENGTH
    ) {
      setPublicNameError(content.accountProfileDetailsInvalidMessage);
      return;
    }

    const updateResult = await updateProfile({
      displayName: safeDisplayName,
      bio: bioInput,
      location: locationInput,
    });

    if (!updateResult.ok) {
      setPublicNameError(
        updateResult.reason === 'invalid-display-name'
          ? content.accountPublicNameRequiredMessage
          : updateResult.reason === 'invalid-profile-details'
          ? content.accountProfileDetailsInvalidMessage
          : content.accountPublicNameSaveFailedMessage
      );
      return;
    }

    void refreshListingSections({ force: true });

    setDisplayNameInput(updateResult.user.displayName);
    setBioInput(
      sanitizeOptionalProfileText(updateResult.profile.bio || '', PROFILE_BIO_MAX_LENGTH) || ''
    );
    setLocationInput(
      sanitizeOptionalProfileText(
        updateResult.profile.location || '',
        PROFILE_LOCATION_MAX_LENGTH
      ) || ''
    );
    setPublicNameMessage(content.profileUpdatedMessage);
  }

  function startDelete(listing: Listing): void {
    setDeleteMessage('');
    setDeleteErrorListingId(null);
    setDeleteErrorMessage('');
    setListingToDelete(listing);
  }

  function cancelDelete(): void {
    if (!isDeleting) {
      setListingToDelete(null);
      setDeleteErrorListingId(null);
      setDeleteErrorMessage('');
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!listingToDelete || !ownerId || isDeleting) {
      return;
    }

    setIsDeleting(true);
    const deleteResult = await deleteDatabaseListingOwnedBy(
      String(listingToDelete.id),
      ownerId
    );
    setIsDeleting(false);

    if (deleteResult.ok) {
      await refreshListingSections({ force: true });
      setListingToDelete(null);
      setDeleteErrorListingId(null);
      setDeleteErrorMessage('');
      setDeleteMessage(content.advertisementDeletedMessage);
      return;
    }

    setDeleteErrorListingId(String(listingToDelete.id));
    setDeleteErrorMessage(content.advertisementDeleteFailedMessage);
  }

  function startClaim(listing: Listing): void {
    setClaimMessage('');
    setListingToClaim(listing);
  }

  function cancelClaim(): void {
    if (!isClaiming) {
      setListingToClaim(null);
    }
  }

  function saveAccountScrollForEdit(
    event: MouseEvent<HTMLAnchorElement>
  ): void {
    const targetUrl = new URL(event.currentTarget.href);

    saveResultsScrollPosition(
      '/account',
      `${targetUrl.pathname}${targetUrl.search}`
    );
  }

  async function confirmClaim(): Promise<void> {
    if (!listingToClaim || !ownerId || !currentUser || isClaiming) {
      return;
    }

    setIsClaiming(true);
    const claimResult = await createDatabaseListingFromExistingListing({
      ...listingToClaim,
      ownerId,
      sellerName: currentUser.displayName,
    });
    setIsClaiming(false);

    if (claimResult.ok) {
      removeLocalListingsById([listingToClaim.id]);
      await refreshListingSections({ force: true });
      setListingToClaim(null);
      setClaimMessage(content.advertisementClaimedMessage);
      return;
    }

    setClaimMessage(content.advertisementClaimFailedMessage);
    setListingToClaim(null);
  }

  const accountReady =
    authStatus === 'authenticated' &&
    profileStatus === 'loaded' &&
    legacyMigrationStatus === 'complete' &&
    Boolean(currentUser) &&
    Boolean(ownerId) &&
    listingSectionsLoaded;
  const canHoldVisualRestoration =
    authStatus !== 'unauthenticated' &&
    Boolean(accountUser) &&
    Boolean(ownerId);
  const canRenderAccount = Boolean(accountUser) && Boolean(ownerId);
  const renderedUser = canRenderAccount ? accountUser : null;

  if (authStatus === 'authenticated' && profileStatus === 'error') {
    return (
      <>
        <AccountNativeHistoryRestorer
          accountReady={false}
          canHoldVisualRestoration={false}
          contentRef={accountContentRef}
        />
        <AccountRefreshScrollManager ready={false} />
        <div className="empty-results" role="alert">
          <h3>{content.unableLoadProfileMessage}</h3>
          <p>{content.accountProfileLoadFailedMessage}</p>
        </div>
      </>
    );
  }

  if (!renderedUser) {
    return (
      <>
        <AccountNativeHistoryRestorer
          accountReady={accountReady}
          canHoldVisualRestoration={canHoldVisualRestoration}
          contentRef={accountContentRef}
        />
        <AccountRefreshScrollManager ready={false} />
        <div
          className="account-loading-skeleton"
          aria-busy="true"
          data-initial-auth-status={initialAuthStatus}
        >
          <div className="account-loading-skeleton-row" />
          <div className="account-loading-skeleton-row account-loading-skeleton-row--short" />
          <div className="account-loading-skeleton-card" />
          <div className="account-loading-skeleton-card" />
        </div>
      </>
    );
  }

  return (
    <div className="account-content" ref={accountContentRef}>
      <section className="account-info" aria-labelledby="account-info-title">
        <h3 id="account-info-title">{content.accountInfoTitle}</h3>
        <p>
          <span>{content.accountEmailLabel}</span>
          <strong>{renderedUser.email}</strong>
        </p>
        <p>
          <span>{content.accountPublicNameLabel}</span>
          <strong>
            {renderedUser.displayName || content.publicSellerFallbackLabel}
          </strong>
        </p>
        <div className="account-quick-actions">
          {accountProfile?.publicSlug ? (
            <Link
              href={`/seller/${accountProfile.publicSlug}`}
              className="secondary-button account-public-profile-link"
            >
              {content.viewPublicProfileLabel}
            </Link>
          ) : null}
          <Link href="/account/messages" className="secondary-button account-messages-link">
            <span>{content.messagesTitle}</span>
            {unreadConversationCount > 0 ? (
              <span className="header-unread-badge">
                {unreadConversationCount > 99
                  ? '99+'
                  : unreadConversationCount}
              </span>
            ) : null}
          </Link>
        </div>
        {legacyMigrationError ? (
          <p
            className="account-status-message account-status-message--error"
            role="alert"
          >
            {content.localAdvertisementsImportFailedMessage}
          </p>
        ) : null}
        {legacyMigrationCount !== null ? (
          <p
            className="account-status-message account-status-message--success"
            role="status"
          >
            {legacyMigrationCount > 0
              ? `${content.importedLocalAdvertisementsMessage}: ${legacyMigrationCount}`
              : content.noLocalAdvertisementsRequiredMigrationMessage}
          </p>
        ) : null}
        <form className="public-name-form" onSubmit={handlePublicNameSubmit} noValidate>
          <label className="form-field" htmlFor="account-public-name">
            <span>{content.accountPublicNameTitle}</span>
            <input
              id="account-public-name"
              name="displayName"
              type="text"
              value={displayNameInput}
              maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH}
              placeholder={content.accountPublicNamePlaceholder}
              onChange={(event) => {
                setDisplayNameInput(event.target.value);
                setPublicNameError('');
                setPublicNameMessage('');
              }}
              required
            />
          </label>
          <p className="account-help-text">{content.accountPublicNameHelp}</p>
          <label className="form-field" htmlFor="account-profile-bio">
            <span>{content.bioLabel}</span>
            <textarea
              id="account-profile-bio"
              name="bio"
              value={bioInput}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              rows={4}
              onChange={(event) => {
                setBioInput(event.target.value);
                setPublicNameError('');
                setPublicNameMessage('');
              }}
            />
          </label>
          <label className="form-field" htmlFor="account-profile-location">
            <span>{content.profileLocationLabel}</span>
            <input
              id="account-profile-location"
              name="location"
              type="text"
              value={locationInput}
              maxLength={PROFILE_LOCATION_MAX_LENGTH}
              onChange={(event) => {
                setLocationInput(event.target.value);
                setPublicNameError('');
                setPublicNameMessage('');
              }}
            />
          </label>
          <p className="account-help-text">{content.publicLocationHelp}</p>
          {publicNameMessage ? (
            <p
              className="account-status-message account-status-message--success"
              role="status"
            >
              {publicNameMessage}
            </p>
          ) : null}
          {publicNameError ? (
            <p
              className="account-status-message account-status-message--error"
              role="alert"
            >
              {publicNameError}
            </p>
          ) : null}
          <button type="submit" className="search-button">
            {content.accountSaveProfileButton}
          </button>
        </form>
      </section>

      <section className="my-ads-section" aria-labelledby="my-ads-title">
        <div className="my-ads-heading">
          <h3 id="my-ads-title">{content.myAdvertisementsTitle}</h3>
          <p className="results-summary" aria-live="polite">
            {content.myAdvertisementsCountLabel}: {ownedListings.length}
          </p>
        </div>

        {deleteMessage ? (
          <p className="form-success" role="status">
            {deleteMessage}
          </p>
        ) : null}

        {listingSectionsError ? (
          <p className="form-error" role="alert">
            {listingSectionsError}
          </p>
        ) : null}

        {ownedListings.length > 0 ? (
          <div className="my-ads-grid">
            {ownedListings.map((listing) => {
              const listingId = String(listing.id);
              const confirmingThisListing = listingToDelete?.id === listing.id;
              const deleteErrorForThisListing =
                deleteErrorListingId === listingId && deleteErrorMessage;
              const deleteConfirmationTitleId = `delete-ad-title-${listingId}`;

              return (
                <article key={listingId} className="my-ad-item">
                  <ListingCard
                    listing={listing}
                    fromHref="/account"
                    showActiveStatus
                  />
                  <div className="my-ad-actions">
                    <Link
                      href={`/account/listings/${listing.id}/edit?from=/account`}
                      className="listing-management-button listing-management-button--edit my-ad-edit-button"
                      onClick={saveAccountScrollForEdit}
                    >
                      {content.editAdvertisementButton}
                    </Link>
                    <button
                      type="button"
                      className="listing-management-button listing-management-button--delete my-ad-delete-button"
                      onClick={() => startDelete(listing)}
                      disabled={isDeleting}
                    >
                      {content.deleteAdvertisementButton}
                    </button>
                  </div>
                  {confirmingThisListing ? (
                    <section
                      className="delete-confirmation my-ad-delete-confirmation"
                      role="group"
                      aria-labelledby={deleteConfirmationTitleId}
                      ref={(element) => {
                        deleteConfirmationRefs.current[listingId] = element;
                      }}
                    >
                      <h4 id={deleteConfirmationTitleId}>
                        {content.confirmDeleteAdvertisementTitle}
                      </h4>
                      <p>
                        {content.confirmDeleteAdvertisementMessage} {listing.title}
                      </p>
                      {deleteErrorForThisListing ? (
                        <p className="form-error" role="alert">
                          {deleteErrorForThisListing}
                        </p>
                      ) : null}
                      <div className="delete-confirmation-actions">
                        <button
                          type="button"
                          className="listing-management-button listing-management-button--edit"
                          onClick={cancelDelete}
                          disabled={isDeleting}
                        >
                          {content.cancelButton}
                        </button>
                        <button
                          type="button"
                          className="listing-management-button listing-management-button--delete"
                          onClick={confirmDelete}
                          disabled={isDeleting || !deleteTargetStillOwned}
                        >
                          {content.deleteAdvertisementButton}
                        </button>
                      </div>
                    </section>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-results" role="status">
            <h3>{content.noAdvertisementsPostedTitle}</h3>
            <p>{content.noAdvertisementsPostedMessage}</p>
          </div>
        )}
      </section>

      <section className="my-ads-section" aria-labelledby="unassigned-ads-title">
        <div className="my-ads-heading">
          <h3 id="unassigned-ads-title">{content.olderUnassignedAdvertisementsTitle}</h3>
          <p className="results-summary" aria-live="polite">
            {content.olderUnassignedAdvertisementsCountLabel}: {unassignedListings.length}
          </p>
        </div>

        {claimMessage ? (
          <p className="form-success" role="status">
            {claimMessage}
          </p>
        ) : null}

        {listingToClaim ? (
          <section
            className="delete-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="claim-ad-title"
          >
            <h4 id="claim-ad-title">{content.confirmClaimAdvertisementTitle}</h4>
            <p>
              {content.confirmClaimAdvertisementMessage} {listingToClaim.title}
            </p>
            <div className="delete-confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={cancelClaim}
                disabled={isClaiming}
              >
                {content.cancelButton}
              </button>
              <button
                type="button"
                className="search-button"
                onClick={confirmClaim}
                disabled={isClaiming || !claimTargetStillUnassigned}
              >
                {content.claimAdvertisementButton}
              </button>
            </div>
          </section>
        ) : null}

        {unassignedListings.length > 0 ? (
          <div className="my-ads-grid">
            {unassignedListings.map((listing) => (
              <article key={String(listing.id)} className="my-ad-item">
                <ListingCard listing={listing} fromHref="/account" />
                <button
                  type="button"
                  className="search-button my-ad-claim-button"
                  onClick={() => startClaim(listing)}
                  disabled={isClaiming}
                >
                  {content.claimAdvertisementButton}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-results" role="status">
            <h3>{content.olderUnassignedAdvertisementsTitle}</h3>
            <p>{content.noUnassignedAdvertisementsMessage}</p>
          </div>
        )}
      </section>
      <AccountRefreshScrollManager ready={accountReady} />
      <AccountNativeHistoryRestorer
        accountReady={accountReady}
        canHoldVisualRestoration={canHoldVisualRestoration}
        contentRef={accountContentRef}
      />
      <ResultsScrollRestorer resultsHref="/account" />
    </div>
  );
}
