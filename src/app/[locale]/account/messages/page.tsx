import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSignInHref } from '@/i18n/localePath';
import { getCurrentUserResult } from '@/lib/auth/server';
import { listCurrentUserConversationSummaries } from '@/lib/supabase/messagingServer';
import MessagesInbox from './MessagesInbox';

type MessagesPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MessagesPage({ params }: MessagesPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Messages');
  const accountT = await getTranslations('Account');
  const listingDetailT = await getTranslations('ListingDetail');
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(getSignInHref('/account/messages', locale));
  }

  if (authResult.status !== 'authenticated') {
    return (
      <main className="account-page">
        <section className="account-panel" aria-labelledby="messages-title">
          <div className="empty-results" role="alert">
            <h1 id="messages-title">{t('title')}</h1>
            <p>{t('unableLoadConversationsMessage')}</p>
          </div>
        </section>
      </main>
    );
  }

  const conversationsResult = await listCurrentUserConversationSummaries();

  return (
    <main className="account-page">
      <section className="account-panel" aria-labelledby="messages-title">
        <div className="form-page-heading">
          <p className="hero-kicker">{accountT('title')}</p>
          <h1 id="messages-title" className="auth-title">
            {t('title')}
          </h1>
        </div>

        <Link href="/account" className="page-back-link">
          {listingDetailT('backToAccount')}
        </Link>

        {!conversationsResult.ok ? (
          <div className="empty-results" role="alert">
            <h2>{t('unableLoadConversationsMessage')}</h2>
            <Link href="/account/messages" className="secondary-button edit-listing-state-link">
              {t('retryButton')}
            </Link>
          </div>
        ) : (
          <MessagesInbox initialConversations={conversationsResult.conversations} />
        )}
      </section>
    </main>
  );
}
