'use client';

import { Link } from '@/i18n/navigation';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import { useLocale, useTranslations } from 'next-intl';
import { formatMessageDateTime } from '@/lib/messageDateFormatting';
import type { AppConversationSummary } from '@/lib/messagingTypes';
import { useMessagingRealtime } from '@/lib/messagingRealtime';

type Props = {
  initialConversations: AppConversationSummary[];
};

function formatMessageDate(value: string, locale: string): string {
  return formatMessageDateTime(value, locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function MessagesInbox({ initialConversations }: Props) {
  const t = useTranslations('Messages');
  const locale = useLocale();
  const { conversations: liveConversations, status } = useMessagingRealtime();
  const conversations = liveConversations ?? initialConversations;

  if (conversations.length === 0) {
    return (
      <div className="empty-results" role="status">
        <h2>{t('noConversationsTitle')}</h2>
        <p>{t('noConversationsMessage')}</p>
      </div>
    );
  }

  return (
    <>
      {status === 'unavailable' ? (
        <p className="messaging-live-status messaging-live-status--unavailable" role="status">
          {t('liveUpdatesUnavailableMessage')}
        </p>
      ) : null}
      <div className="messages-inbox-list">
        {conversations.map((conversation) => {
          const hasUnreadMessages = conversation.unreadCount > 0;
          const previewText = conversation.lastMessageDeleted
            ? t('messageDeletedLabel')
            : conversation.lastMessagePreview ||
              (conversation.lastMessageAttachmentCount === 1
                ? t('messagePhotoPreviewLabel')
                : conversation.lastMessageAttachmentCount > 1
                  ? t('messagePhotosPreviewLabel')
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
                aria-label={t('conversationLinkLabel', {
                  listingTitle: conversation.listingTitle,
                  participantName: conversation.otherParticipantDisplayName,
                })}
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
                    {formatMessageDate(conversation.lastMessageAt, locale)}
                  </time>
                  {hasUnreadMessages ? (
                    <span
                      className="conversation-unread-count-badge"
                      aria-label={t('unreadMessagesLabel', {
                        count: conversation.unreadCount,
                      })}
                      title={t('unreadMessagesLabel', {
                        count: conversation.unreadCount,
                      })}
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
