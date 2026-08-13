import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MESSAGE_ATTACHMENT_MIME_TYPES,
  type AppMessageAttachment,
  type DatabaseMessageAttachmentRow,
  type MessageAttachmentMimeType,
} from '@/lib/messagingTypes';

export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';
export const MESSAGE_ATTACHMENT_SIGNED_URL_SECONDS = 10 * 60;

const MESSAGE_ATTACHMENT_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;

type MessageAttachmentStorageClient = Pick<SupabaseClient, 'storage'>;

export type MessageAttachmentMetadataInput = {
  storagePath: string;
  contentType: MessageAttachmentMimeType;
};

export function isMessageAttachmentPath(value: unknown): value is string {
  return typeof value === 'string' && MESSAGE_ATTACHMENT_PATH_PATTERN.test(value);
}

export function getMessageAttachmentExtension(
  file: File
): 'jpg' | 'png' | 'webp' | null {
  if (file.type === 'image/jpeg') {
    return 'jpg';
  }

  if (file.type === 'image/png') {
    return 'png';
  }

  if (file.type === 'image/webp') {
    return 'webp';
  }

  return null;
}

export function isValidMessageAttachmentFile(file: File): boolean {
  return (
    MESSAGE_ATTACHMENT_MIME_TYPES.includes(
      file.type as MessageAttachmentMimeType
    ) && file.size <= MAX_MESSAGE_ATTACHMENT_BYTES
  );
}

export function createMessageAttachmentStoragePath(input: {
  conversationId: string;
  clientAttemptId: string;
  file: File;
}): string | null {
  const safeConversationId = input.conversationId.trim();
  const safeClientAttemptId = input.clientAttemptId.trim();
  const extension = getMessageAttachmentExtension(input.file);

  if (!safeConversationId || !safeClientAttemptId || !extension) {
    return null;
  }

  const storagePath = `${safeConversationId}/${safeClientAttemptId}/${crypto.randomUUID()}.${extension}`;

  return isMessageAttachmentPath(storagePath) ? storagePath : null;
}

export async function uploadMessageAttachmentFile(
  supabase: MessageAttachmentStorageClient,
  storagePath: string,
  file: File
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '300',
      contentType: file.type,
      upsert: false,
    });

  return !error;
}

export async function removeMessageAttachmentFiles(
  supabase: MessageAttachmentStorageClient,
  storagePaths: string[]
): Promise<boolean> {
  const safeStoragePaths = storagePaths
    .map((path) => path.trim())
    .filter(isMessageAttachmentPath);

  if (safeStoragePaths.length === 0) {
    return true;
  }

  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .remove(safeStoragePaths);

  return !error;
}

export async function createMessageAttachmentSignedUrl(
  supabase: MessageAttachmentStorageClient,
  storagePath: string
): Promise<string | null> {
  if (!isMessageAttachmentPath(storagePath)) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, MESSAGE_ATTACHMENT_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function messageAttachmentRowToAppWithSignedUrl(
  supabase: MessageAttachmentStorageClient,
  row: DatabaseMessageAttachmentRow
): Promise<AppMessageAttachment | null> {
  const url = await createMessageAttachmentSignedUrl(
    supabase,
    row.storage_path
  );

  if (!url) {
    return null;
  }

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
