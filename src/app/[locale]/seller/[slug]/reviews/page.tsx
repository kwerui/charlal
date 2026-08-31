import { Link } from '@/i18n/navigation';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PublicSellerReviews from '@/app/[locale]/seller/[slug]/PublicSellerReviews';
import { getCurrentUserResult } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import {
  getSellerReviewSummary,
  listPublicSellerReviews,
} from '@/lib/supabase/reviews';
import { getPublicSellerPageBySlug } from '@/lib/supabase/publicSellerProfilesServer';

type SellerReviewsPageProps = {
  params: Promise<{ slug: string }>;
};

function formatSellerRating(
  averageRating: number | null,
  reviewCount: number,
  t: Awaited<ReturnType<typeof getTranslations>>
): string {
  if (!averageRating || reviewCount === 0) {
    return t('noReviewsYetLabel');
  }

  return t('ratingSummary', {
    rating: averageRating.toFixed(1),
    count: reviewCount,
  });
}

export default async function SellerReviewsPage({
  params,
}: SellerReviewsPageProps) {
  const { slug } = await params;
  const t = await getTranslations('SellerProfile');
  const listingResultsT = await getTranslations('ListingResults');
  const sellerResult = await getPublicSellerPageBySlug(slug);

  if (!sellerResult.ok) {
    return (
      <main className="seller-profile-page" aria-labelledby="seller-reviews-title">
        <div className="empty-results" role="alert">
          <h1 id="seller-reviews-title">
            {t('unavailableTitle')}
          </h1>
          <p>{listingResultsT('databaseListingsLoadFailedMessage')}</p>
        </div>
      </main>
    );
  }

  if (!sellerResult.profile) {
    notFound();
  }

  const supabase = await createClient();
  const [summary, reviews, authResult] = await Promise.all([
    getSellerReviewSummary(supabase, sellerResult.profile.publicSlug),
    listPublicSellerReviews(supabase, sellerResult.profile.publicSlug, 100),
    getCurrentUserResult(),
  ]);
  const canRespond =
    authResult.status === 'authenticated' &&
    authResult.profile.publicSlug === sellerResult.profile.publicSlug;

  return (
    <main className="seller-profile-page">
      <section className="seller-reviews-section" aria-labelledby="seller-reviews-title">
        <Link
          href={`/seller/${sellerResult.profile.publicSlug}`}
          className="page-back-link"
        >
          {t('backToSellerProfileLabel')}
        </Link>
        <div className="seller-section-heading">
          <div>
            <p className="hero-kicker">{t('title')}</p>
            <h1 id="seller-reviews-title">
              {t('reviewsTitle')}: {sellerResult.profile.displayName}
            </h1>
            <p className="seller-reputation-summary">
              <span aria-hidden="true">★</span>{' '}
              {formatSellerRating(summary.averageRating, summary.reviewCount, t)}
            </p>
          </div>
        </div>
        <PublicSellerReviews
          sellerSlug={sellerResult.profile.publicSlug}
          reviews={reviews}
          canRespond={canRespond}
        />
      </section>
    </main>
  );
}
