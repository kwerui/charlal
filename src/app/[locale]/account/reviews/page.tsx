import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import PurchasesToReview from '@/app/[locale]/account/PurchasesToReview';
import { content } from '@/content/tyv';
import { getSignInHref } from '@/i18n/localePath';
import { getCurrentUserResult } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { listMyReviewableTransactions } from '@/lib/supabase/reviews';

type AccountReviewsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AccountReviewsPage({ params }: AccountReviewsPageProps) {
  const { locale } = await params;
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(getSignInHref('/account/reviews', locale));
  }

  const reviewableTransactions =
    authResult.status === 'authenticated'
      ? await listMyReviewableTransactions(await createClient())
      : [];

  return (
    <main className="account-page account-page--reviews">
      <section
        className="account-panel account-panel--reviews"
        aria-labelledby="account-reviews-page-title"
      >
        <Link href="/account" className="page-back-link">
          {content.backToAccount}
        </Link>
        <div className="form-page-heading">
          <h1 id="account-reviews-page-title" className="auth-title">
            {content.reviewsAccountSummaryTitle}
          </h1>
        </div>
        <PurchasesToReview initialTransactions={reviewableTransactions} />
      </section>
    </main>
  );
}
