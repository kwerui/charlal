'use client';

import { Link } from '@/i18n/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('Account');
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
        <h3 id="account-reviews-title">{t('reviewsSummaryTitle')}</h3>
        <p>
          {t('reviewsSummary', {
            toReview: toReviewCount,
            written: writtenCount,
          })}
        </p>
      </div>
      <Link href="/account/reviews" className="secondary-button">
        {t('viewReviewsButton')}
      </Link>
    </section>
  );
}
