import { notFound } from 'next/navigation';
import Link from 'next/link';
import ListingCard from '@/app/components/ListingCard';
import ListingMutationRefreshBoundary from '@/app/components/ListingMutationRefreshBoundary';
import PublicSellerAvatarViewer from '@/app/components/PublicSellerAvatarViewer';
import PublicSellerReviews from '@/app/seller/[slug]/PublicSellerReviews';
import ResultsScrollRestorer from '@/app/components/ResultsScrollRestorer';
import { content } from '@/content/tyv';
import { getCurrentUserResult } from '@/lib/auth/server';
import { getCurrentUserFavoriteState } from '@/lib/supabase/listingFavorites';
import { getPublicSellerPageBySlug } from '@/lib/supabase/publicSellerProfilesServer';

type SellerPageProps = {
  params: Promise<{ slug: string }>;
};

function formatMemberSince(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 7);
  }

  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatSellerRating(averageRating: number | null, reviewCount: number): string {
  if (!averageRating || reviewCount === 0) {
    return content.noReviewsYetLabel;
  }

  return `${averageRating.toFixed(1)} · ${reviewCount} ${
    reviewCount === 1 ? content.reviewSingularLabel : content.reviewsPluralLabel
  }`;
}

export default async function SellerPage({ params }: SellerPageProps) {
  const { slug } = await params;
  const sellerResult = await getPublicSellerPageBySlug(slug);

  if (!sellerResult.ok) {
    return (
      <main className="seller-profile-page" aria-labelledby="seller-profile-title">
        <div className="empty-results" role="alert">
          <h1 id="seller-profile-title">
            {content.sellerProfileUnavailableTitle}
          </h1>
          <p>{content.databaseListingsLoadFailedMessage}</p>
        </div>
      </main>
    );
  }

  if (!sellerResult.profile) {
    notFound();
  }

  const { profile, listings, reviewSummary, recentReviews } = sellerResult;
  const sellerHref = `/seller/${profile.publicSlug}`;
  const [favoriteState, authResult] = await Promise.all([
    getCurrentUserFavoriteState(),
    getCurrentUserResult(),
  ]);
  const canRespond =
    authResult.status === 'authenticated' &&
    authResult.profile.publicSlug === profile.publicSlug;

  return (
    <main className="seller-profile-page">
      <ListingMutationRefreshBoundary
        listingIds={listings.map((listing) => String(listing.id))}
      />
      <ResultsScrollRestorer resultsHref={sellerHref} />
      <section className="seller-profile-header-card" aria-labelledby="seller-profile-title">
        <div className="seller-profile-identity">
          <PublicSellerAvatarViewer
            avatarPath={profile.avatarPath}
            displayName={profile.displayName}
            focusX={profile.avatarFocusX}
            focusY={profile.avatarFocusY}
            zoom={profile.avatarZoom}
          />
          <div>
            <p className="hero-kicker">{content.sellerProfileTitle}</p>
            <h1 id="seller-profile-title">{profile.displayName}</h1>
            <p className="seller-reputation-summary">
              <span aria-hidden="true">★</span>{' '}
              {formatSellerRating(
                reviewSummary.averageRating,
                reviewSummary.reviewCount
              )}
            </p>
          </div>
        </div>
        <dl className="seller-profile-meta">
          {profile.location ? (
            <div>
              <dt>{content.profileLocationLabel}</dt>
              <dd>{profile.location}</dd>
            </div>
          ) : null}
          <div>
            <dt>{content.memberSinceLabel}</dt>
            <dd>{formatMemberSince(profile.memberSince)}</dd>
          </div>
        </dl>
        {profile.bio ? (
          <section className="seller-profile-bio" aria-labelledby="seller-profile-bio-title">
            <h2 id="seller-profile-bio-title">{content.bioLabel}</h2>
            <p>{profile.bio}</p>
          </section>
        ) : null}
      </section>

      <section className="seller-reviews-section" aria-labelledby="seller-reviews-title">
        <div className="seller-section-heading">
          <h2 id="seller-reviews-title">{content.sellerReviewsTitle}</h2>
          {reviewSummary.reviewCount > recentReviews.length ? (
            <Link
              href={`/seller/${profile.publicSlug}/reviews`}
              className="secondary-button"
            >
              {content.seeAllReviewsLabel}
            </Link>
          ) : null}
        </div>
        <PublicSellerReviews
          sellerSlug={profile.publicSlug}
          reviews={recentReviews}
          canRespond={canRespond}
        />
      </section>

      <section className="seller-listings-section" aria-labelledby="seller-active-listings-title">
        <h2 id="seller-active-listings-title">
          {content.activeListingsTitle}
        </h2>
        {listings.length > 0 ? (
          <div className="seller-listings-grid">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                fromHref={sellerHref}
                savedListingKeys={favoriteState.savedKeys}
                currentViewerId={favoriteState.userId}
              />
            ))}
          </div>
        ) : (
          <div className="empty-results" role="status">
            <p>{content.noActiveSellerListingsMessage}</p>
          </div>
        )}
      </section>
    </main>
  );
}
