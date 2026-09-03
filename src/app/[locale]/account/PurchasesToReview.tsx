'use client';

import { Link } from '@/i18n/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import { useLocale, useTranslations } from 'next-intl';
import { formatReviewDate } from '@/lib/reviewDateFormatting';
import {
  MAX_SELLER_REVIEW_TAGS,
  SELLER_REVIEW_TAGS,
  type SellerReviewTag,
} from '@/lib/reviewTags';
import {
  recordReviewMutationRefreshIntent,
  shouldRefreshForReviewMutation,
} from '@/lib/reviewMutationRefreshStorage';
import { createClient } from '@/lib/supabase/client';
import {
  listMyReviewableTransactions,
  type ReviewableTransaction,
} from '@/lib/supabase/reviews';

type Props = {
  initialTransactions: ReviewableTransaction[];
};

type PendingDeleteReview = {
  reviewId: string;
};

function getStars(rating: number | null): string {
  if (!rating) {
    return '-----';
  }

  return `${'★'.repeat(rating)}${'☆'.repeat(Math.max(0, 5 - rating))}`;
}

function ReviewTagChips({ tags }: { tags: SellerReviewTag[] }) {
  const t = useTranslations('ReviewTags');

  if (tags.length === 0) {
    return null;
  }

  return (
    <ul className="review-tag-list" aria-label={t('selectedTagsLabel')}>
      {tags.map((tag) => (
        <li key={tag}>{t(tag)}</li>
      ))}
    </ul>
  );
}

type ReviewEditorProps = {
  transaction: ReviewableTransaction;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (input: {
    transaction: ReviewableTransaction;
    rating: number;
    tags: SellerReviewTag[];
  }) => Promise<void>;
};

function ReviewEditor({
  transaction,
  isSubmitting,
  submitLabel,
  onCancel,
  onSubmit,
}: ReviewEditorProps) {
  const t = useTranslations('AccountReviews');
  const reviewTagsT = useTranslations('ReviewTags');
  const listingReportT = useTranslations('ListingReport');
  const publicSellerReviewsT = useTranslations('PublicSellerReviews');
  const [rating, setRating] = useState(transaction.rating || 0);
  const [selectedTags, setSelectedTags] = useState<SellerReviewTag[]>(
    transaction.reviewTags
  );
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (rating < 1 || rating > 5) {
      setError(t('reviewRatingRequiredMessage'));
      return;
    }

    await onSubmit({
      transaction,
      rating,
      tags: selectedTags,
    });
  }

  function toggleTag(tag: SellerReviewTag): void {
    setSelectedTags((currentTags) => {
      if (currentTags.includes(tag)) {
        setError('');
        return currentTags.filter((currentTag) => currentTag !== tag);
      }

      if (currentTags.length >= MAX_SELLER_REVIEW_TAGS) {
        setError(t('reviewTagsMaximumMessage'));
        return currentTags;
      }

      setError('');
      return [...currentTags, tag];
    });
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <fieldset className="review-star-field">
        <legend>{t('reviewRatingLabel')}</legend>
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
                {publicSellerReviewsT('starsLabel', { count: star })}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="review-tag-field">
        <legend>{t('reviewTagsLabel')}</legend>
        <p>{t('reviewTagsHelp')}</p>
        <div className="review-tag-options">
          {SELLER_REVIEW_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            const isDisabled =
              isSubmitting ||
              (!isSelected && selectedTags.length >= MAX_SELLER_REVIEW_TAGS);

            return (
              <label key={tag}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleTag(tag)}
                  disabled={isDisabled}
                />
                <span>{reviewTagsT(tag)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="review-form-actions">
        <button type="submit" className="search-button" disabled={isSubmitting}>
          {isSubmitting ? t('reviewSavingButton') : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="listing-management-button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {listingReportT('cancelButton')}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function PurchasesToReview({ initialTransactions }: Props) {
  const locale = useLocale();
  const t = useTranslations('AccountReviews');
  const listingReportT = useTranslations('ListingReport');
  const publicSellerReviewsT = useTranslations('PublicSellerReviews');
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

  async function handleSaveReview(input: {
    transaction: ReviewableTransaction;
    rating: number;
    tags: SellerReviewTag[];
  }): Promise<void> {
    const { transaction, rating, tags } = input;
    const isEditing = Boolean(transaction.reviewId);

    setSubmittingTransactionId(transaction.transactionId);
    setError('');
    setMessage('');

    const supabase = createClient();

    if (isEditing && transaction.reviewId) {
      const { error: updateError } = await supabase
        .from('seller_reviews')
        .update({ rating, tags })
        .eq('id', transaction.reviewId);

      if (updateError) {
        setSubmittingTransactionId(null);
        setError(t('reviewSaveFailedMessage'));
        return;
      }
    } else {
      const { data: insertedReview, error: insertError } = await supabase
        .from('seller_reviews')
        .insert({
          transaction_id: transaction.transactionId,
          rating,
          tags,
        })
        .select('id')
        .single();

      if (
        insertError ||
        !insertedReview ||
        typeof insertedReview.id !== 'string'
      ) {
        setSubmittingTransactionId(null);
        setError(t('reviewSaveFailedMessage'));
        return;
      }
    }

    await refreshAfterMutation();
    setOpenCreateTransactionId(null);
    setEditingReviewId(null);
    setSubmittingTransactionId(null);
    setMessage(t('reviewSavedMessage'));
  }

  async function handleDeleteReview(): Promise<void> {
    if (!pendingDeleteReview || deletingReviewId) {
      return;
    }

    const reviewId = pendingDeleteReview.reviewId;
    setDeletingReviewId(reviewId);
    setError('');
    setMessage('');

    const { error: deleteError } = await createClient().rpc(
      'delete_own_seller_review',
      {
        p_review_id: reviewId,
      }
    );

    if (deleteError) {
      setDeletingReviewId(null);
      setError(t('reviewDeleteFailedMessage'));
      return;
    }

    await refreshAfterMutation();
    setPendingDeleteReview(null);
    setEditingReviewId(null);
    setDeletingReviewId(null);
    setMessage(t('reviewDeletedMessage'));
  }

  return (
    <>
      <section className="purchases-review-section" aria-labelledby="purchases-review-title">
        <h3 id="purchases-review-title">
          {t('purchasesToReviewTitle')} ({unreviewedTransactions.length})
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
                      {t('purchasedFromLabel')}{' '}
                      <Link href={`/seller/${transaction.sellerPublicSlug}`}>
                        {transaction.sellerDisplayName}
                      </Link>
                    </p>
                    <h4>{transaction.listingTitleSnapshot}</h4>
                    <p>{formatReviewDate(transaction.completedAt, locale)}</p>
                  </div>
                  <button
                    type="button"
className="listing-management-button purchase-review-toggle purchase-review-toggle--primary"                    onClick={() =>
                      setOpenCreateTransactionId((currentId) =>
                        currentId === transaction.transactionId
                          ? null
                          : transaction.transactionId
                      )
                    }
                    disabled={submittingTransactionId === transaction.transactionId}
                  >
                    {t('leaveReviewButton')}
                  </button>
                </div>

                {openCreateTransactionId === transaction.transactionId ? (
                  <ReviewEditor
                    transaction={transaction}
                    isSubmitting={
                      submittingTransactionId === transaction.transactionId
                    }
                    submitLabel={t('submitReviewButton')}
                    onCancel={() => setOpenCreateTransactionId(null)}
                    onSubmit={handleSaveReview}
                  />
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="account-help-text">{t('noPurchasesToReviewMessage')}</p>
        )}
      </section>

      <section className="purchases-review-section my-reviews-section" aria-labelledby="my-reviews-title">
        <h3 id="my-reviews-title">
          {t('myReviewsTitle')} ({reviewedTransactions.length})
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
                      {t('purchasedFromLabel')}{' '}
                      <Link href={`/seller/${transaction.sellerPublicSlug}`}>
                        {transaction.sellerDisplayName}
                      </Link>
                    </p>
                    <h4>{transaction.listingTitleSnapshot}</h4>
                    <p className="seller-review-meta">
                      {formatReviewDate(transaction.completedAt, locale)}
                    </p>
                  </div>
                </div>

                {editingReviewId === transaction.reviewId ? (
                  <ReviewEditor
                    transaction={transaction}
                    isSubmitting={
                      submittingTransactionId === transaction.transactionId
                    }
                    submitLabel={t('saveReviewChangesButton')}
                    onCancel={() => setEditingReviewId(null)}
                    onSubmit={handleSaveReview}
                  />
                ) : (
                  <>
                    <p
                      className="seller-review-stars"
                      aria-label={publicSellerReviewsT('starsLabel', {
                        count: transaction.rating || 0,
                      })}
                    >
                      {getStars(transaction.rating)}
                    </p>
                    <ReviewTagChips tags={transaction.reviewTags} />
                    <div className="review-form-actions">
                      <button
                        type="button"
className="listing-management-button review-action-button--edit"
                        onClick={() => setEditingReviewId(transaction.reviewId)}
                      >
                        {t('editReviewButton')}
                      </button>
                      {transaction.reviewId ? (
                        <button
                          type="button"
className="listing-management-button review-action-button--delete"
                          onClick={() =>
                            setPendingDeleteReview({
                              reviewId: transaction.reviewId || '',
                            })
                          }
                        >
                          {t('deleteReviewButton')}
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="account-help-text">{t('noMyReviewsMessage')}</p>
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
              {t('deleteReviewConfirmTitle')}
            </h2>
            <p id="review-delete-confirmation-description">
              {t('deleteReviewConfirmMessage')}
            </p>
            <div className="message-confirmation-actions">
              <button
                type="button"
                className="message-confirmation-button message-confirmation-button--secondary"
                onClick={() => setPendingDeleteReview(null)}
                disabled={deletingReviewId === pendingDeleteReview.reviewId}
              >
                {listingReportT('cancelButton')}
              </button>
              <button
                type="button"
                className="message-confirmation-button message-confirmation-button--destructive"
                onClick={handleDeleteReview}
                disabled={deletingReviewId === pendingDeleteReview.reviewId}
              >
                {deletingReviewId === pendingDeleteReview.reviewId
                  ? t('reviewDeletingButton')
                  : t('deleteReviewButton')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
