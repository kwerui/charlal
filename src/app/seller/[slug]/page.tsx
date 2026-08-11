import { notFound } from 'next/navigation';
import ListingCard from '@/app/components/ListingCard';
import ListingMutationRefreshBoundary from '@/app/components/ListingMutationRefreshBoundary';
import ResultsScrollRestorer from '@/app/components/ResultsScrollRestorer';
import { content } from '@/content/tyv';
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

  const { profile, listings } = sellerResult;
  const sellerHref = `/seller/${profile.publicSlug}`;

  return (
    <main className="seller-profile-page">
      <ListingMutationRefreshBoundary
        listingIds={listings.map((listing) => String(listing.id))}
      />
      <ResultsScrollRestorer resultsHref={sellerHref} />
      <section className="seller-profile-header-card" aria-labelledby="seller-profile-title">
        <p className="hero-kicker">{content.sellerProfileTitle}</p>
        <h1 id="seller-profile-title">{profile.displayName}</h1>
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
