import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { getSignInHref } from '@/i18n/localePath';
import { getCurrentUserResult } from '@/lib/auth/server';
import { listCurrentUserConversationSummaries } from '@/lib/supabase/messagingServer';
import MessagesInbox from './MessagesInbox';

type MessagesPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MessagesPage({ params }: MessagesPageProps) {
  const { locale } = await params;
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(getSignInHref('/account/messages', locale));
  }

  if (authResult.status !== 'authenticated') {
    return (
      <main className="account-page">
        <section className="account-panel" aria-labelledby="messages-title">
          <div className="empty-results" role="alert">
            <h1 id="messages-title">{content.messagesTitle}</h1>
            <p>{content.unableLoadConversationsMessage}</p>
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
          <p className="hero-kicker">{content.accountKicker}</p>
          <h1 id="messages-title" className="auth-title">
            {content.messagesTitle}
          </h1>
        </div>

        <Link href="/account" className="page-back-link">
          {content.backToAccount}
        </Link>

        {!conversationsResult.ok ? (
          <div className="empty-results" role="alert">
            <h2>{content.unableLoadConversationsMessage}</h2>
            <Link href="/account/messages" className="secondary-button edit-listing-state-link">
              {content.retryButton}
            </Link>
          </div>
        ) : (
          <MessagesInbox initialConversations={conversationsResult.conversations} />
        )}
      </section>
    </main>
  );
}
