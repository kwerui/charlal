'use server';

import { revalidatePath } from 'next/cache';
import type { AppMessage } from '@/lib/messagingTypes';
import { getCurrentUserResult } from '@/lib/auth/server';
import {
  markConversationRead,
  sendConversationMessage,
  startListingConversation,
  type MessagingFailureReason,
} from '@/lib/supabase/messagingServer';

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

export type MarkConversationReadActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: MessagingFailureReason;
    };

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
}): Promise<SendMessageActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const result = await sendConversationMessage(input.conversationId, input.body);

  if (!result.ok) {
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
