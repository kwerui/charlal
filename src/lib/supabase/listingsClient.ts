'use client';

import type { Listing } from '@/data/listings';
import {
  DATABASE_LISTING_SELECT_COLUMNS,
  databaseRowToListing,
  databaseRowsToListings,
  isDatabaseListingRow,
  isDatabaseListingRowArray,
  listingFormValuesToDatabaseInsert,
  listingFormValuesToDatabaseUpdate,
  listingToDatabaseInsert,
} from '@/lib/listingDatabaseTypes';
import type { ValidatedListingFormValues } from '@/lib/listingFormValidation';
import { createClient } from '@/lib/supabase/client';
import {
  attachImageRowsToListings,
  isListingImageRowArray,
  LISTING_IMAGE_SELECT_COLUMNS,
  listListingImageRowsForListingIds,
  removeListingImageFiles,
  type ListingImageMetadataInput,
} from '@/lib/supabase/listingImages';

export type DatabaseListingMutationResult =
  | {
      ok: true;
      listing: Listing;
    }
  | {
      ok: false;
      reason: 'not-found' | 'not-owned' | 'database-unavailable';
    };

export type DatabaseListingListResult =
  | {
      ok: true;
      listings: Listing[];
    }
  | {
      ok: false;
      reason: 'database-unavailable';
    };

export type DatabaseDeleteListingResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: 'not-found' | 'not-owned' | 'database-unavailable';
    };

export type DatabaseListingImageSaveResult =
  | {
      ok: true;
      listing: Listing;
    }
  | {
      ok: false;
      reason: 'not-found' | 'not-owned' | 'database-unavailable';
    };

function isMissingOrDeniedResponse(errorCode: string | undefined): boolean {
  return errorCode === 'PGRST116' || errorCode === '42501';
}

async function attachImagesToListing(
  listing: Listing
): Promise<Listing> {
  const supabase = createClient();
  const imageRows = await listListingImageRowsForListingIds(supabase, [
    String(listing.id),
  ]);

  return attachImageRowsToListings([listing], imageRows)[0] || listing;
}

async function attachImagesToListings(
  listings: Listing[]
): Promise<Listing[]> {
  const supabase = createClient();
  const imageRows = await listListingImageRowsForListingIds(
    supabase,
    listings.map((listing) => String(listing.id))
  );

  return attachImageRowsToListings(listings, imageRows);
}

export async function createDatabaseListingFromFormValues(
  values: ValidatedListingFormValues
): Promise<DatabaseListingMutationResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('listings')
    .insert(listingFormValuesToDatabaseInsert(values))
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .single();

  if (error || !isDatabaseListingRow(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    listing: await attachImagesToListing(databaseRowToListing(data)),
  };
}

export async function createDatabaseListingFromExistingListing(
  listing: Listing
): Promise<DatabaseListingMutationResult> {
  const insertValues = listingToDatabaseInsert(listing);

  if (!insertValues) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('listings')
    .insert(insertValues)
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .single();

  if (error || !isDatabaseListingRow(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    listing: await attachImagesToListing(databaseRowToListing(data)),
  };
}

export async function listOwnedDatabaseListings(
  ownerId: string
): Promise<DatabaseListingListResult> {
  const safeOwnerId = ownerId.trim();

  if (!safeOwnerId) {
    return { ok: true, listings: [] };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .eq('owner_id', safeOwnerId)
    .order('created_at', { ascending: false });

  if (error || !isDatabaseListingRowArray(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    listings: await attachImagesToListings(databaseRowsToListings(data)),
  };
}

export async function findOwnedDatabaseListingById(
  listingId: string,
  ownerId: string
): Promise<DatabaseListingMutationResult> {
  const safeListingId = listingId.trim();
  const safeOwnerId = ownerId.trim();

  if (!safeListingId || !safeOwnerId || /^\d+$/.test(safeListingId)) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .eq('id', safeListingId)
    .eq('owner_id', safeOwnerId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: isMissingOrDeniedResponse(error.code) ? 'not-owned' : 'database-unavailable',
    };
  }

  if (!data) {
    return { ok: false, reason: 'not-owned' };
  }

  if (!isDatabaseListingRow(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    listing: await attachImagesToListing(databaseRowToListing(data)),
  };
}

export async function updateDatabaseListingOwnedBy(
  listingId: string,
  ownerId: string,
  values: ValidatedListingFormValues
): Promise<DatabaseListingMutationResult> {
  const safeListingId = listingId.trim();
  const safeOwnerId = ownerId.trim();

  if (!safeListingId || !safeOwnerId || /^\d+$/.test(safeListingId)) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('listings')
    .update(listingFormValuesToDatabaseUpdate(values))
    .eq('id', safeListingId)
    .eq('owner_id', safeOwnerId)
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: isMissingOrDeniedResponse(error.code) ? 'not-owned' : 'database-unavailable',
    };
  }

  if (!data) {
    return { ok: false, reason: 'not-owned' };
  }

  if (!isDatabaseListingRow(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    listing: await attachImagesToListing(databaseRowToListing(data)),
  };
}

export async function saveDatabaseListingImagesOwnedBy(
  listingId: string,
  ownerId: string,
  images: ListingImageMetadataInput[]
): Promise<DatabaseListingImageSaveResult> {
  const safeListingId = listingId.trim();
  const safeOwnerId = ownerId.trim();
  const normalizedImages = images.map((image, index) => ({
    storagePath: image.storagePath.trim(),
    position: index,
  }));
  const storagePaths = normalizedImages.map((image) => image.storagePath);
  const uniqueStoragePaths = new Set(storagePaths);

  if (
    !safeListingId ||
    !safeOwnerId ||
    /^\d+$/.test(safeListingId) ||
    normalizedImages.length > 8 ||
    storagePaths.some((storagePath) => !storagePath) ||
    uniqueStoragePaths.size !== storagePaths.length
  ) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = createClient();
  const { data: listingData, error: listingError } = await supabase
    .from('listings')
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .eq('id', safeListingId)
    .eq('owner_id', safeOwnerId)
    .maybeSingle();

  if (listingError) {
    return {
      ok: false,
      reason: isMissingOrDeniedResponse(listingError.code)
        ? 'not-owned'
        : 'database-unavailable',
    };
  }

  if (!listingData) {
    return { ok: false, reason: 'not-owned' };
  }

  if (!isDatabaseListingRow(listingData)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const { data: existingRows, error: existingRowsError } = await supabase
    .from('listing_images')
    .select('id, listing_id, storage_path, position, created_at')
    .eq('listing_id', safeListingId);

  if (existingRowsError || !isListingImageRowArray(existingRows)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const nextPathSet = new Set(storagePaths);
  const existingPathSet = new Set(existingRows.map((row) => row.storage_path));
  const removedStoragePaths = existingRows
    .map((row) => row.storage_path)
    .filter((storagePath) => !nextPathSet.has(storagePath));
  const newRows = normalizedImages
    .filter((image) => !existingPathSet.has(image.storagePath))
    .map((image) => ({
      listing_id: safeListingId,
      storage_path: image.storagePath,
      position: image.position,
    }));

  if (newRows.length > 0) {
    const { error } = await supabase.from('listing_images').insert(newRows);

    if (error) {
      return { ok: false, reason: 'database-unavailable' };
    }
  }

  for (const image of normalizedImages) {
    if (!existingPathSet.has(image.storagePath)) {
      continue;
    }

    const { error } = await supabase
      .from('listing_images')
      .update({ position: image.position })
      .eq('listing_id', safeListingId)
      .eq('storage_path', image.storagePath);

    if (error) {
      return { ok: false, reason: 'database-unavailable' };
    }
  }

  if (removedStoragePaths.length > 0) {
    const { error } = await supabase
      .from('listing_images')
      .delete()
      .eq('listing_id', safeListingId)
      .in('storage_path', removedStoragePaths);

    if (error) {
      return { ok: false, reason: 'database-unavailable' };
    }
  }

  const cleanupSucceeded = await removeListingImageFiles(
    supabase,
    removedStoragePaths
  );

  if (!cleanupSucceeded) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    listing: await attachImagesToListing(databaseRowToListing(listingData)),
  };
}

export async function deleteDatabaseListingOwnedBy(
  listingId: string,
  ownerId: string
): Promise<DatabaseDeleteListingResult> {
  const safeListingId = listingId.trim();
  const safeOwnerId = ownerId.trim();

  if (!safeListingId || !safeOwnerId || /^\d+$/.test(safeListingId)) {
    return { ok: false, reason: 'not-found' };
  }

  const supabase = createClient();
  const { data: imageRowsData, error: imageRowsError } = await supabase
    .from('listing_images')
    .select(LISTING_IMAGE_SELECT_COLUMNS)
    .eq('listing_id', safeListingId);

  if (imageRowsError || !isListingImageRowArray(imageRowsData)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const imageRows = imageRowsData;

  if (imageRows.length > 0) {
    const cleanupSucceeded = await removeListingImageFiles(
      supabase,
      imageRows.map((row) => row.storage_path)
    );

    if (!cleanupSucceeded) {
      return { ok: false, reason: 'database-unavailable' };
    }
  }

  const { data, error } = await supabase
    .from('listings')
    .delete()
    .eq('id', safeListingId)
    .eq('owner_id', safeOwnerId)
    .select('id')
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: isMissingOrDeniedResponse(error.code) ? 'not-owned' : 'database-unavailable',
    };
  }

  if (!data) {
    return { ok: false, reason: 'not-owned' };
  }

  return { ok: true };
}
