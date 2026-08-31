import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import SavedListingsView from '@/app/[locale]/account/favorites/SavedListingsView';
import { getSignInHref } from '@/i18n/localePath';
import { getCurrentUserResult } from '@/lib/auth/server';
import { listCurrentUserSavedListings } from '@/lib/supabase/listingFavorites';

type SavedAdvertisementsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SavedAdvertisementsPage({
  params,
}: SavedAdvertisementsPageProps) {
  const { locale } = await params;
  const t = await getTranslations('SavedListings');
  const listingDetailT = await getTranslations('ListingDetail');
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(getSignInHref('/account/favorites', locale));
  }

  const savedListingsResult =
    authResult.status === 'authenticated'
      ? await listCurrentUserSavedListings()
      : null;
  const currentViewerId =
    authResult.status === 'authenticated' ? authResult.user.id : '';

  return (
    <main className="account-page account-page--favorites">
      <section
        className="account-panel account-panel--favorites"
        aria-labelledby="saved-advertisements-title"
      >
        <Link href="/account" className="page-back-link">
          {listingDetailT('backToAccount')}
        </Link>
        <div className="form-page-heading">
          <h1 id="saved-advertisements-title" className="auth-title">
            {t('title')}
          </h1>
        </div>

        {savedListingsResult?.ok ? (
          <SavedListingsView
            initialListings={savedListingsResult.listings}
            savedListingKeys={savedListingsResult.savedKeys}
            currentViewerId={currentViewerId}
          />
        ) : (
          <div className="empty-results" role="alert">
            <h2>{t('unableLoadTitle')}</h2>
            <p>{t('unableLoadMessage')}</p>
          </div>
        )}
      </section>
    </main>
  );
}
