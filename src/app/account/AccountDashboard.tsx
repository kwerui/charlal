'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import AccountRefreshScrollManager from '@/app/account/AccountRefreshScrollManager';
import ListingCard from '@/app/components/ListingCard';
import ResultsScrollRestorer from '@/app/components/ResultsScrollRestorer';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import {
  claimUnassignedLocalListingForOwner,
  deleteLocalListingOwnedBy,
  getLocalListingsOwnedBy,
  getUnassignedLocalListings,
  migrateLocalListingOwnerId,
  subscribeToLocalListings,
  updateLocalListingSellerNamesForOwner,
} from '@/lib/localListings';
import {
  getDemoUserOwnerId,
  isListingOwnedByUser,
  normalizeOwnerId,
} from '@/lib/listingOwnership';
import {
  DEMO_DISPLAY_NAME_MAX_LENGTH,
  getDemoUserDisplayName,
  sanitizeDemoDisplayName,
  updateDemoDisplayName,
} from '@/lib/demoAuth';
import { useDemoAuthStatus } from '@/lib/useDemoAuthStatus';

export default function AccountDashboard() {
  const router = useRouter();
  const { status: authStatus, user: currentUser } = useDemoAuthStatus();
  const ownerId = getDemoUserOwnerId(currentUser);
  const [ownedListings, setOwnedListings] = useState<Listing[]>([]);
  const [unassignedListings, setUnassignedListings] = useState<Listing[]>([]);
  const [listingSectionsLoaded, setListingSectionsLoaded] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [publicNameMessage, setPublicNameMessage] = useState('');
  const [publicNameError, setPublicNameError] = useState('');
  const [listingToDelete, setListingToDelete] = useState<Listing | null>(null);
  const [listingToClaim, setListingToClaim] = useState<Listing | null>(null);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace('/sign-in?next=/account');
    }
  }, [authStatus, router]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setDisplayNameInput(getDemoUserDisplayName(currentUser));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentUser]);

  useEffect(() => {
    function refreshListingSections(): void {
      if (authStatus !== 'authenticated' || !currentUser || !ownerId) {
        setOwnedListings([]);
        setUnassignedListings(getUnassignedLocalListings());
        setListingSectionsLoaded(false);
        return;
      }

      const legacyOwnerId = normalizeOwnerId(currentUser.email);
      migrateLocalListingOwnerId(legacyOwnerId, ownerId);
      setOwnedListings(getLocalListingsOwnedBy(ownerId));
      setUnassignedListings(getUnassignedLocalListings());
      setListingSectionsLoaded(true);
    }

    const frameId = window.requestAnimationFrame(refreshListingSections);
    const unsubscribe = subscribeToLocalListings(refreshListingSections);

    return () => {
      window.cancelAnimationFrame(frameId);
      unsubscribe();
    };
  }, [authStatus, currentUser, ownerId]);

  const deleteTargetStillOwned = useMemo(() => {
    return Boolean(
      listingToDelete &&
        currentUser &&
        isListingOwnedByUser(listingToDelete, currentUser) &&
        ownedListings.some((listing) => listing.id === listingToDelete.id)
    );
  }, [currentUser, listingToDelete, ownedListings]);

  const claimTargetStillUnassigned = useMemo(() => {
    return Boolean(
      listingToClaim &&
        !listingToClaim.ownerId &&
        unassignedListings.some((listing) => listing.id === listingToClaim.id)
    );
  }, [listingToClaim, unassignedListings]);

  function handlePublicNameSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPublicNameMessage('');
    setPublicNameError('');

    const safeDisplayName = sanitizeDemoDisplayName(displayNameInput);

    if (!safeDisplayName) {
      setPublicNameError(content.accountPublicNameRequiredMessage);
      return;
    }

    const savedUser = updateDemoDisplayName(safeDisplayName);

    if (!savedUser) {
      setPublicNameError(content.accountPublicNameRequiredMessage);
      return;
    }

    if (ownerId) {
      updateLocalListingSellerNamesForOwner(ownerId, getDemoUserDisplayName(savedUser));
      setOwnedListings(getLocalListingsOwnedBy(ownerId));
    }

    setDisplayNameInput(getDemoUserDisplayName(savedUser));
    setPublicNameMessage(content.accountPublicNameSavedMessage);
  }

  function startDelete(listing: Listing): void {
    setDeleteMessage('');
    setListingToDelete(listing);
  }

  function cancelDelete(): void {
    if (!isDeleting) {
      setListingToDelete(null);
    }
  }

  function confirmDelete(): void {
    if (!listingToDelete || !ownerId || isDeleting) {
      return;
    }

    setIsDeleting(true);
    const deleted = deleteLocalListingOwnedBy(listingToDelete.id, ownerId);
    setIsDeleting(false);

    if (deleted) {
      setOwnedListings(getLocalListingsOwnedBy(ownerId));
      setListingToDelete(null);
      setDeleteMessage(content.advertisementDeletedMessage);
      return;
    }

    setDeleteMessage(content.advertisementDeleteFailedMessage);
    setListingToDelete(null);
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

  function confirmClaim(): void {
    if (!listingToClaim || !ownerId || isClaiming) {
      return;
    }

    setIsClaiming(true);
    const claimed = claimUnassignedLocalListingForOwner(listingToClaim.id, ownerId);
    setIsClaiming(false);

    if (claimed) {
      setOwnedListings(getLocalListingsOwnedBy(ownerId));
      setUnassignedListings(getUnassignedLocalListings());
      setListingToClaim(null);
      setClaimMessage(content.advertisementClaimedMessage);
      return;
    }

    setClaimMessage(content.advertisementClaimFailedMessage);
    setListingToClaim(null);
  }

  const accountReady =
    authStatus === 'authenticated' &&
    Boolean(currentUser) &&
    Boolean(ownerId) &&
    listingSectionsLoaded;

  if (!accountReady || !currentUser || !ownerId) {
    return (
      <>
        <AccountRefreshScrollManager ready={false} />
        <p className="page-description">{content.checkingAuthMessage}</p>
      </>
    );
  }

  return (
    <div className="account-content">
      <section className="account-info" aria-labelledby="account-info-title">
        <h3 id="account-info-title">{content.accountInfoTitle}</h3>
        <p>
          <span>{content.accountEmailLabel}</span>
          <strong>{currentUser.email}</strong>
        </p>
        <p>
          <span>{content.accountPublicNameLabel}</span>
          <strong>{getDemoUserDisplayName(currentUser) || content.publicSellerFallbackLabel}</strong>
        </p>
        <form className="public-name-form" onSubmit={handlePublicNameSubmit} noValidate>
          <label className="form-field" htmlFor="account-public-name">
            <span>{content.accountPublicNameTitle}</span>
            <input
              id="account-public-name"
              name="displayName"
              type="text"
              value={displayNameInput}
              maxLength={DEMO_DISPLAY_NAME_MAX_LENGTH}
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
          {publicNameMessage ? (
            <p className="form-success" role="status">
              {publicNameMessage}
            </p>
          ) : null}
          {publicNameError ? (
            <p className="form-error" role="alert">
              {publicNameError}
            </p>
          ) : null}
          <button type="submit" className="search-button">
            {content.accountSaveNameButton}
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

        {listingToDelete ? (
          <section
            className="delete-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-ad-title"
          >
            <h4 id="delete-ad-title">{content.confirmDeleteAdvertisementTitle}</h4>
            <p>
              {content.confirmDeleteAdvertisementMessage} {listingToDelete.title}
            </p>
            <div className="delete-confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={cancelDelete}
                disabled={isDeleting}
              >
                {content.cancelButton}
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={confirmDelete}
                disabled={isDeleting || !deleteTargetStillOwned}
              >
                {content.deleteAdvertisementButton}
              </button>
            </div>
          </section>
        ) : null}

        {ownedListings.length > 0 ? (
          <div className="my-ads-grid">
            {ownedListings.map((listing) => (
              <article key={String(listing.id)} className="my-ad-item">
                <ListingCard listing={listing} fromHref="/account" />
                <button
                  type="button"
                  className="danger-button my-ad-delete-button"
                  onClick={() => startDelete(listing)}
                  disabled={isDeleting}
                >
                  {content.deleteAdvertisementButton}
                </button>
              </article>
            ))}
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
      <ResultsScrollRestorer resultsHref="/account" />
    </div>
  );
}
