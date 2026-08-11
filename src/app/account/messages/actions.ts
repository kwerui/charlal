'use server';

import { revalidatePath } from 'next/cache';
import type {
  AppConversationRead,
  AppConversationSummary,
  AppMessage,
} from '@/lib/messagingTypes';
import { getCurrentUserResult } from '@/lib/auth/server';
import {
  deleteConversationMessage,
  editConversationMessage,
  getCurrentUserConversationThread,
  hideConversationForCurrentUser,
  listCurrentUserConversationSummaries,
  markConversationRead,
  sendConversationMessage,
  startListingConversation,
  type MessagingFailureReason,
} from '@/lib/supabase/messagingServer';
import type { CurrentUserResult } from '@/lib/auth/server';

export type StartConversationActionResult =
  | {
      ok: true;
      conversationId: string;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type SendMessageActionResult =
  | {
      ok: true;
      message: AppMessage;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type MessageMutationActionResult = SendMessageActionResult;

export type MarkConversationReadActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type MessagingSnapshotActionResult =
  | {
      ok: true;
      unreadConversationCount: number;
      conversations: AppConversationSummary[];
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

export type ConversationThreadSnapshotActionResult =
  | {
      ok: true;
      messages: AppMessage[];
      readMarkers: AppConversationRead[];
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

type MessagingActionStage =
  | 'invalid_input'
  | 'no_authenticated_user'
  | 'rpc_error'
  | 'success';

function logMessagingActionDiagnostic(input: {
  operation: string;
  stage: MessagingActionStage;
  code?: string;
  message?: string;
  authResult?: CurrentUserResult;
}): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.warn(`[Messaging] ${input.operation} ${input.stage}`, {
    stage: input.stage,
    code: input.code || 'none',
    message: (input.message || 'none').replace(/[\r\n\t]+/g, ' ').slice(0, 180),
    userResolved: input.authResult?.status === 'authenticated',
  });
}

export async function startConversationAction(input: {
  listingId: string;
  body: string;
}): Promise<StartConversationActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const result = await startListingConversation(input.listingId, input.body);

  if (!result.ok) {
    return result;
  }

  revalidatePath('/account/messages');
  revalidatePath(`/account/messages/${result.conversationId}`);

  return result;
}

export async function sendMessageAction(input: {
  conversationId: string;
  body: string;
  clientAttemptId: string;
}): Promise<SendMessageActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    logMessagingActionDiagnostic({
      operation: 'sendMessageAction',
      stage: 'no_authenticated_user',
      code: authResult.status,
      message: 'Server action did not resolve an authenticated user.',
      authResult,
    });
    return { ok: false, reason: 'unauthenticated' };
  }

  if (!input.conversationId || !input.body || !input.clientAttemptId) {
    logMessagingActionDiagnostic({
      operation: 'sendMessageAction',
      stage: 'invalid_input',
      code: 'missing_required_field',
      message: 'Message action input is missing a required field.',
      authResult,
    });
  }

  const result = await sendConversationMessage(
    input.conversationId,
    input.body,
    input.clientAttemptId
  );

  if (!result.ok) {
    logMessagingActionDiagnostic({
      operation: 'sendMessageAction',
      stage: 'rpc_error',
      code: result.reason,
      message: 'sendConversationMessage returned a failure result.',
      authResult,
    });
    return result;
  }

  revalidatePath('/account/messages');
  revalidatePath(`/account/messages/${input.conversationId}`);

  return result;
}

export async function editMessageAction(input: {
  conversationId: string;
  messageId: string;
  body: string;
}): Promise<MessageMutationActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    logMessagingActionDiagnostic({
      operation: 'editMessageAction',
      stage: 'no_authenticated_user',
      code: authResult.status,
      message: 'Server action did not resolve an authenticated user.',
      authResult,
    });
    return { ok: false, reason: 'unauthenticated' };
  }

  if (!input.conversationId || !input.messageId || !input.body) {
    logMessagingActionDiagnostic({
      operation: 'editMessageAction',
      stage: 'invalid_input',
      code: 'missing_required_field',
      message: 'Edit action input is missing a required field.',
      authResult,
    });
  }

  const result = await editConversationMessage(input.messageId, input.body);

  if (!result.ok) {
    logMessagingActionDiagnostic({
      operation: 'editMessageAction',
      stage: 'rpc_error',
      code: result.reason,
      message: 'editConversationMessage returned a failure result.',
      authResult,
    });
    return result;
  }

  revalidatePath('/account/messages');
  revalidatePath(`/account/messages/${input.conversationId}`);

  return result;
}

export async function deleteMessageAction(input: {
  conversationId: string;
  messageId: string;
}): Promise<MessageMutationActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    logMessagingActionDiagnostic({
      operation: 'deleteMessageAction',
      stage: 'no_authenticated_user',
      code: authResult.status,
      message: 'Server action did not resolve an authenticated user.',
      authResult,
    });
    return { ok: false, reason: 'unauthenticated' };
  }

  if (!input.conversationId || !input.messageId) {
    logMessagingActionDiagnostic({
      operation: 'deleteMessageAction',
      stage: 'invalid_input',
      code: 'missing_required_field',
      message: 'Delete action input is missing a required field.',
      authResult,
    });
  }

  const result = await deleteConversationMessage(input.messageId);

  if (!result.ok) {
    logMessagingActionDiagnostic({
      operation: 'deleteMessageAction',
      stage: 'rpc_error',
      code: result.reason,
      message: 'deleteConversationMessage returned a failure result.',
      authResult,
    });
    return result;
  }

  revalidatePath('/account/messages');
  revalidatePath(`/account/messages/${input.conversationId}`);

  return result;
}

export async function markConversationReadAction(
  conversationId: string
): Promise<MarkConversationReadActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const result = await markConversationRead(conversationId);

  if (!result.ok) {
    return result;
  }

  revalidatePath('/account/messages');
  revalidatePath(`/account/messages/${conversationId}`);

  return result;
}

export async function hideConversationAction(
  conversationId: string
): Promise<MarkConversationReadActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const result = await hideConversationForCurrentUser(conversationId);

  if (!result.ok) {
    return result;
  }

  revalidatePath('/account/messages');
  revalidatePath(`/account/messages/${conversationId}`);

  return result;
}

export async function getMessagingSnapshotAction(): Promise<MessagingSnapshotActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const conversationsResult = await listCurrentUserConversationSummaries();

  if (!conversationsResult.ok) {
    return conversationsResult;
  }

  return {
    ok: true,
    conversations: conversationsResult.conversations,
    unreadConversationCount: conversationsResult.conversations.filter(
      (conversation) => conversation.unreadCount > 0
    ).length,
  };
}

export async function getConversationThreadSnapshotAction(
  conversationId: string
): Promise<ConversationThreadSnapshotActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const threadResult = await getCurrentUserConversationThread(conversationId);

  if (!threadResult.ok) {
    return threadResult;
  }

  return {
    ok: true,
    messages: threadResult.messages,
    readMarkers: threadResult.readMarkers,
  };
}
