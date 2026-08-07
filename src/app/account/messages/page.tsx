import Link from 'next/link';
import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { getCurrentUserResult } from '@/lib/auth/server';
import { listCurrentUserConversationSummaries } from '@/lib/supabase/messagingServer';

function formatMessageDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function MessagesPage() {
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect('/sign-in?next=/account/messages');
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
        ) : conversationsResult.conversations.length > 0 ? (
          <div className="messages-inbox-list">
            {conversationsResult.conversations.map((conversation) => {
              const hasUnreadMessages = conversation.unreadCount > 0;

              return (
                <Link
                  key={conversation.id}
                  href={`/account/messages/${conversation.id}`}
                  className={
                    hasUnreadMessages
                      ? 'conversation-summary-card conversation-summary-card--unread'
                      : 'conversation-summary-card'
                  }
                >
                  <span className="conversation-summary-title">
                    {conversation.listingTitle}
                  </span>
                  <span className="conversation-summary-participant">
                    {conversation.otherParticipantDisplayName}
                  </span>
                  <span className="conversation-summary-preview">
                    {conversation.lastMessagePreview}
                  </span>
                  <span className="conversation-summary-meta">
                    <time
                      className="conversation-summary-time"
                      dateTime={conversation.lastMessageAt}
                    >
                      {formatMessageDate(conversation.lastMessageAt)}
                    </time>
                    {hasUnreadMessages ? (
                      <span className="conversation-new-label">
                        {content.newMessageLabel}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-results" role="status">
            <h2>{content.noConversationsTitle}</h2>
            <p>{content.noConversationsMessage}</p>
          </div>
        )}
      </section>
    </main>
  );
}
