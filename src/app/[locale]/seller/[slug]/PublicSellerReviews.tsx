'use client';

import { useRouter } from '@/i18n/navigation';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import ReviewPhotoViewer from '@/app/components/ReviewPhotoViewer';
import type { PublicSellerReview } from '@/lib/supabase/reviews';
import {
  deleteSellerResponseAction,
  saveSellerResponseAction,
} from './reviewActions';

type Props = {
  sellerSlug: string;
  reviews: PublicSellerReview[];
  canRespond: boolean;
};

type ResponseDraft = {
  responseId: string | null;
  body: string | null;
  updatedAt: string | null;
};

function formatDate(value: string, locale: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function renderStars(rating: number): string {
  return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
}

function getInitialResponseState(
  reviews: PublicSellerReview[]
): Record<string, ResponseDraft> {
  return Object.fromEntries(
    reviews.map((review) => [
      review.reviewId,
      {
        responseId: review.responseId,
        body: review.responseBody,
        updatedAt: review.responseUpdatedAt,
      },
    ])
  );
}

export default function PublicSellerReviews({
  sellerSlug,
  reviews,
  canRespond,
}: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('PublicSellerReviews');
  const listingReportT = useTranslations('ListingReport');
  const [isPending, startTransition] = useTransition();
  const [responseState, setResponseState] = useState(() =>
    getInitialResponseState(reviews)
  );
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [confirmingDeleteReviewId, setConfirmingDeleteReviewId] = useState<
    string | null
  >(null);
  const [actionErrorByReviewId, setActionErrorByReviewId] = useState<
    Record<string, string>
  >({});
  const [actionSuccessByReviewId, setActionSuccessByReviewId] = useState<
    Record<string, string>
  >({});
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmingDeleteReviewId) {
      return undefined;
    }

    confirmationRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setConfirmingDeleteReviewId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmingDeleteReviewId]);

  useEffect(() => {
    if (!Object.values(actionSuccessByReviewId).some(Boolean)) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setActionSuccessByReviewId({});
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [actionSuccessByReviewId]);

  const reviewsWithResponses = useMemo(
    () =>
      reviews.map((review) => {
        const responseDraft = responseState[review.reviewId];

        return {
          ...review,
          responseId: responseDraft
            ? responseDraft.responseId
            : review.responseId,
          responseBody: responseDraft ? responseDraft.body : review.responseBody,
          responseUpdatedAt: responseDraft
            ? responseDraft.updatedAt
            : review.responseUpdatedAt,
        };
      }),
    [responseState, reviews]
  );

  function clearActionError(reviewId: string): void {
    setActionErrorByReviewId((currentErrors) => ({
      ...currentErrors,
      [reviewId]: '',
    }));
  }

  function clearActionSuccess(reviewId: string): void {
    setActionSuccessByReviewId((currentSuccesses) => ({
      ...currentSuccesses,
      [reviewId]: '',
    }));
  }

  function handleSaveResponse(
    review: PublicSellerReview,
    event: FormEvent<HTMLFormElement>
  ): void {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get('body') || '').trim();

    if (!body) {
      setActionErrorByReviewId((currentErrors) => ({
        ...currentErrors,
        [review.reviewId]: t('responseSaveFailedMessage'),
      }));
      clearActionSuccess(review.reviewId);
      return;
    }

    clearActionError(review.reviewId);
    clearActionSuccess(review.reviewId);
    startTransition(async () => {
      const formData = new FormData();

      formData.set('reviewId', review.reviewId);
      formData.set('sellerSlug', sellerSlug);
      formData.set('body', body);

      const result = await saveSellerResponseAction(formData);

      if (!result.ok || !result.responseId) {
        setActionErrorByReviewId((currentErrors) => ({
          ...currentErrors,
          [review.reviewId]: t('responseSaveFailedMessage'),
        }));
        return;
      }

      setResponseState((currentState) => ({
        ...currentState,
        [review.reviewId]: {
          responseId: result.responseId || null,
          body,
          updatedAt: new Date().toISOString(),
        },
      }));
      setActionSuccessByReviewId((currentSuccesses) => ({
        ...currentSuccesses,
        [review.reviewId]: t('responseSavedMessage'),
      }));
      setEditingReviewId(null);
      router.refresh();
    });
  }

  function handleDeleteResponse(review: PublicSellerReview): void {
    if (!review.responseId) {
      return;
    }

    clearActionError(review.reviewId);
    clearActionSuccess(review.reviewId);
    startTransition(async () => {
      const formData = new FormData();

      formData.set('responseId', review.responseId || '');
      formData.set('sellerSlug', sellerSlug);

      const result = await deleteSellerResponseAction(formData);

      if (!result.ok) {
        setActionErrorByReviewId((currentErrors) => ({
          ...currentErrors,
          [review.reviewId]: t('responseDeleteFailedMessage'),
        }));
        return;
      }

      setResponseState((currentState) => ({
        ...currentState,
        [review.reviewId]: {
          responseId: null,
          body: null,
          updatedAt: null,
        },
      }));
      setActionSuccessByReviewId((currentSuccesses) => ({
        ...currentSuccesses,
        [review.reviewId]: t('responseDeletedMessage'),
      }));
      setConfirmingDeleteReviewId(null);
      setEditingReviewId(null);
      router.refresh();
    });
  }

  if (reviews.length === 0) {
    return (
      <div className="empty-results" role="status">
        <p>{t('noReviewsYetLabel')}</p>
      </div>
    );
  }

  return (
    <div className="seller-review-list">
      {reviewsWithResponses.map((review) => {
        const isEditing = editingReviewId === review.reviewId;
        const hasResponse = Boolean(review.responseId && review.responseBody);
        const actionError = actionErrorByReviewId[review.reviewId];
        const actionSuccess = actionSuccessByReviewId[review.reviewId];

        return (
          <article key={review.reviewId} className="seller-review-card">
            <header className="seller-review-header">
              <ProfileAvatar
                avatarPath={review.buyerAvatarPath}
                displayName={review.buyerDisplayName}
                size="small"
                focusX={review.buyerAvatarFocusX}
                focusY={review.buyerAvatarFocusY}
                zoom={review.buyerAvatarZoom}
              />
              <div>
                <p
                  className="seller-review-stars"
                  aria-label={t('starsLabel', { count: review.rating })}
                >
                  <span aria-hidden="true">{renderStars(review.rating)}</span>
                </p>
                <h3>{review.buyerDisplayName}</h3>
                <p className="seller-review-meta">
                  {t('verifiedPurchaseLabel')} · {review.listingTitleSnapshot} ·{' '}
                  {formatDate(review.completedAt, locale)}
                </p>
              </div>
            </header>

            {review.reviewBody ? (
              <p className="seller-review-body">{review.reviewBody}</p>
            ) : null}

            <ReviewPhotoViewer photos={review.reviewPhotos} />

            <p className="seller-review-date">
              {review.reviewUpdatedAt !== review.reviewCreatedAt
                ? `${t('editedReviewLabel')} ${formatDate(review.reviewUpdatedAt, locale)}`
                : formatDate(review.reviewCreatedAt, locale)}
            </p>

            {hasResponse && !isEditing ? (
              <section
                className="seller-response"
                aria-label={t('responseLabel')}
              >
                <h4>{t('responseLabel')}</h4>
                <p>{review.responseBody}</p>
                {review.responseUpdatedAt ? (
                  <time dateTime={review.responseUpdatedAt}>
                    {formatDate(review.responseUpdatedAt, locale)}
                  </time>
                ) : null}
              </section>
            ) : null}

            {canRespond ? (
              <div className="seller-response-editor">
                {hasResponse && !isEditing ? (
                  <div className="seller-response-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        clearActionError(review.reviewId);
                        clearActionSuccess(review.reviewId);
                        setEditingReviewId(review.reviewId);
                      }}
                      disabled={isPending}
                    >
                      {t('editResponseButton')}
                    </button>
                    <button
                      type="button"
                      className="listing-management-button"
                      onClick={() => setConfirmingDeleteReviewId(review.reviewId)}
                      disabled={isPending}
                    >
                      {t('deleteResponseButton')}
                    </button>
                  </div>
                ) : null}

                {!hasResponse && !isEditing ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      clearActionError(review.reviewId);
                      clearActionSuccess(review.reviewId);
                      setEditingReviewId(review.reviewId);
                    }}
                    disabled={isPending}
                  >
                    {t('addResponseButton')}
                  </button>
                ) : null}

                {isEditing ? (
                  <form onSubmit={(event) => handleSaveResponse(review, event)}>
                    <label
                      className="form-field"
                      htmlFor={`response-${review.reviewId}`}
                    >
                      <span>{t('responseLabel')}</span>
                      <textarea
                        id={`response-${review.reviewId}`}
                        name="body"
                        rows={3}
                        maxLength={1200}
                        defaultValue={review.responseBody || ''}
                        required
                      />
                    </label>
                    {actionError ? (
                      <p className="form-error" role="alert">
                        {actionError}
                      </p>
                    ) : null}
                    <div className="seller-response-actions">
                      <button
                        type="submit"
                        className="search-button"
                        disabled={isPending}
                      >
                        {isPending
                          ? t('responseSavingButton')
                          : t('saveResponseChangesButton')}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          clearActionError(review.reviewId);
                          setEditingReviewId(null);
                        }}
                        disabled={isPending}
                      >
                        {listingReportT('cancelButton')}
                      </button>
                    </div>
                  </form>
                ) : null}
                {actionSuccess ? (
                  <p className="form-success" role="status" aria-live="polite">
                    {actionSuccess}
                  </p>
                ) : null}
              </div>
            ) : null}

            {confirmingDeleteReviewId === review.reviewId && review.responseId ? (
              <div
                className="message-confirmation-backdrop"
                role="presentation"
                onClick={() => setConfirmingDeleteReviewId(null)}
              >
                <div
                  ref={confirmationRef}
                  className="message-confirmation-dialog"
                  role="dialog"
                  aria-modal="true"
                  tabIndex={-1}
                  aria-labelledby={`response-delete-title-${review.reviewId}`}
                  aria-describedby={`response-delete-description-${review.reviewId}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <h2 id={`response-delete-title-${review.reviewId}`}>
                    {t('deleteResponseButton')}
                  </h2>
                  <p id={`response-delete-description-${review.reviewId}`}>
                    {t('deleteResponseConfirmMessage')}
                  </p>
                  {actionError ? (
                    <p className="form-error" role="alert">
                      {actionError}
                    </p>
                  ) : null}
                  <div className="message-confirmation-actions">
                    <button
                      type="button"
                      className="message-confirmation-button message-confirmation-button--secondary"
                      onClick={() => setConfirmingDeleteReviewId(null)}
                      disabled={isPending}
                    >
                      {listingReportT('cancelButton')}
                    </button>
                    <button
                      type="button"
                      className="message-confirmation-button message-confirmation-button--destructive"
                      onClick={() => handleDeleteResponse(review)}
                      disabled={isPending}
                    >
                      {t('deleteResponseButton')}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
