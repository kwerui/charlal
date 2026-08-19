import { connection } from 'next/server';
import {
  CONVERSATION_SELECT_COLUMNS,
  CONVERSATION_READ_SELECT_COLUMNS,
  MESSAGE_ATTACHMENT_SELECT_COLUMNS,
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_SELECT_COLUMNS,
  databaseConversationReadRowToApp,
  databaseConversationRowToApp,
  databaseConversationSummaryRowToApp,
  databaseMessageRowToApp,
  isDatabaseConversationReadRowArray,
  isDatabaseConversationRow,
  isDatabaseConversationSummaryRowArray,
  isDatabaseMessageAttachmentRowArray,
  isDatabaseMessageRow,
  isDatabaseMessageRowArray,
  type AppConversationRead,
  type AppConversation,
  type AppConversationPublicCounterpart,
  type AppConversationSummary,
  type AppMessage,
  type AppMessageAttachment,
} from '@/lib/messagingTypes';
import {
  messageAttachmentRowsToAppWithSignedUrls,
  removeMessageAttachmentFiles,
  type MessageAttachmentMetadataInput,
} from '@/lib/supabase/messageAttachments';
import { createClient } from '@/lib/supabase/server';

export type MessagingFailureReason =
  | 'unauthenticated'
  | 'not-found'
  | 'not-participant'
  | 'self-message'
  | 'empty-message'
  | 'message-too-long'
  | 'too-many-attachments'
  | 'invalid-attachment'
  | 'attachment-upload-failed'
  | 'database-unavailable';

export type ConversationIdResult =
  | {
      ok: true;
      conversationId: string;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type ConversationSummariesResult =
  | {
      ok: true;
      conversations: AppConversationSummary[];
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type UnreadConversationCountResult =
  | {
      ok: true;
      count: number;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type ConversationThreadResult =
  | {
      ok: true;
      conversation: AppConversation;
      counterpart: AppConversationPublicCounterpart;
      messages: AppMessage[];
      attachments: AppMessageAttachment[];
      readMarkers: AppConversationRead[];
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type ConversationMessageSnapshotResult =
  | {
      ok: true;
      message: AppMessage;
      attachments: AppMessageAttachment[];
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type SendMessageResult =
  | {
      ok: true;
      message: AppMessage;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type MessageMutationResult = SendMessageResult;

export type MarkConversationReadResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type HideConversationResult = MarkConversationReadResult;

function normalizeMessageBody(body: string): string {
  return body.trim();
}

type SafePostgrestError = {
  code?: string;
  message?: string;
};

type DeletedMessageWithAttachmentsRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  client_attempt_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  attachment_paths: string[];
};

type ConversationPublicCounterpartRow = {
  display_name: string;
  public_slug: string;
  avatar_path: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
};

function isConversationPublicCounterpartRow(
  value: unknown
): value is ConversationPublicCounterpartRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<
    Record<keyof ConversationPublicCounterpartRow, unknown>
  >;

  return (
    typeof row.display_name === 'string' &&
    typeof row.public_slug === 'string' &&
    (typeof row.avatar_path === 'string' || row.avatar_path === null) &&
    typeof row.avatar_focus_x === 'number' &&
    typeof row.avatar_focus_y === 'number' &&
    typeof row.avatar_zoom === 'number'
  );
}

function conversationPublicCounterpartRowToApp(
  row: ConversationPublicCounterpartRow
): AppConversationPublicCounterpart {
  return {
    displayName: row.display_name,
    publicSlug: row.public_slug,
    avatarPath: row.avatar_path,
    avatarFocusX: row.avatar_focus_x,
    avatarFocusY: row.avatar_focus_y,
    avatarZoom: row.avatar_zoom,
  };
}

function sanitizeDiagnosticMessage(message: string | undefined): string {
  return (message || 'Unknown messaging error')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240);
}

function isDeletedMessageWithAttachmentsRow(
  value: unknown
): value is DeletedMessageWithAttachmentsRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<
    Record<keyof DeletedMessageWithAttachmentsRow, unknown>
  >;

  return (
    typeof row.id === 'string' &&
    typeof row.conversation_id === 'string' &&
    typeof row.sender_id === 'string' &&
    typeof row.body === 'string' &&
    typeof row.created_at === 'string' &&
    (typeof row.client_attempt_id === 'string' ||
      row.client_attempt_id === null) &&
    (typeof row.edited_at === 'string' || row.edited_at === null) &&
    (typeof row.deleted_at === 'string' || row.deleted_at === null) &&
    Array.isArray(row.attachment_paths) &&
    row.attachment_paths.every((path) => typeof path === 'string')
  );
}

function deletedMessageWithAttachmentsRowToApp(
  row: DeletedMessageWithAttachmentsRow
): AppMessage {
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

async function hasResolvedUserForDiagnostic(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getClaims();

    return Boolean(data?.claims?.sub);
  } catch {
    return false;
  }
}

async function logMessagingDiagnostic(input: {
  operation: string;
  error?: SafePostgrestError | null;
  userResolved?: boolean;
}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.warn('[Messaging]', input.operation, {
    code: input.error?.code || 'none',
    message: sanitizeDiagnosticMessage(input.error?.message),
    userResolved: Boolean(input.userResolved),
  });
}

export function validateMessageBody(body: string): MessagingFailureReason | null {
  const safeBody = normalizeMessageBody(body);

  if (!safeBody) {
    return 'empty-message';
  }

  if (safeBody.length > MESSAGE_BODY_MAX_LENGTH) {
    return 'message-too-long';
  }

  return null;
}

function classifyMessagingError(message: string | undefined): MessagingFailureReason {
  const safeMessage = message?.toLocaleLowerCase() || '';

  if (safeMessage.includes('message body cannot be empty')) {
    return 'empty-message';
  }

  if (safeMessage.includes('message body is too long')) {
    return 'message-too-long';
  }

  if (safeMessage.includes('at most 4 attachments')) {
    return 'too-many-attachments';
  }

  if (
    safeMessage.includes('attachment') ||
    safeMessage.includes('invalid image')
  ) {
    return 'invalid-attachment';
  }

  if (
    safeMessage.includes('message is unavailable') ||
    safeMessage.includes('deleted messages cannot be changed')
  ) {
    return 'not-found';
  }

  if (safeMessage.includes('cannot message yourself')) {
    return 'self-message';
  }

  if (
    safeMessage.includes('conversation is unavailable') ||
    safeMessage.includes('violates row-level security')
  ) {
    return 'not-participant';
  }

  if (safeMessage.includes('listing is unavailable')) {
    return 'not-found';
  }

  if (safeMessage.includes('authenticated user is required')) {
    return 'unauthenticated';
  }

  return 'database-unavailable';
}

export async function startListingConversation(
  listingId: string,
  initialMessage: string
): Promise<ConversationIdResult> {
  await connection();

  const safeListingId = listingId.trim();
  const safeMessage = normalizeMessageBody(initialMessage);
  const validationError = validateMessageBody(safeMessage);

  if (!safeListingId) {
    return { ok: false, reason: 'not-found' };
  }

  if (validationError) {
    return { ok: false, reason: validationError };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_listing_conversation', {
    p_listing_id: safeListingId,
    p_initial_message: safeMessage,
  });

  if (error || typeof data !== 'string') {
    return {
      ok: false,
      reason: classifyMessagingError(error?.message),
    };
  }

  return {
    ok: true,
    conversationId: data,
  };
}

export async function findConversationIdForListing(
  listingId: string,
  userId: string
): Promise<ConversationIdResult> {
  await connection();

  const safeListingId = listingId.trim();
  const safeUserId = userId.trim();

  if (!safeListingId || !safeUserId) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('listing_id', safeListingId)
    .or(`buyer_id.eq.${safeUserId},seller_id.eq.${safeUserId}`)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  if (!data || typeof data.id !== 'string') {
    return { ok: false, reason: 'not-found' };
  }

  return {
    ok: true,
    conversationId: data.id,
  };
}

export async function listCurrentUserConversationSummaries(): Promise<ConversationSummariesResult> {
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_conversation_summaries');

  if (error || !isDatabaseConversationSummaryRowArray(data)) {
    await logMessagingDiagnostic({
      operation: 'list_conversation_summaries',
      error: error || {
        code: 'mapping_failed',
        message: 'Conversation summary RPC returned an unexpected row shape.',
      },
      userResolved: await hasResolvedUserForDiagnostic(supabase),
    });

    return {
      ok: false,
      reason: classifyMessagingError(error?.message),
    };
  }

  return {
    ok: true,
    conversations: data.map(databaseConversationSummaryRowToApp),
  };
}

export async function countCurrentUserUnreadConversations(): Promise<UnreadConversationCountResult> {
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('count_unread_conversations');

  if (error || typeof data !== 'number') {
    await logMessagingDiagnostic({
      operation: 'count_unread_conversations',
      error: error || {
        code: 'mapping_failed',
        message: 'Unread conversation count RPC returned an unexpected value.',
      },
      userResolved: await hasResolvedUserForDiagnostic(supabase),
    });

    return {
      ok: false,
      reason: classifyMessagingError(error?.message),
    };
  }

  return {
    ok: true,
    count: data,
  };
}

export async function getCurrentUserConversationThread(
  conversationId: string
): Promise<ConversationThreadResult> {
  await connection();

  const safeConversationId = conversationId.trim();

  if (!safeConversationId) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = await createClient();
  const { data: conversationData, error: conversationError } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT_COLUMNS)
    .eq('id', safeConversationId)
    .maybeSingle();

  if (conversationError) {
    return {
      ok: false,
      reason: classifyMessagingError(conversationError.message),
    };
  }

  if (!conversationData) {
    return { ok: false, reason: 'not-found' };
  }

  if (!isDatabaseConversationRow(conversationData)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const { data: counterpartData, error: counterpartError } = await supabase.rpc(
    'get_conversation_public_counterpart',
    {
      p_conversation_id: safeConversationId,
    }
  );

  const counterpartRows = Array.isArray(counterpartData) ? counterpartData : [];
  const counterpartRow = counterpartRows[0];

  if (
    counterpartError ||
    !isConversationPublicCounterpartRow(counterpartRow)
  ) {
    return {
      ok: false,
      reason: classifyMessagingError(counterpartError?.message),
    };
  }

  const { data: messageData, error: messageError } = await supabase.rpc(
    'get_conversation_messages',
    {
      p_conversation_id: safeConversationId,
    }
  );

  if (messageError || !isDatabaseMessageRowArray(messageData)) {
    return {
      ok: false,
      reason: classifyMessagingError(messageError?.message),
    };
  }

  const { data: attachmentData, error: attachmentError } = await supabase.rpc(
    'get_message_attachments',
    {
      p_conversation_id: safeConversationId,
    }
  );

  if (
    attachmentError ||
    !isDatabaseMessageAttachmentRowArray(attachmentData)
  ) {
    return {
      ok: false,
      reason: classifyMessagingError(attachmentError?.message),
    };
  }

  const attachments = await messageAttachmentRowsToAppWithSignedUrls(
    supabase,
    attachmentData
  );

  const { data: readMarkerData, error: readMarkerError } = await supabase
    .from('conversation_reads')
    .select(CONVERSATION_READ_SELECT_COLUMNS)
    .eq('conversation_id', safeConversationId);

  if (readMarkerError || !isDatabaseConversationReadRowArray(readMarkerData)) {
    return {
      ok: false,
      reason: classifyMessagingError(readMarkerError?.message),
    };
  }

  return {
    ok: true,
    conversation: databaseConversationRowToApp(conversationData),
    counterpart: conversationPublicCounterpartRowToApp(counterpartRow),
    messages: messageData.map(databaseMessageRowToApp),
    attachments,
    readMarkers: readMarkerData.map(databaseConversationReadRowToApp),
  };
}

export async function getCurrentUserConversationMessageSnapshot({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}): Promise<ConversationMessageSnapshotResult> {
  await connection();

  const safeConversationId = conversationId.trim();
  const safeMessageId = messageId.trim();

  if (!safeConversationId || !safeMessageId) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = await createClient();
  const { data: messageData, error: messageError } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT_COLUMNS)
    .eq('conversation_id', safeConversationId)
    .eq('id', safeMessageId)
    .maybeSingle();

  if (messageError) {
    return {
      ok: false,
      reason: classifyMessagingError(messageError.message),
    };
  }

  if (!messageData) {
    return { ok: false, reason: 'not-found' };
  }

  if (!isDatabaseMessageRow(messageData)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const { data: attachmentData, error: attachmentError } = await supabase
    .from('message_attachments')
    .select(MESSAGE_ATTACHMENT_SELECT_COLUMNS)
    .eq('message_id', safeMessageId);

  if (
    attachmentError ||
    !isDatabaseMessageAttachmentRowArray(attachmentData)
  ) {
    return {
      ok: false,
      reason: classifyMessagingError(attachmentError?.message),
    };
  }

  const attachments = await messageAttachmentRowsToAppWithSignedUrls(
    supabase,
    attachmentData
  );

  return {
    ok: true,
    message: databaseMessageRowToApp(messageData),
    attachments,
  };
}

export async function markConversationRead(
  conversationId: string
): Promise<MarkConversationReadResult> {
  await connection();

  const safeConversationId = conversationId.trim();

  if (!safeConversationId) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: safeConversationId,
  });

  if (error) {
    await logMessagingDiagnostic({
      operation: 'mark_conversation_read',
      error,
      userResolved: await hasResolvedUserForDiagnostic(supabase),
    });

    return {
      ok: false,
      reason: classifyMessagingError(error.message),
    };
  }

  return { ok: true };
}

export async function sendConversationMessage(
  conversationId: string,
  body: string,
  clientAttemptId: string
): Promise<SendMessageResult> {
  await connection();

  const safeConversationId = conversationId.trim();
  const safeBody = normalizeMessageBody(body);
  const safeClientAttemptId = clientAttemptId.trim();
  const validationError = validateMessageBody(safeBody);

  if (!safeConversationId) {
    return { ok: false, reason: 'not-found' };
  }

  if (validationError) {
    return { ok: false, reason: validationError };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('send_conversation_message', {
    p_conversation_id: safeConversationId,
    p_body: safeBody,
    p_client_attempt_id: safeClientAttemptId || null,
  });

  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 1 ||
    !isDatabaseMessageRow(data[0])
  ) {
    await logMessagingDiagnostic({
      operation: 'send_conversation_message',
      error: error || {
        code: 'mapping_failed',
        message: 'Send message RPC returned an unexpected row shape.',
      },
      userResolved: await hasResolvedUserForDiagnostic(supabase),
    });

    return {
      ok: false,
      reason: classifyMessagingError(error?.message),
    };
  }

  return {
    ok: true,
    message: databaseMessageRowToApp(data[0]),
  };
}

export async function sendConversationMessageWithAttachments(input: {
  conversationId: string;
  body: string;
  clientAttemptId: string;
  attachments: MessageAttachmentMetadataInput[];
}): Promise<SendMessageResult> {
  await connection();

  const safeConversationId = input.conversationId.trim();
  const safeBody = normalizeMessageBody(input.body);
  const safeClientAttemptId = input.clientAttemptId.trim();
  const safeAttachments = input.attachments.map((attachment) => ({
    storage_path: attachment.storagePath.trim(),
    content_type: attachment.contentType,
  }));

  if (!safeConversationId) {
    return { ok: false, reason: 'not-found' };
  }

  if (!safeClientAttemptId || safeAttachments.length === 0) {
    return { ok: false, reason: 'invalid-attachment' };
  }

  if (safeAttachments.length > 4) {
    return { ok: false, reason: 'too-many-attachments' };
  }

  if (safeBody.length > MESSAGE_BODY_MAX_LENGTH) {
    return { ok: false, reason: 'message-too-long' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    'send_conversation_message_with_attachments',
    {
      p_conversation_id: safeConversationId,
      p_body: safeBody,
      p_client_attempt_id: safeClientAttemptId,
      p_attachments: safeAttachments,
    }
  );

  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 1 ||
    !isDatabaseMessageRow(data[0])
  ) {
    await logMessagingDiagnostic({
      operation: 'send_conversation_message_with_attachments',
      error: error || {
        code: 'mapping_failed',
        message: 'Send attachment message RPC returned an unexpected row shape.',
      },
      userResolved: await hasResolvedUserForDiagnostic(supabase),
    });

    return {
      ok: false,
      reason: classifyMessagingError(error?.message),
    };
  }

  return {
    ok: true,
    message: databaseMessageRowToApp(data[0]),
  };
}

export async function editConversationMessage(
  messageId: string,
  body: string
): Promise<MessageMutationResult> {
  await connection();

  const safeMessageId = messageId.trim();
  const safeBody = normalizeMessageBody(body);

  if (!safeMessageId) {
    return { ok: false, reason: 'not-found' };
  }

  if (safeBody.length > MESSAGE_BODY_MAX_LENGTH) {
    return { ok: false, reason: 'message-too-long' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('edit_conversation_message', {
    p_message_id: safeMessageId,
    p_body: safeBody,
  });

  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 1 ||
    !isDatabaseMessageRow(data[0])
  ) {
    await logMessagingDiagnostic({
      operation: 'edit_conversation_message',
      error: error || {
        code: 'mapping_failed',
        message: 'Edit message RPC returned an unexpected row shape.',
      },
      userResolved: await hasResolvedUserForDiagnostic(supabase),
    });

    return {
      ok: false,
      reason: classifyMessagingError(error?.message),
    };
  }

  return {
    ok: true,
    message: databaseMessageRowToApp(data[0]),
  };
}

export async function deleteConversationMessage(
  messageId: string
): Promise<MessageMutationResult> {
  await connection();

  const safeMessageId = messageId.trim();

  if (!safeMessageId) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    'delete_conversation_message_with_attachments',
    {
      p_message_id: safeMessageId,
    }
  );

  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 1 ||
    !isDeletedMessageWithAttachmentsRow(data[0])
  ) {
    await logMessagingDiagnostic({
      operation: 'delete_conversation_message_with_attachments',
      error: error || {
        code: 'mapping_failed',
        message:
          'Delete message with attachments RPC returned an unexpected row shape.',
      },
      userResolved: await hasResolvedUserForDiagnostic(supabase),
    });

    return {
      ok: false,
      reason: classifyMessagingError(error?.message),
    };
  }

  if (data[0].attachment_paths.length > 0) {
    await removeMessageAttachmentFiles(supabase, data[0].attachment_paths);
  }

  return {
    ok: true,
    message: deletedMessageWithAttachmentsRowToApp(data[0]),
  };
}

export async function hideConversationForCurrentUser(
  conversationId: string
): Promise<HideConversationResult> {
  await connection();

  const safeConversationId = conversationId.trim();

  if (!safeConversationId) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('hide_conversation_for_current_user', {
    p_conversation_id: safeConversationId,
  });

  if (error) {
    await logMessagingDiagnostic({
      operation: 'hide_conversation_for_current_user',
      error,
      userResolved: await hasResolvedUserForDiagnostic(supabase),
    });

    return {
      ok: false,
      reason: classifyMessagingError(error.message),
    };
  }

  return { ok: true };
}
