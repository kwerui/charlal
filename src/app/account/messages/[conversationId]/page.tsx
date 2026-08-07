import Link from 'next/link';
import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { getCurrentUserResult } from '@/lib/auth/server';
import { getCurrentUserConversationThread } from '@/lib/supabase/messagingServer';
import ConversationThread from './ConversationThread';

type ConversationPageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;
  const nextPath = `/account/messages/${encodeURIComponent(conversationId)}`;
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  }

  if (authResult.status !== 'authenticated') {
    return (
      <main className="account-page">
        <section className="account-panel" aria-labelledby="messages-title">
          <div className="empty-results" role="alert">
            <h1 id="messages-title">{content.messagesTitle}</h1>
            <p>{content.unableLoadMessagesMessage}</p>
          </div>
        </section>
      </main>
    );
  }

  const threadResult = await getCurrentUserConversationThread(conversationId);

  return (
    <main className="account-page">
      <section className="account-panel" aria-labelledby="messages-title">
        <Link href="/account/messages" className="page-back-link">
          {content.backToMessages}
        </Link>

        {!threadResult.ok ? (
          <div className="empty-results" role="status">
            <h1 id="messages-title">{content.messagesTitle}</h1>
            <p>{content.unableLoadMessagesMessage}</p>
          </div>
        ) : (
          <ConversationThread
            conversation={threadResult.conversation}
            initialMessages={threadResult.messages}
            currentUserId={authResult.user.id}
          />
        )}
      </section>
    </main>
  );
}
