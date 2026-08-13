'use client';

import {
  MAX_MESSAGE_ATTACHMENTS,
  type MessageAttachmentMimeType,
} from '@/lib/messagingTypes';
import { createClient } from '@/lib/supabase/client';
import {
  createMessageAttachmentStoragePath,
  isValidMessageAttachmentFile,
  removeMessageAttachmentFiles,
  uploadMessageAttachmentFile,
  type MessageAttachmentMetadataInput,
} from '@/lib/supabase/messageAttachments';

export type MessageAttachmentUploadResult =
  | {
      ok: true;
      attachments: MessageAttachmentMetadataInput[];
      uploadedStoragePaths: string[];
    }
  | {
      ok: false;
      uploadedStoragePaths: string[];
    };

export async function prepareMessageAttachmentMetadata(input: {
  conversationId: string;
  clientAttemptId: string;
  files: File[];
}): Promise<MessageAttachmentUploadResult> {
  const safeConversationId = input.conversationId.trim();
  const safeClientAttemptId = input.clientAttemptId.trim();
  const supabase = createClient();
  const attachments: MessageAttachmentMetadataInput[] = [];
  const uploadedStoragePaths: string[] = [];

  if (
    !safeConversationId ||
    !safeClientAttemptId ||
    input.files.length === 0 ||
    input.files.length > MAX_MESSAGE_ATTACHMENTS
  ) {
    return { ok: false, uploadedStoragePaths };
  }

  for (const file of input.files) {
    if (!isValidMessageAttachmentFile(file)) {
      await removeMessageAttachmentFiles(supabase, uploadedStoragePaths);
      return { ok: false, uploadedStoragePaths };
    }

    const storagePath = createMessageAttachmentStoragePath({
      conversationId: safeConversationId,
      clientAttemptId: safeClientAttemptId,
      file,
    });

    if (!storagePath) {
      await removeMessageAttachmentFiles(supabase, uploadedStoragePaths);
      return { ok: false, uploadedStoragePaths };
    }

    const uploadSucceeded = await uploadMessageAttachmentFile(
      supabase,
      storagePath,
      file
    );

    if (!uploadSucceeded) {
      await removeMessageAttachmentFiles(supabase, uploadedStoragePaths);
      return { ok: false, uploadedStoragePaths };
    }

    uploadedStoragePaths.push(storagePath);
    attachments.push({
      storagePath,
      contentType: file.type as MessageAttachmentMimeType,
    });
  }

  return {
    ok: true,
    attachments,
    uploadedStoragePaths,
  };
}

export async function cleanupUploadedMessageAttachments(
  storagePaths: string[]
): Promise<void> {
  const supabase = createClient();

  await removeMessageAttachmentFiles(supabase, storagePaths);
}
