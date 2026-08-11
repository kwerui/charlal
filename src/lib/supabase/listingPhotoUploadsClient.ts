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

    const storagePath = createListingImageStoragePath(
      safeListingId,
      photo.file
    );

    if (!storagePath) {
      await removeListingImageFiles(supabase, uploadedStoragePaths);
      return { ok: false, uploadedStoragePaths };
    }

    const uploadSucceeded = await uploadListingImageFile(
      supabase,
      storagePath,
      photo.file
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
