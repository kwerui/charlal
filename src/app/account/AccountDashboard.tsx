'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import ListingCard from '@/app/components/ListingCard';
import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';
import {
  deleteLocalListingOwnedBy,
  getLocalListingsOwnedBy,
  subscribeToLocalListings,
} from '@/lib/localListings';
import {
  getDemoUserOwnerId,
  isListingOwnedByUser,
} from '@/lib/listingOwnership';
import {
  getDemoAuthServerSnapshot,
  getDemoAuthSnapshot,
  getDemoUser,
  subscribeToDemoAuth,
} from '@/lib/demoAuth';

export default function AccountDashboard() {
  const router = useRouter();
  const signedIn = useSyncExternalStore(
    subscribeToDemoAuth,
    getDemoAuthSnapshot,
    getDemoAuthServerSnapshot
  );
  const currentUser = signedIn ? getDemoUser() : null;
  const ownerId = getDemoUserOwnerId(currentUser);
  const [ownedListings, setOwnedListings] = useState<Listing[]>([]);
  const [listingToDelete, setListingToDelete] = useState<Listing | null>(null);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      router.replace('/sign-in?next=/account');
    }
  }, [router, signedIn]);

  useEffect(() => {
    function refreshOwnedListings(): void {
      setOwnedListings(ownerId ? getLocalListingsOwnedBy(ownerId) : []);
    }

    const frameId = window.requestAnimationFrame(refreshOwnedListings);
    const unsubscribe = subscribeToLocalListings(refreshOwnedListings);

    return () => {
      window.cancelAnimationFrame(frameId);
      unsubscribe();
    };
  }, [ownerId]);

  const deleteTargetStillOwned = useMemo(() => {
    return Boolean(
      listingToDelete &&
        currentUser &&
        isListingOwnedByUser(listingToDelete, currentUser) &&
        ownedListings.some((listing) => listing.id === listingToDelete.id)
    );
  }, [currentUser, listingToDelete, ownedListings]);

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

  if (!signedIn || !currentUser || !ownerId) {
    return <p className="page-description">{content.checkingAuthMessage}</p>;
  }

  return (
    <div className="account-content">
      <section className="account-info" aria-labelledby="account-info-title">
        <h3 id="account-info-title">{content.accountInfoTitle}</h3>
        <p>
          <span>{content.accountEmailLabel}</span>
          <strong>{currentUser.email}</strong>
        </p>
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
    </div>
  );
}
