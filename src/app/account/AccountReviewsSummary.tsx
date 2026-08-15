'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { content } from '@/content/tyv';
import { shouldRefreshForReviewMutation } from '@/lib/reviewMutationRefreshStorage';
import { createClient } from '@/lib/supabase/client';
import {
  listMyReviewableTransactions,
  type ReviewableTransaction,
} from '@/lib/supabase/reviews';

type Props = {
  initialTransactions: ReviewableTransaction[];
};

export default function AccountReviewsSummary({
  initialTransactions,
}: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);

  const refreshSummary = useCallback(async () => {
    const nextTransactions = await listMyReviewableTransactions(createClient());
    setTransactions(nextTransactions);
  }, []);

  useEffect(() => {
    let active = true;

    function refreshIfNeeded(): void {
      if (!active || !shouldRefreshForReviewMutation('/account')) {
        return;
      }

      void refreshSummary();
    }

    const frameId = window.requestAnimationFrame(refreshIfNeeded);
    window.addEventListener('pageshow', refreshIfNeeded);
    window.addEventListener('focus', refreshIfNeeded);

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('pageshow', refreshIfNeeded);
      window.removeEventListener('focus', refreshIfNeeded);
    };
  }, [refreshSummary]);

  const toReviewCount = transactions.filter(
    (transaction) => !transaction.reviewId
  ).length;
  const writtenCount = transactions.filter(
    (transaction) => transaction.reviewId
  ).length;

  return (
    <section className="account-reviews-summary" aria-labelledby="account-reviews-title">
      <div>
        <h3 id="account-reviews-title">{content.reviewsAccountSummaryTitle}</h3>
        <p>
          {content.reviewsAccountSummaryTemplate
            .replace('{toReview}', String(toReviewCount))
            .replace('{written}', String(writtenCount))}
        </p>
      </div>
      <Link href="/account/reviews" className="secondary-button">
        {content.viewReviewsButton}
      </Link>
    </section>
  );
}
