import Link from 'next/link';
import { redirect } from 'next/navigation';
import PurchasesToReview from '@/app/account/PurchasesToReview';
import { content } from '@/content/tyv';
import { getCurrentUserResult } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { listMyReviewableTransactions } from '@/lib/supabase/reviews';

export default async function AccountReviewsPage() {
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect('/sign-in?next=/account/reviews');
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
