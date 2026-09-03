import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSignInHref } from '@/i18n/localePath';
import { getCurrentUserResult } from '@/lib/auth/server';
import { getListingFavoriteKey } from '@/lib/listingFavoriteKeys';
import { getCurrentUserFavoriteReferences } from '@/lib/supabase/listingFavorites';
import { listOwnedDatabaseListingsForOwner } from '@/lib/supabase/listingsServer';
import { createClient } from '@/lib/supabase/server';
import { listMyReviewableTransactions } from '@/lib/supabase/reviews';
import AccountDashboard from './AccountDashboard';

type AccountPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AccountPage({ params }: AccountPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Account');
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(getSignInHref('/account', locale));
  }

  const ownedListingsResult =
    authResult.status === 'authenticated'
      ? await listOwnedDatabaseListingsForOwner(authResult.user.id)
      : null;
  const savedListingKeys =
    authResult.status === 'authenticated'
      ? (await getCurrentUserFavoriteReferences()).map(getListingFavoriteKey)
      : [];
  const reviewableTransactions =
    authResult.status === 'authenticated'
      ? await listMyReviewableTransactions(await createClient())
      : [];

  return (
    <main className="account-page account-page--dashboard">
      <section
        className="account-panel account-panel--dashboard"
        aria-labelledby="account-title"
      >
        <div className="form-page-heading">
          <h1 id="account-title" className="auth-title">
            {t('title')}
          </h1>
        </div>
        <AccountDashboard
          initialAuthStatus={
            authResult.status === 'authenticated' ? 'signed-in' : 'unresolved'
          }
          initialUser={
            authResult.status === 'authenticated' ? authResult.user : null
          }
          initialProfile={
            authResult.status === 'authenticated' ? authResult.profile : null
          }
          initialOwnedListings={
            ownedListingsResult?.ok ? ownedListingsResult.listings : []
          }
          initialSavedListingKeys={savedListingKeys}
          initialReviewableTransactions={reviewableTransactions}
          initialListingsLoaded={Boolean(ownedListingsResult)}
          initialListingsError={Boolean(
            ownedListingsResult && !ownedListingsResult.ok
          )}
        />
      </section>
    </main>
  );
}
