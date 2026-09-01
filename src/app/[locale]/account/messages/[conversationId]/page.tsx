import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSignInHref } from '@/i18n/localePath';
import { getCurrentUserResult } from '@/lib/auth/server';
import { getCurrentUserConversationThread } from '@/lib/supabase/messagingServer';
import ConversationThread from './ConversationThread';

type ConversationPageProps = {
  params: Promise<{ locale: string; conversationId: string }>;
};

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { locale, conversationId } = await params;
  const t = await getTranslations('Messages');
  const nextPath = `/account/messages/${encodeURIComponent(conversationId)}`;
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(getSignInHref(nextPath, locale));
  }

  if (authResult.status !== 'authenticated') {
    return (
      <main className="account-page">
        <section className="account-panel" aria-labelledby="messages-title">
          <div className="empty-results" role="alert">
            <h1 id="messages-title">{t('title')}</h1>
            <p>{t('unableLoadMessagesMessage')}</p>
          </div>
        </section>
      </main>
    );
  }

  const threadResult = await getCurrentUserConversationThread(conversationId);

  return (
    <main className="account-page account-page--conversation">
      <section
        className="account-panel account-panel--conversation"
        aria-labelledby="messages-title"
      >
        <Link href="/account/messages" className="page-back-link">
          {t('backToMessages')}
        </Link>

        {!threadResult.ok ? (
          <div className="empty-results" role="status">
            <h1 id="messages-title">{t('title')}</h1>
            <p>{t('unableLoadMessagesMessage')}</p>
          </div>
        ) : (
          <ConversationThread
            key={threadResult.conversation.id}
            conversation={threadResult.conversation}
            counterpart={threadResult.counterpart}
            initialMessages={threadResult.messages}
            initialAttachments={threadResult.attachments}
            initialReadMarkers={threadResult.readMarkers}
            currentUserId={authResult.user.id}
          />
        )}
      </section>
    </main>
  );
}
