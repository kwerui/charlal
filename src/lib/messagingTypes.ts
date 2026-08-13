export const CONVERSATION_SELECT_COLUMNS =
  'id, listing_id, listing_title_snapshot, buyer_id, seller_id, buyer_display_name, seller_display_name, created_at, updated_at, last_message_at';

export const MESSAGE_SELECT_COLUMNS =
  'id, conversation_id, sender_id, body, created_at, client_attempt_id, edited_at, deleted_at';

export const MESSAGE_ATTACHMENT_SELECT_COLUMNS =
  'id, message_id, storage_path, position, content_type, created_at';

export const CONVERSATION_READ_SELECT_COLUMNS =
  'conversation_id, user_id, last_read_at';

export const CONVERSATION_USER_STATE_SELECT_COLUMNS =
  'conversation_id, user_id, hidden_at';

export const MESSAGE_BODY_MAX_LENGTH = 2000;
export const MAX_MESSAGE_ATTACHMENTS = 4;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp';

export const MESSAGE_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type MessageAttachmentMimeType =
  (typeof MESSAGE_ATTACHMENT_MIME_TYPES)[number];

export type DatabaseConversationRow = {
  id: string;
  listing_id: string | null;
  listing_title_snapshot: string;
  buyer_id: string;
  seller_id: string;
  buyer_display_name: string;
  seller_display_name: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

export type DatabaseConversationSummaryRow = {
  conversation_id: string;
  listing_id: string | null;
  listing_title_snapshot: string;
  other_participant_display_name: string;
  other_participant_public_slug: string;
  other_participant_avatar_path: string | null;
  other_participant_avatar_focus_x: number;
  other_participant_avatar_focus_y: number;
  other_participant_avatar_zoom: number;
  last_message_preview: string;
  last_message_at: string;
  unread_count: number;
  last_message_deleted: boolean;
  last_message_attachment_count: number;
};

export type DatabaseMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  client_attempt_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
};

export type DatabaseMessageAttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  position: number;
  content_type: MessageAttachmentMimeType;
  created_at: string;
};

export type DatabaseConversationReadRow = {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
};

export type DatabaseConversationUserStateRow = {
  conversation_id: string;
  user_id: string;
  hidden_at: string | null;
};

export type AppConversation = {
  id: string;
  listingId: string | null;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  buyerDisplayName: string;
  sellerDisplayName: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type AppConversationPublicCounterpart = {
  displayName: string;
  publicSlug: string;
  avatarPath: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
};

export type AppConversationSummary = {
  id: string;
  listingId: string | null;
  listingTitle: string;
  otherParticipantDisplayName: string;
  otherParticipantPublicSlug: string;
  otherParticipantAvatarPath: string | null;
  otherParticipantAvatarFocusX: number;
  otherParticipantAvatarFocusY: number;
  otherParticipantAvatarZoom: number;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  lastMessageDeleted: boolean;
  lastMessageAttachmentCount: number;
};

export type AppMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  clientAttemptId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
};

export type AppMessageAttachment = {
  id: string;
  messageId: string;
  storagePath: string;
  position: number;
  contentType: MessageAttachmentMimeType;
  createdAt: string;
  url: string;
};

export type AppConversationRead = {
  conversationId: string;
  userId: string;
  lastReadAt: string;
};

export type AppConversationUserState = {
  conversationId: string;
  userId: string;
  hiddenAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function isDatabaseConversationRow(
  value: unknown
): value is DatabaseConversationRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    (typeof value.listing_id === 'string' || value.listing_id === null) &&
    typeof value.listing_title_snapshot === 'string' &&
    typeof value.buyer_id === 'string' &&
    typeof value.seller_id === 'string' &&
    typeof value.buyer_display_name === 'string' &&
    typeof value.seller_display_name === 'string' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.last_message_at === 'string'
  );
}

export function isDatabaseConversationSummaryRow(
  value: unknown
): value is DatabaseConversationSummaryRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.conversation_id === 'string' &&
    (typeof value.listing_id === 'string' || value.listing_id === null) &&
    typeof value.listing_title_snapshot === 'string' &&
    typeof value.other_participant_display_name === 'string' &&
    typeof value.other_participant_public_slug === 'string' &&
    (typeof value.other_participant_avatar_path === 'string' ||
      value.other_participant_avatar_path === null) &&
    typeof value.other_participant_avatar_focus_x === 'number' &&
    typeof value.other_participant_avatar_focus_y === 'number' &&
    typeof value.other_participant_avatar_zoom === 'number' &&
    typeof value.last_message_preview === 'string' &&
    typeof value.last_message_at === 'string' &&
    typeof value.unread_count === 'number' &&
    typeof value.last_message_deleted === 'boolean' &&
    typeof value.last_message_attachment_count === 'number'
  );
}

export function isDatabaseConversationSummaryRowArray(
  value: unknown
): value is DatabaseConversationSummaryRow[] {
  return Array.isArray(value) && value.every(isDatabaseConversationSummaryRow);
}

export function isDatabaseMessageRow(value: unknown): value is DatabaseMessageRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.conversation_id === 'string' &&
    typeof value.sender_id === 'string' &&
    typeof value.body === 'string' &&
    typeof value.created_at === 'string' &&
    (typeof value.client_attempt_id === 'string' ||
      value.client_attempt_id === null) &&
    (typeof value.edited_at === 'string' || value.edited_at === null) &&
    (typeof value.deleted_at === 'string' || value.deleted_at === null)
  );
}

export function isMessageAttachmentMimeType(
  value: unknown
): value is MessageAttachmentMimeType {
  return (
    value === 'image/jpeg' || value === 'image/png' || value === 'image/webp'
  );
}

export function isDatabaseMessageAttachmentRow(
  value: unknown
): value is DatabaseMessageAttachmentRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.message_id === 'string' &&
    typeof value.storage_path === 'string' &&
    typeof value.position === 'number' &&
    isMessageAttachmentMimeType(value.content_type) &&
    typeof value.created_at === 'string'
  );
}

export function isDatabaseConversationReadRow(
  value: unknown
): value is DatabaseConversationReadRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.conversation_id === 'string' &&
    typeof value.user_id === 'string' &&
    typeof value.last_read_at === 'string'
  );
}

export function isDatabaseConversationUserStateRow(
  value: unknown
): value is DatabaseConversationUserStateRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.conversation_id === 'string' &&
    typeof value.user_id === 'string' &&
    (typeof value.hidden_at === 'string' || value.hidden_at === null)
  );
}

export function isDatabaseMessageRowArray(
  value: unknown
): value is DatabaseMessageRow[] {
  return Array.isArray(value) && value.every(isDatabaseMessageRow);
}

export function isDatabaseMessageAttachmentRowArray(
  value: unknown
): value is DatabaseMessageAttachmentRow[] {
  return Array.isArray(value) && value.every(isDatabaseMessageAttachmentRow);
}

export function isDatabaseConversationReadRowArray(
  value: unknown
): value is DatabaseConversationReadRow[] {
  return Array.isArray(value) && value.every(isDatabaseConversationReadRow);
}

export function isDatabaseConversationUserStateRowArray(
  value: unknown
): value is DatabaseConversationUserStateRow[] {
  return Array.isArray(value) && value.every(isDatabaseConversationUserStateRow);
}

export function databaseConversationRowToApp(
  row: DatabaseConversationRow
): AppConversation {
  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title_snapshot,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    buyerDisplayName: row.buyer_display_name,
    sellerDisplayName: row.seller_display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

export function databaseConversationSummaryRowToApp(
  row: DatabaseConversationSummaryRow
): AppConversationSummary {
  return {
    id: row.conversation_id,
    listingId: row.listing_id,
    listingTitle: row.listing_title_snapshot,
    otherParticipantDisplayName: row.other_participant_display_name,
    otherParticipantPublicSlug: row.other_participant_public_slug,
    otherParticipantAvatarPath: row.other_participant_avatar_path,
    otherParticipantAvatarFocusX: row.other_participant_avatar_focus_x,
    otherParticipantAvatarFocusY: row.other_participant_avatar_focus_y,
    otherParticipantAvatarZoom: row.other_participant_avatar_zoom,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    lastMessageDeleted: row.last_message_deleted,
    lastMessageAttachmentCount: row.last_message_attachment_count,
  };
}

export function databaseMessageRowToApp(row: DatabaseMessageRow): AppMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    clientAttemptId: row.client_attempt_id,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

export function databaseMessageAttachmentRowToApp(
  row: DatabaseMessageAttachmentRow,
  url: string
): AppMessageAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    storagePath: row.storage_path,
    position: row.position,
    contentType: row.content_type,
    createdAt: row.created_at,
    url,
  };
}

export function databaseConversationReadRowToApp(
  row: DatabaseConversationReadRow
): AppConversationRead {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    lastReadAt: row.last_read_at,
  };
}

export function databaseConversationUserStateRowToApp(
  row: DatabaseConversationUserStateRow
): AppConversationUserState {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    hiddenAt: row.hidden_at,
  };
}
