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

const MESSAGE_IMAGE_MAX_DIMENSION = 1600;
const MESSAGE_IMAGE_WEBP_QUALITY = 0.82;
const MESSAGE_IMAGE_OPTIMIZE_THRESHOLD_BYTES = 768 * 1024;

function getOptimizedMessageImageName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim() || 'message-photo';

  return `${baseName}.webp`;
}

function canvasToWebpBlob(
  canvas: HTMLCanvasElement
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', MESSAGE_IMAGE_WEBP_QUALITY);
  });
}

async function optimizeMessageAttachmentFile(file: File): Promise<File> {
  if (
    file.size <= MESSAGE_IMAGE_OPTIMIZE_THRESHOLD_BYTES ||
    typeof createImageBitmap !== 'function'
  ) {
    return file;
  }

  let imageBitmap: ImageBitmap | null = null;

  try {
    imageBitmap = await createImageBitmap(file);
    const largestDimension = Math.max(imageBitmap.width, imageBitmap.height);
    const scale = Math.min(1, MESSAGE_IMAGE_MAX_DIMENSION / largestDimension);
    const outputWidth = Math.max(1, Math.round(imageBitmap.width * scale));
    const outputHeight = Math.max(1, Math.round(imageBitmap.height * scale));
    const canvas = document.createElement('canvas');

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      return file;
    }

    context.drawImage(imageBitmap, 0, 0, outputWidth, outputHeight);

    const optimizedBlob = await canvasToWebpBlob(canvas);

    if (!optimizedBlob || optimizedBlob.size >= file.size) {
      return file;
    }

    return new File(
      [optimizedBlob],
      getOptimizedMessageImageName(file.name),
      {
        type: 'image/webp',
        lastModified: file.lastModified,
      }
    );
  } catch {
    return file;
  } finally {
    imageBitmap?.close();
  }
}

export async function prepareMessageAttachmentMetadata(input: {
  conversationId: string;
  clientAttemptId: string;
  files: File[];
}): Promise<MessageAttachmentUploadResult> {
  const safeConversationId = input.conversationId.trim();
  const safeClientAttemptId = input.clientAttemptId.trim();
  const supabase = createClient();
  const uploadedStoragePaths: string[] = [];

  if (
    !safeConversationId ||
    !safeClientAttemptId ||
    input.files.length === 0 ||
    input.files.length > MAX_MESSAGE_ATTACHMENTS
  ) {
    return { ok: false, uploadedStoragePaths };
  }

  const preparedUploads: {
    file: File;
    storagePath: string;
    contentType: MessageAttachmentMimeType;
  }[] = [];

  for (const originalFile of input.files) {
    if (!isValidMessageAttachmentFile(originalFile)) {
      return { ok: false, uploadedStoragePaths };
    }

    const file = await optimizeMessageAttachmentFile(originalFile);

    if (!isValidMessageAttachmentFile(file)) {
      return { ok: false, uploadedStoragePaths };
    }

    const storagePath = createMessageAttachmentStoragePath({
      conversationId: safeConversationId,
      clientAttemptId: safeClientAttemptId,
      file,
    });

    if (!storagePath) {
      return { ok: false, uploadedStoragePaths };
    }

    preparedUploads.push({
      file,
      storagePath,
      contentType: file.type as MessageAttachmentMimeType,
    });
  }

  const uploadResults = await Promise.all(
    preparedUploads.map(async (preparedUpload) => ({
      ...preparedUpload,
      succeeded: await uploadMessageAttachmentFile(
        supabase,
        preparedUpload.storagePath,
        preparedUpload.file
      ),
    }))
  );

  for (const uploadResult of uploadResults) {
    if (uploadResult.succeeded) {
      uploadedStoragePaths.push(uploadResult.storagePath);
    }
  }

  if (uploadResults.some((uploadResult) => !uploadResult.succeeded)) {
    await removeMessageAttachmentFiles(supabase, uploadedStoragePaths);
    return { ok: false, uploadedStoragePaths: [] };
  }

  return {
    ok: true,
    attachments: uploadResults.map((uploadResult) => ({
      storagePath: uploadResult.storagePath,
      contentType: uploadResult.contentType,
    })),
    uploadedStoragePaths,
  };
}

export async function cleanupUploadedMessageAttachments(
  storagePaths: string[]
): Promise<void> {
  const supabase = createClient();

  await removeMessageAttachmentFiles(supabase, storagePaths);
}
