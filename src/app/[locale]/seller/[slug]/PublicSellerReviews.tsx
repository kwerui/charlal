'use client';

import { useLocale, useTranslations } from 'next-intl';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import { formatReviewDate } from '@/lib/reviewDateFormatting';
import { SELLER_REVIEW_TAGS, type SellerReviewTag } from '@/lib/reviewTags';
import type { PublicSellerReview } from '@/lib/supabase/reviews';

type Props = {
  sellerSlug: string;
  reviews: PublicSellerReview[];
  canRespond: boolean;
};

function renderStars(rating: number): string {
  return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
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

export default function PublicSellerReviews({ reviews }: Props) {
  const locale = useLocale();
  const t = useTranslations('PublicSellerReviews');

  if (reviews.length === 0) {
    return (
      <div className="empty-results" role="status">
        <p>{t('noReviewsYetLabel')}</p>
      </div>
    );
  }

  return (
    <div className="seller-review-list">
      {reviews.map((review) => (
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
                {formatReviewDate(review.completedAt, locale)}
              </p>
            </div>
          </header>

          <ReviewTagChips
            tags={review.reviewTags.filter((tag) =>
              SELLER_REVIEW_TAGS.includes(tag)
            )}
          />

          <p className="seller-review-date">
            {review.reviewUpdatedAt !== review.reviewCreatedAt
              ? `${t('editedReviewLabel')} ${formatReviewDate(
                  review.reviewUpdatedAt,
                  locale
                )}`
              : formatReviewDate(review.reviewCreatedAt, locale)}
          </p>
        </article>
      ))}
    </div>
  );
}
