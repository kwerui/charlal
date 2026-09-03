export type NotificationListingStatus =
  | 'active'
  | 'reserved'
  | 'sold'
  | 'archived';

export const NOTIFICATION_TYPES = [
  'message_received',
  'review_received',
  'saved_listing_status_changed',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SELECT_COLUMNS =
  'notification_id, notification_type, actor_display_name, conversation_id, conversation_title, review_id, review_listing_title, listing_id, listing_title, old_listing_status, new_listing_status, read_at, created_at';

export type DatabaseNotificationRow = {
  notification_id: string;
  notification_type: NotificationType;
  actor_display_name: string | null;
  conversation_id: string | null;
  conversation_title: string | null;
  review_id: string | null;
  review_listing_title: string | null;
  listing_id: string | null;
  listing_title: string | null;
  old_listing_status: NotificationListingStatus | null;
  new_listing_status: NotificationListingStatus | null;
  read_at: string | null;
  created_at: string;
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  actorDisplayName: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  reviewId: string | null;
  reviewListingTitle: string | null;
  listingId: string | null;
  listingTitle: string | null;
  oldListingStatus: NotificationListingStatus | null;
  newListingStatus: NotificationListingStatus | null;
  readAt: string | null;
  createdAt: string;
  href: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function isNotificationType(value: unknown): value is NotificationType {
  return (
    value === 'message_received' ||
    value === 'review_received' ||
    value === 'saved_listing_status_changed'
  );
}

export function isNotificationListingStatus(
  value: unknown
): value is NotificationListingStatus {
  return (
    value === 'active' ||
    value === 'reserved' ||
    value === 'sold' ||
    value === 'archived'
  );
}

export function isDatabaseNotificationRow(
  value: unknown
): value is DatabaseNotificationRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.notification_id === 'string' &&
    isNotificationType(value.notification_type) &&
    (typeof value.actor_display_name === 'string' ||
      value.actor_display_name === null) &&
    (typeof value.conversation_id === 'string' ||
      value.conversation_id === null) &&
    (typeof value.conversation_title === 'string' ||
      value.conversation_title === null) &&
    (typeof value.review_id === 'string' || value.review_id === null) &&
    (typeof value.review_listing_title === 'string' ||
      value.review_listing_title === null) &&
    (typeof value.listing_id === 'string' || value.listing_id === null) &&
    (typeof value.listing_title === 'string' || value.listing_title === null) &&
    (isNotificationListingStatus(value.old_listing_status) ||
      value.old_listing_status === null) &&
    (isNotificationListingStatus(value.new_listing_status) ||
      value.new_listing_status === null) &&
    (typeof value.read_at === 'string' || value.read_at === null) &&
    typeof value.created_at === 'string'
  );
}

export function isDatabaseNotificationRowArray(
  value: unknown
): value is DatabaseNotificationRow[] {
  return Array.isArray(value) && value.every(isDatabaseNotificationRow);
}

export function getNotificationHref(row: Pick<
  DatabaseNotificationRow,
  'notification_type' | 'conversation_id' | 'listing_id'
>): string {
  if (row.notification_type === 'message_received' && row.conversation_id) {
    return `/account/messages/${row.conversation_id}`;
  }

  if (row.notification_type === 'review_received') {
    return '/account/reviews';
  }

  if (
    row.notification_type === 'saved_listing_status_changed' &&
    row.listing_id
  ) {
    return `/listing/${row.listing_id}`;
  }

  return '/account/notifications';
}

export function databaseNotificationRowToApp(
  row: DatabaseNotificationRow
): AppNotification {
  return {
    id: row.notification_id,
    type: row.notification_type,
    actorDisplayName: row.actor_display_name,
    conversationId: row.conversation_id,
    conversationTitle: row.conversation_title,
    reviewId: row.review_id,
    reviewListingTitle: row.review_listing_title,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    oldListingStatus: row.old_listing_status,
    newListingStatus: row.new_listing_status,
    readAt: row.read_at,
    createdAt: row.created_at,
    href: getNotificationHref(row),
  };
}
