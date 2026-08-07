export const CONVERSATION_SELECT_COLUMNS =
  'id, listing_id, listing_title_snapshot, buyer_id, seller_id, buyer_display_name, seller_display_name, created_at, updated_at, last_message_at';

export const MESSAGE_SELECT_COLUMNS =
  'id, conversation_id, sender_id, body, created_at';

export const MESSAGE_BODY_MAX_LENGTH = 2000;

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
  last_message_preview: string;
  last_message_at: string;
  unread_count: number;
};

export type DatabaseMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
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

export type AppConversationSummary = {
  id: string;
  listingId: string | null;
  listingTitle: string;
  otherParticipantDisplayName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
};

export type AppMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
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
    typeof value.last_message_preview === 'string' &&
    typeof value.last_message_at === 'string' &&
    typeof value.unread_count === 'number'
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
    typeof value.created_at === 'string'
  );
}

export function isDatabaseMessageRowArray(
  value: unknown
): value is DatabaseMessageRow[] {
  return Array.isArray(value) && value.every(isDatabaseMessageRow);
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
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
  };
}

export function databaseMessageRowToApp(row: DatabaseMessageRow): AppMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}
