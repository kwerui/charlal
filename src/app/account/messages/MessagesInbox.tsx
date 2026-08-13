'use client';

import Link from 'next/link';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import { content } from '@/content/tyv';
import type { AppConversationSummary } from '@/lib/messagingTypes';
import { useMessagingRealtime } from '@/lib/messagingRealtime';

type Props = {
  initialConversations: AppConversationSummary[];
};

function formatMessageDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function MessagesInbox({ initialConversations }: Props) {
  const { conversations: liveConversations, status } = useMessagingRealtime();
  const conversations = liveConversations ?? initialConversations;

  if (conversations.length === 0) {
    return (
      <div className="empty-results" role="status">
        <h2>{content.noConversationsTitle}</h2>
        <p>{content.noConversationsMessage}</p>
      </div>
    );
  }

  return (
    <>
      {status === 'unavailable' ? (
        <p className="messaging-live-status messaging-live-status--unavailable" role="status">
          {content.liveUpdatesUnavailableMessage}
        </p>
      ) : null}
      <div className="messages-inbox-list">
        {conversations.map((conversation) => {
          const hasUnreadMessages = conversation.unreadCount > 0;
          const previewText = conversation.lastMessageDeleted
            ? content.messageDeletedLabel
            : conversation.lastMessagePreview ||
              (conversation.lastMessageAttachmentCount === 1
                ? content.messagePhotoPreviewLabel
                : conversation.lastMessageAttachmentCount > 1
                  ? content.messagePhotosPreviewLabel
                  : '');

          return (
            <article
              key={conversation.id}
              className={
                hasUnreadMessages
                  ? 'conversation-summary-card conversation-summary-card--unread'
                  : 'conversation-summary-card'
              }
            >
              <Link
                href={`/account/messages/${conversation.id}`}
                className="conversation-summary-card-link"
                aria-label={`${conversation.listingTitle} — ${conversation.otherParticipantDisplayName}`}
              >
                <span className="sr-only">{conversation.listingTitle}</span>
              </Link>
              <Link
                href={`/seller/${conversation.otherParticipantPublicSlug}`}
                className="conversation-summary-profile-link"
              >
                <ProfileAvatar
                  avatarPath={conversation.otherParticipantAvatarPath}
                  displayName={conversation.otherParticipantDisplayName}
                  size="small"
                  focusX={conversation.otherParticipantAvatarFocusX}
                  focusY={conversation.otherParticipantAvatarFocusY}
                  zoom={conversation.otherParticipantAvatarZoom}
                />
                <span className="conversation-summary-participant">
                  {conversation.otherParticipantDisplayName}
                </span>
              </Link>
              <div className="conversation-summary-conversation-content">
                <span className="conversation-summary-title">
                  {conversation.listingTitle}
                </span>
                <span className="conversation-summary-preview">
                  {previewText}
                </span>
                <span className="conversation-summary-meta">
                  <time
                    className="conversation-summary-time"
                    dateTime={conversation.lastMessageAt}
                  >
                    {formatMessageDate(conversation.lastMessageAt)}
                  </time>
                  {hasUnreadMessages ? (
                    <span
                      className="conversation-unread-count-badge"
                      aria-label={`${conversation.unreadCount} ${content.unreadMessagesLabel}`}
                      title={`${conversation.unreadCount} ${content.unreadMessagesLabel}`}
                    >
                      {conversation.unreadCount > 99
                        ? '99+'
                        : conversation.unreadCount}
                    </span>
                  ) : null}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
