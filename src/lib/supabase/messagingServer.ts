import { connection } from 'next/server';
import {
  CONVERSATION_SELECT_COLUMNS,
  CONVERSATION_READ_SELECT_COLUMNS,
  MESSAGE_SELECT_COLUMNS,
  MESSAGE_BODY_MAX_LENGTH,
  databaseConversationReadRowToApp,
  databaseConversationRowToApp,
  databaseConversationSummaryRowToApp,
  databaseMessageRowToApp,
  isDatabaseConversationReadRowArray,
  isDatabaseConversationRow,
  isDatabaseConversationSummaryRowArray,
  isDatabaseMessageRow,
  isDatabaseMessageRowArray,
  type AppConversationRead,
  type AppConversation,
  type AppConversationSummary,
  type AppMessage,
} from '@/lib/messagingTypes';
import { createClient } from '@/lib/supabase/server';

export type MessagingFailureReason =
  | 'unauthenticated'
  | 'not-found'
  | 'not-participant'
  | 'self-message'
  | 'empty-message'
  | 'message-too-long'
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
      messages: AppMessage[];
      readMarkers: AppConversationRead[];
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

export type MarkConversationReadResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

function normalizeMessageBody(body: string): string {
  return body.trim();
}

type SafePostgrestError = {
  code?: string;
  message?: string;
};

function sanitizeDiagnosticMessage(message: string | undefined): string {
  return (message || 'Unknown messaging error')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240);
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

  const { data: messageData, error: messageError } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT_COLUMNS)
    .eq('conversation_id', safeConversationId)
    .order('created_at', { ascending: true });

  if (messageError || !isDatabaseMessageRowArray(messageData)) {
    return {
      ok: false,
      reason: classifyMessagingError(messageError?.message),
    };
  }

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
    messages: messageData.map(databaseMessageRowToApp),
    readMarkers: readMarkerData.map(databaseConversationReadRowToApp),
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
