'use client';

import type { ListingPhotoFormItem } from '@/lib/listingPhotoForm';
import { createClient } from '@/lib/supabase/client';
import {
  createListingImageStoragePath,
  removeListingImageFiles,
  uploadListingImageFile,
  type ListingImageMetadataInput,
} from '@/lib/supabase/listingImages';

export type ListingPhotoUploadResult =
  | {
      ok: true;
      images: ListingImageMetadataInput[];
      uploadedStoragePaths: string[];
    }
  | {
      ok: false;
      uploadedStoragePaths: string[];
    };

const LISTING_IMAGE_MAX_DIMENSION = 1800;
const LISTING_IMAGE_WEBP_QUALITY = 0.84;
const LISTING_IMAGE_OPTIMIZE_THRESHOLD_BYTES = 768 * 1024;

function getOptimizedListingImageName(
  fileName: string,
  extension: 'png' | 'webp'
): string {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim() || 'listing-photo';

  return `${baseName}.${extension}`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/webp',
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function optimizeListingImageFile(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') {
    return file;
  }

  let imageBitmap: ImageBitmap | null = null;

  try {
    imageBitmap = await createImageBitmap(file);

    const largestDimension = Math.max(imageBitmap.width, imageBitmap.height);
    const shouldResize = largestDimension > LISTING_IMAGE_MAX_DIMENSION;
    const shouldCompress = file.size > LISTING_IMAGE_OPTIMIZE_THRESHOLD_BYTES;

    if (!shouldResize && (!shouldCompress || file.type === 'image/png')) {
      return file;
    }

    const scale = Math.min(1, LISTING_IMAGE_MAX_DIMENSION / largestDimension);
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

    const outputType = file.type === 'image/png' ? 'image/png' : 'image/webp';
    const optimizedBlob = await canvasToBlob(
      canvas,
      outputType,
      outputType === 'image/webp' ? LISTING_IMAGE_WEBP_QUALITY : undefined
    );

    if (!optimizedBlob || optimizedBlob.size >= file.size) {
      return file;
    }

    return new File(
      [optimizedBlob],
      getOptimizedListingImageName(
        file.name,
        outputType === 'image/png' ? 'png' : 'webp'
      ),
      {
        type: outputType,
        lastModified: file.lastModified,
      }
    );
  } catch {
    return file;
  } finally {
    imageBitmap?.close();
  }
}

export async function prepareListingPhotoMetadata(
  ownerId: string,
  listingId: string,
  photos: ListingPhotoFormItem[]
): Promise<ListingPhotoUploadResult> {
  const safeOwnerId = ownerId.trim();
  const safeListingId = listingId.trim();
  const supabase = createClient();
  const images: ListingImageMetadataInput[] = [];
  const uploadedStoragePaths: string[] = [];

  if (!safeOwnerId || !safeListingId || photos.length > 8) {
    return { ok: false, uploadedStoragePaths };
  }

  for (const [index, photo] of photos.entries()) {
    if (photo.kind === 'existing') {
      images.push({
        storagePath: photo.storagePath,
        position: index,
      });
      continue;
    }

    const uploadFile = await optimizeListingImageFile(photo.file);
    const storagePath = createListingImageStoragePath(
      safeListingId,
      uploadFile
    );

    if (!storagePath) {
      await removeListingImageFiles(supabase, uploadedStoragePaths);
      return { ok: false, uploadedStoragePaths };
    }

    const uploadSucceeded = await uploadListingImageFile(
      supabase,
      storagePath,
      uploadFile
    );

    if (!uploadSucceeded) {
      await removeListingImageFiles(supabase, uploadedStoragePaths);
      return { ok: false, uploadedStoragePaths };
    }

    uploadedStoragePaths.push(storagePath);
    images.push({
      storagePath,
      position: index,
    });
  }

  return {
    ok: true,
    images,
    uploadedStoragePaths,
  };
}

export async function cleanupUploadedListingPhotos(
  storagePaths: string[]
): Promise<void> {
  const supabase = createClient();

  await removeListingImageFiles(supabase, storagePaths);
}
