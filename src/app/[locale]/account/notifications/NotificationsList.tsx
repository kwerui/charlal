'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/account/notifications/actions';
import {
  formatAppShortDate,
  formatAppTime,
} from '@/lib/appDateFormatting';
import type { AppNotification } from '@/lib/notificationsTypes';
import { useNotificationsRealtime } from '@/lib/notificationsRealtime';

type Props = {
  initialNotifications: AppNotification[];
};

function formatNotificationDate(value: string, locale: string): string {
  return `${formatAppShortDate(value, locale)} ${formatAppTime(value)}`;
}

function getNotificationTitle(
  notification: AppNotification,
  t: ReturnType<typeof useTranslations<'Notifications'>>
): string {
  const actorDisplayName =
    notification.actorDisplayName || t('actorFallbackDisplayName');

  if (notification.type === 'message_received') {
    return t('messageReceivedTitle', {
      actor: actorDisplayName,
    });
  }

  if (notification.type === 'review_received') {
    return t('reviewReceivedTitle', {
      actor: actorDisplayName,
    });
  }

  return t('savedListingStatusChangedTitle');
}

function getNotificationDescription(
  notification: AppNotification,
  t: ReturnType<typeof useTranslations<'Notifications'>>
): string {
  if (notification.type === 'message_received') {
    return t('messageReceivedDescription', {
      listingTitle:
        notification.conversationTitle || t('fallbackAdvertisementTitle'),
    });
  }

  if (notification.type === 'review_received') {
    return t('reviewReceivedDescription', {
      listingTitle:
        notification.reviewListingTitle || t('fallbackAdvertisementTitle'),
    });
  }

  return t('savedListingStatusChangedDescription', {
    listingTitle:
      notification.listingTitle || t('fallbackAdvertisementTitle'),
    oldStatus: notification.oldListingStatus
      ? t(`listingStatus.${notification.oldListingStatus}`)
      : t('listingStatus.unknown'),
    newStatus: notification.newListingStatus
      ? t(`listingStatus.${notification.newListingStatus}`)
      : t('listingStatus.unknown'),
  });
}

export default function NotificationsList({
  initialNotifications,
}: Props) {
  const t = useTranslations('Notifications');
  const locale = useLocale();
  const router = useRouter();
  const {
    notifications: liveNotifications,
    status,
    refreshNotificationsState,
  } = useNotificationsRealtime();
  const notifications = liveNotifications ?? initialNotifications;
  const unreadCount = notifications.filter(
    (notification) => !notification.readAt
  ).length;

  async function openNotification(notification: AppNotification): Promise<void> {
    if (!notification.readAt) {
      const result = await markNotificationReadAction(notification.id);

      if (result.ok) {
        await refreshNotificationsState();
      }
    }

    router.push(notification.href);
  }

  async function markAllRead(): Promise<void> {
    await markAllNotificationsReadAction();
    await refreshNotificationsState();
  }

  if (notifications.length === 0) {
    return (
      <div className="empty-results" role="status">
        <h2>{t('emptyTitle')}</h2>
        <p>{t('emptyMessage')}</p>
      </div>
    );
  }

  return (
    <div className="notifications-view">
      <div className="notifications-toolbar">
        <p className="results-summary" aria-live="polite">
          {t('unreadCountLabel', { count: unreadCount })}
        </p>
        <button
          type="button"
          className="secondary-button notifications-mark-all-button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          {t('markAllReadButton')}
        </button>
      </div>

      {status === 'unavailable' ? (
        <p
          className="messaging-live-status messaging-live-status--unavailable"
          role="status"
        >
          {t('liveUpdatesUnavailableMessage')}
        </p>
      ) : null}

      <div className="notifications-list">
        {notifications.map((notification) => {
          const unread = !notification.readAt;
          const title = getNotificationTitle(notification, t);
          const description = getNotificationDescription(notification, t);

          return (
            <article
              key={notification.id}
              className={
                unread
                  ? 'notification-card notification-card--unread'
                  : 'notification-card'
              }
            >
              <button
                type="button"
                className="notification-card-button"
                onClick={() => {
                  void openNotification(notification);
                }}
                aria-label={t('openNotificationLabel', {
                  title,
                })}
              >
                <span className="notification-card-content">
                  <span className="notification-card-title-row">
                    <span className="notification-card-title">
                      {title}
                    </span>
                    {unread ? (
                      <span className="notification-unread-indicator">
                        {t('unreadLabel')}
                      </span>
                    ) : null}
                  </span>
                  <span className="notification-card-description">
                    {description}
                  </span>
                  <time
                    className="notification-card-time"
                    dateTime={notification.createdAt}
                  >
                    {formatNotificationDate(notification.createdAt, locale)}
                  </time>
                </span>
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
