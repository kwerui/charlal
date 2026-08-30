'use client';

import { Link } from '@/i18n/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import ReviewPhotoViewer from '@/app/components/ReviewPhotoViewer';
import { content } from '@/content/tyv';
import {
  recordReviewMutationRefreshIntent,
  shouldRefreshForReviewMutation,
} from '@/lib/reviewMutationRefreshStorage';
import { createClient } from '@/lib/supabase/client';
import {
  createReviewPhotoStoragePath,
  listMyReviewableTransactions,
  listOwnSellerReviewPhotoPaths,
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_PHOTO_BYTES,
  removeReviewPhotoFiles,
  REVIEW_PHOTO_ACCEPT,
  REVIEW_PHOTO_MIME_TYPES,
  type ReviewableTransaction,
  type ReviewPhoto,
  uploadReviewPhotoFile,
} from '@/lib/supabase/reviews';

type Props = {
  initialTransactions: ReviewableTransaction[];
};

type ReviewEditorMode = 'create' | 'edit';

type ReviewDraftFile = {
  id: string;
  file: File;
  url: string;
};

type PendingDeleteReview = {
  reviewId: string;
};

const reviewDateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatReviewDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return reviewDateFormatter.format(date);
}

function getStars(rating: number | null): string {
  if (!rating) {
    return '-----';
  }

  return `${'★'.repeat(rating)}${'☆'.repeat(Math.max(0, 5 - rating))}`;
}

function isReviewPhotoFile(file: File): boolean {
  return (
    (REVIEW_PHOTO_MIME_TYPES as readonly string[]).includes(file.type) &&
    file.size <= MAX_REVIEW_PHOTO_BYTES
  );
}

type ReviewEditorProps = {
  transaction: ReviewableTransaction;
  mode: ReviewEditorMode;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (input: {
    transaction: ReviewableTransaction;
    rating: number;
    body: string;
    keptPhotos: ReviewPhoto[];
    newFiles: File[];
  }) => Promise<void>;
};

function ReviewEditor({
  transaction,
  mode,
  isSubmitting,
  submitLabel,
  onCancel,
  onSubmit,
}: ReviewEditorProps) {
  const [rating, setRating] = useState(transaction.rating || 0);
  const [body, setBody] = useState(transaction.reviewBody || '');
  const [keptPhotos, setKeptPhotos] = useState<ReviewPhoto[]>(
    transaction.reviewPhotos
  );
  const [draftFiles, setDraftFiles] = useState<ReviewDraftFile[]>([]);
  const [error, setError] = useState('');
  const draftUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const draftUrls = draftUrlsRef.current;

    return () => {
      draftUrls.forEach((url) => URL.revokeObjectURL(url));
      draftUrls.clear();
    };
  }, []);

  function removeDraftFile(id: string): void {
    setDraftFiles((currentFiles) => {
      const removedFile = currentFiles.find((file) => file.id === id);
      if (removedFile) {
        URL.revokeObjectURL(removedFile.url);
        draftUrlsRef.current.delete(removedFile.url);
      }

      return currentFiles.filter((file) => file.id !== id);
    });
  }

  function handleFiles(files: FileList | null): void {
    if (!files) {
      return;
    }

    const incomingFiles = Array.from(files);
    const availableSlots =
      MAX_REVIEW_PHOTOS - keptPhotos.length - draftFiles.length;

    if (availableSlots <= 0 || incomingFiles.length > availableSlots) {
      setError(content.reviewPhotoMaximumMessage);
      return;
    }

    if (!incomingFiles.every(isReviewPhotoFile)) {
      setError(content.reviewPhotoUnsupportedTypeMessage);
      return;
    }

    const nextDraftFiles = incomingFiles.map((file) => {
      const url = URL.createObjectURL(file);
      draftUrlsRef.current.add(url);

      return {
        id: crypto.randomUUID(),
        file,
        url,
      };
    });

    setDraftFiles((currentFiles) => [...currentFiles, ...nextDraftFiles]);
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (rating < 1 || rating > 5) {
      setError(content.reviewRatingRequiredMessage);
      return;
    }

    await onSubmit({
      transaction,
      rating,
      body,
      keptPhotos,
      newFiles: draftFiles.map((draftFile) => draftFile.file),
    });
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <fieldset className="review-star-field">
        <legend>{content.reviewRatingLabel}</legend>
        <div className="review-star-options">
          {[1, 2, 3, 4, 5].map((star) => (
            <label key={star}>
              <input
                type="radio"
                name={`review-rating-${transaction.transactionId}`}
                value={star}
                checked={rating === star}
                onChange={() => {
                  setRating(star);
                  setError('');
                }}
                disabled={isSubmitting}
              />
              <span aria-hidden="true">{star <= rating ? '★' : '☆'}</span>
              <span className="sr-only">
                {star} {content.starsLabel}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="form-field">
        <span>{content.reviewTextLabel}</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          rows={mode === 'edit' ? 3 : 4}
          disabled={isSubmitting}
        />
      </label>

      <div className="review-photo-editor">
        <label className="secondary-button review-photo-upload-button">
          <span>{content.addReviewPhotosButton}</span>
          <input
            className="sr-only"
            type="file"
            accept={REVIEW_PHOTO_ACCEPT}
            multiple
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
            disabled={
              isSubmitting ||
              keptPhotos.length + draftFiles.length >= MAX_REVIEW_PHOTOS
            }
          />
        </label>
        <small>{content.reviewPhotoRequirementsMessage}</small>
        {keptPhotos.length > 0 || draftFiles.length > 0 ? (
          <ul className="review-photo-preview-list">
            {keptPhotos.map((photo) => (
              <li key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={content.reviewPhotoPreviewLabel} />
                <button
                  type="button"
                  onClick={() =>
                    setKeptPhotos((currentPhotos) =>
                      currentPhotos.filter(
                        (currentPhoto) => currentPhoto.id !== photo.id
                      )
                    )
                  }
                  disabled={isSubmitting}
                >
                  {content.removePhotoButton}
                </button>
              </li>
            ))}
            {draftFiles.map((draftFile) => (
              <li key={draftFile.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draftFile.url} alt={content.reviewPhotoPreviewLabel} />
                <button
                  type="button"
                  onClick={() => removeDraftFile(draftFile.id)}
                  disabled={isSubmitting}
                >
                  {content.removePhotoButton}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="review-form-actions">
        <button type="submit" className="search-button" disabled={isSubmitting}>
          {isSubmitting ? content.reviewSavingButton : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="listing-management-button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {content.cancelButton}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function PurchasesToReview({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [openCreateTransactionId, setOpenCreateTransactionId] = useState<
    string | null
  >(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [pendingDeleteReview, setPendingDeleteReview] =
    useState<PendingDeleteReview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submittingTransactionId, setSubmittingTransactionId] = useState<
    string | null
  >(null);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  const unreviewedTransactions = transactions.filter(
    (transaction) => !transaction.reviewId
  );
  const reviewedTransactions = transactions.filter(
    (transaction) => transaction.reviewId
  );

  const refreshTransactions = useCallback(async (): Promise<void> => {
    setIsRefreshing(true);

    try {
      const nextTransactions = await listMyReviewableTransactions(createClient());
      setTransactions(nextTransactions);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function refreshIfNeeded(): Promise<void> {
      if (!shouldRefreshForReviewMutation('/account/reviews')) {
        return;
      }

      setMessage('');
      await refreshTransactions();
    }

    const frameId = window.requestAnimationFrame(() => {
      void refreshIfNeeded();
    });

    function handleReturnToPage(): void {
      if (!active) {
        return;
      }

      setMessage('');
      void refreshIfNeeded();
    }

    window.addEventListener('pageshow', handleReturnToPage);
    window.addEventListener('focus', handleReturnToPage);

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('pageshow', handleReturnToPage);
      window.removeEventListener('focus', handleReturnToPage);
    };
  }, [refreshTransactions]);

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setMessage(''), 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message]);

  useEffect(() => {
    if (pendingDeleteReview) {
      confirmationRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setPendingDeleteReview(null);
      }
    }

    if (pendingDeleteReview) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pendingDeleteReview]);

  async function refreshAfterMutation(): Promise<void> {
    recordReviewMutationRefreshIntent('/account/reviews');
    await refreshTransactions();
  }

  async function insertReviewPhotos(
    reviewId: string,
    files: File[],
    positions: number[]
  ): Promise<boolean> {
    if (files.length === 0) {
      return true;
    }

    const supabase = createClient();
    const uploadedStoragePaths: string[] = [];
    const rows: {
      review_id: string;
      storage_path: string;
      position: number;
      content_type: string;
    }[] = [];

    for (const [index, file] of files.entries()) {
      const storagePath = createReviewPhotoStoragePath(reviewId, file);
      const position = positions[index];

      if (!storagePath || position === undefined) {
        await removeReviewPhotoFiles(supabase, uploadedStoragePaths);
        return false;
      }

      const uploaded = await uploadReviewPhotoFile(supabase, storagePath, file);

      if (!uploaded) {
        await removeReviewPhotoFiles(supabase, uploadedStoragePaths);
        return false;
      }

      uploadedStoragePaths.push(storagePath);
      rows.push({
        review_id: reviewId,
        storage_path: storagePath,
        position,
        content_type: file.type,
      });
    }

    const { error: insertError } = await supabase
      .from('seller_review_photos')
      .insert(rows);

    if (insertError) {
      await removeReviewPhotoFiles(supabase, uploadedStoragePaths);
      return false;
    }

    return true;
  }

  async function handleSaveReview(input: {
    transaction: ReviewableTransaction;
    rating: number;
    body: string;
    keptPhotos: ReviewPhoto[];
    newFiles: File[];
  }): Promise<void> {
    const { transaction, rating, body, keptPhotos, newFiles } = input;
    const bodyValue = body.trim() || null;
    const isEditing = Boolean(transaction.reviewId);

    setSubmittingTransactionId(transaction.transactionId);
    setError('');
    setMessage('');

    const supabase = createClient();

    if (isEditing && transaction.reviewId) {
      const { error: updateError } = await supabase
        .from('seller_reviews')
        .update({ rating, body: bodyValue })
        .eq('id', transaction.reviewId);

      if (updateError) {
        setSubmittingTransactionId(null);
        setError(content.reviewSaveFailedMessage);
        return;
      }

      const keptPhotoIds = new Set(keptPhotos.map((photo) => photo.id));
      const removedPhotos = transaction.reviewPhotos.filter(
        (photo) => !keptPhotoIds.has(photo.id)
      );

      if (removedPhotos.length > 0) {
        await supabase
          .from('seller_review_photos')
          .delete()
          .in(
            'id',
            removedPhotos.map((photo) => photo.id)
          );
        await removeReviewPhotoFiles(
          supabase,
          removedPhotos.map((photo) => photo.storagePath)
        );
      }

      const usedPositions = new Set(keptPhotos.map((photo) => photo.position));
      const availablePositions = [0, 1, 2].filter(
        (position) => !usedPositions.has(position)
      );
      const photosInserted = await insertReviewPhotos(
        transaction.reviewId,
        newFiles,
        availablePositions
      );

      if (!photosInserted) {
        setSubmittingTransactionId(null);
        setError(content.reviewPhotoUploadFailedMessage);
        return;
      }
    } else {
      const { data: insertedReview, error: insertError } = await supabase
        .from('seller_reviews')
        .insert({
          transaction_id: transaction.transactionId,
          rating,
          body: bodyValue,
        })
        .select('id')
        .single();

      if (
        insertError ||
        !insertedReview ||
        typeof insertedReview.id !== 'string'
      ) {
        setSubmittingTransactionId(null);
        setError(content.reviewSaveFailedMessage);
        return;
      }

      const photosInserted = await insertReviewPhotos(
        insertedReview.id,
        newFiles,
        [0, 1, 2]
      );

      if (!photosInserted) {
        setSubmittingTransactionId(null);
        setError(content.reviewPhotoUploadFailedMessage);
        return;
      }
    }

    await refreshAfterMutation();
    setOpenCreateTransactionId(null);
    setEditingReviewId(null);
    setSubmittingTransactionId(null);
    setMessage(content.reviewSavedMessage);
  }

  async function handleDeleteReview(): Promise<void> {
    if (!pendingDeleteReview || deletingReviewId) {
      return;
    }

    const reviewId = pendingDeleteReview.reviewId;
    setDeletingReviewId(reviewId);
    setError('');
    setMessage('');

    const supabase = createClient();
    const photoPathsResult = await listOwnSellerReviewPhotoPaths(
      supabase,
      reviewId
    );

    if (photoPathsResult.ok && photoPathsResult.storagePaths.length > 0) {
      await removeReviewPhotoFiles(supabase, photoPathsResult.storagePaths);
    }

    const { error: deleteError } = await supabase.rpc(
      'delete_own_seller_review',
      {
        p_review_id: reviewId,
      }
    );

    if (deleteError) {
      setDeletingReviewId(null);
      setError(content.reviewDeleteFailedMessage);
      return;
    }

    await refreshAfterMutation();
    setPendingDeleteReview(null);
    setEditingReviewId(null);
    setDeletingReviewId(null);
    setMessage(content.reviewDeletedMessage);
  }

  return (
    <>
      <section className="purchases-review-section" aria-labelledby="purchases-review-title">
        <h3 id="purchases-review-title">
          {content.purchasesToReviewTitle} ({unreviewedTransactions.length})
        </h3>

        {message ? (
          <p className="form-success" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {unreviewedTransactions.length > 0 ? (
          <div className="purchases-review-list" aria-busy={isRefreshing}>
            {unreviewedTransactions.map((transaction) => (
              <article
                key={transaction.transactionId}
                className="purchase-review-item"
              >
                <div className="purchase-review-summary">
                  <div>
                    <p className="purchase-review-kicker">
                      {content.purchasedFromLabel}{' '}
                      <Link href={`/seller/${transaction.sellerPublicSlug}`}>
                        {transaction.sellerDisplayName}
                      </Link>
                    </p>
                    <h4>{transaction.listingTitleSnapshot}</h4>
                    <p>{formatReviewDate(transaction.completedAt)}</p>
                  </div>
                  <button
                    type="button"
                    className="listing-management-button purchase-review-toggle"
                    onClick={() =>
                      setOpenCreateTransactionId((currentId) =>
                        currentId === transaction.transactionId
                          ? null
                          : transaction.transactionId
                      )
                    }
                    disabled={submittingTransactionId === transaction.transactionId}
                  >
                    {content.leaveReviewButton}
                  </button>
                </div>

                {openCreateTransactionId === transaction.transactionId ? (
                  <ReviewEditor
                    transaction={transaction}
                    mode="create"
                    isSubmitting={
                      submittingTransactionId === transaction.transactionId
                    }
                    submitLabel={content.submitReviewButton}
                    onCancel={() => setOpenCreateTransactionId(null)}
                    onSubmit={handleSaveReview}
                  />
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="account-help-text">{content.noPurchasesToReviewMessage}</p>
        )}
      </section>

      <section className="purchases-review-section my-reviews-section" aria-labelledby="my-reviews-title">
        <h3 id="my-reviews-title">
          {content.myReviewsTitle} ({reviewedTransactions.length})
        </h3>

        {reviewedTransactions.length > 0 ? (
          <div className="purchases-review-list" aria-busy={isRefreshing}>
            {reviewedTransactions.map((transaction) => (
              <article
                key={transaction.transactionId}
                className="purchase-review-item review-summary-card"
              >
                <div className="seller-review-header">
                  <ProfileAvatar
                    avatarPath={transaction.sellerAvatarPath}
                    displayName={transaction.sellerDisplayName}
                    size="small"
                    focusX={transaction.sellerAvatarFocusX}
                    focusY={transaction.sellerAvatarFocusY}
                    zoom={transaction.sellerAvatarZoom}
                  />
                  <div>
                    <p className="purchase-review-kicker">
                      {content.purchasedFromLabel}{' '}
                      <Link href={`/seller/${transaction.sellerPublicSlug}`}>
                        {transaction.sellerDisplayName}
                      </Link>
                    </p>
                    <h4>{transaction.listingTitleSnapshot}</h4>
                    <p className="seller-review-meta">
                      {formatReviewDate(transaction.completedAt)}
                    </p>
                  </div>
                </div>

                {editingReviewId === transaction.reviewId ? (
                  <ReviewEditor
                    transaction={transaction}
                    mode="edit"
                    isSubmitting={
                      submittingTransactionId === transaction.transactionId
                    }
                    submitLabel={content.saveReviewChangesButton}
                    onCancel={() => setEditingReviewId(null)}
                    onSubmit={handleSaveReview}
                  />
                ) : (
                  <>
                    <p className="seller-review-stars" aria-label={`${transaction.rating} ${content.starsLabel}`}>
                      {getStars(transaction.rating)}
                    </p>
                    {transaction.reviewBody ? (
                      <p className="seller-review-body">{transaction.reviewBody}</p>
                    ) : null}
                    <ReviewPhotoViewer
                      photos={transaction.reviewPhotos}
                      className="seller-review-photos my-review-photos"
                    />
                    <div className="review-form-actions">
                      <button
                        type="button"
                        className="listing-management-button"
                        onClick={() => setEditingReviewId(transaction.reviewId)}
                      >
                        {content.editReviewButton}
                      </button>
                      {transaction.reviewId ? (
                        <button
                          type="button"
                          className="listing-management-button"
                          onClick={() =>
                            setPendingDeleteReview({
                              reviewId: transaction.reviewId || '',
                            })
                          }
                        >
                          {content.deleteReviewButton}
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="account-help-text">{content.noMyReviewsMessage}</p>
        )}
      </section>

      {pendingDeleteReview ? (
        <div
          className="message-confirmation-backdrop"
          role="presentation"
          onClick={() => setPendingDeleteReview(null)}
        >
          <div
            ref={confirmationRef}
            className="message-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-delete-confirmation-title"
            aria-describedby="review-delete-confirmation-description"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="review-delete-confirmation-title">
              {content.deleteReviewConfirmTitle}
            </h2>
            <p id="review-delete-confirmation-description">
              {content.deleteReviewConfirmMessage}
            </p>
            <div className="message-confirmation-actions">
              <button
                type="button"
                className="message-confirmation-button message-confirmation-button--secondary"
                onClick={() => setPendingDeleteReview(null)}
                disabled={deletingReviewId === pendingDeleteReview.reviewId}
              >
                {content.cancelButton}
              </button>
              <button
                type="button"
                className="message-confirmation-button message-confirmation-button--destructive"
                onClick={handleDeleteReview}
                disabled={deletingReviewId === pendingDeleteReview.reviewId}
              >
                {deletingReviewId === pendingDeleteReview.reviewId
                  ? content.reviewSavingButton
                  : content.deleteReviewButton}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
