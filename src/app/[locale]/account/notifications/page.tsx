import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSignInHref } from '@/i18n/localePath';
import { getCurrentUserResult } from '@/lib/auth/server';
import { listCurrentUserNotifications } from '@/lib/supabase/notifications';
import NotificationsList from './NotificationsList';

type NotificationsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function NotificationsPage({
  params,
}: NotificationsPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Notifications');
  const accountT = await getTranslations('Account');
  const listingDetailT = await getTranslations('ListingDetail');
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(getSignInHref('/account/notifications', locale));
  }

  const notificationsResult =
    authResult.status === 'authenticated'
      ? await listCurrentUserNotifications()
      : null;

  return (
    <main className="account-page account-page--notifications">
      <section
        className="account-panel account-panel--notifications"
        aria-labelledby="notifications-title"
      >
        <div className="form-page-heading">
          <p className="hero-kicker">{accountT('title')}</p>
          <h1 id="notifications-title" className="auth-title">
            {t('title')}
          </h1>
        </div>

        <Link href="/account" className="page-back-link">
          {listingDetailT('backToAccount')}
        </Link>

        {notificationsResult?.ok ? (
          <NotificationsList
            initialNotifications={notificationsResult.notifications}
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
