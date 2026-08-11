import type { SupabaseClient } from '@supabase/supabase-js';
import type { Listing, ListingImage } from '@/data/listings';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

export const LISTING_IMAGES_BUCKET = 'listing-images';
export const MAX_LISTING_IMAGES = 8;
export const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
export const LISTING_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export const LISTING_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ListingImageMimeType = (typeof LISTING_IMAGE_MIME_TYPES)[number];

export type ListingImageRow = {
  id: string;
  listing_id: string;
  storage_path: string;
  position: number;
  created_at: string;
};

export type ListingImageMetadataInput = {
  storagePath: string;
  position: number;
};

type ListingImageQueryClient = Pick<
  SupabaseClient,
  'from' | 'storage'
>;

export const LISTING_IMAGE_SELECT_COLUMNS =
  'id, listing_id, storage_path, position, created_at';

export function isListingImageRow(value: unknown): value is ListingImageRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof ListingImageRow, unknown>>;

  return (
    typeof row.id === 'string' &&
    typeof row.listing_id === 'string' &&
    typeof row.storage_path === 'string' &&
    typeof row.position === 'number' &&
    typeof row.created_at === 'string'
  );
}

export function isListingImageRowArray(value: unknown): value is ListingImageRow[] {
  return Array.isArray(value) && value.every(isListingImageRow);
}

export function getListingImagePublicUrl(storagePath: string): string {
  const { supabaseUrl } = getSupabasePublicEnv();
  const encodedPath = storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${supabaseUrl}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${encodedPath}`;
}

export function listingImageRowToImage(row: ListingImageRow): ListingImage {
  return {
    id: row.id,
    url: getListingImagePublicUrl(row.storage_path),
    position: row.position,
    storagePath: row.storage_path,
  };
}

export function listingImageRowsToImages(
  rows: ListingImageRow[]
): ListingImage[] {
  return [...rows]
    .sort((first, second) => {
      if (first.position !== second.position) {
        return first.position - second.position;
      }

      return first.created_at.localeCompare(second.created_at);
    })
    .map(listingImageRowToImage);
}

export function attachImageRowsToListings(
  listings: Listing[],
  imageRows: ListingImageRow[]
): Listing[] {
  const rowsByListingId = new Map<string, ListingImageRow[]>();

  for (const row of imageRows) {
    const existingRows = rowsByListingId.get(row.listing_id) || [];

    existingRows.push(row);
    rowsByListingId.set(row.listing_id, existingRows);
  }

  return listings.map((listing) => {
    const rows = rowsByListingId.get(String(listing.id)) || [];

    if (rows.length === 0) {
      return listing;
    }

    return {
      ...listing,
      images: listingImageRowsToImages(rows),
    };
  });
}

export async function listListingImageRowsForListingIds(
  supabase: ListingImageQueryClient,
  listingIds: string[]
): Promise<ListingImageRow[]> {
  const safeListingIds = Array.from(
    new Set(listingIds.map((id) => id.trim()).filter(Boolean))
  );

  if (safeListingIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('listing_images')
    .select(LISTING_IMAGE_SELECT_COLUMNS)
    .in('listing_id', safeListingIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !isListingImageRowArray(data)) {
    return [];
  }

  return data;
}

export function getListingImageExtension(file: File): 'jpg' | 'png' | 'webp' | null {
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

export function createListingImageStoragePath(
  listingId: string,
  file: File
): string | null {
  const extension = getListingImageExtension(file);

  if (!extension) {
    return null;
  }

  return `${listingId}/${crypto.randomUUID()}.${extension}`;
}

export async function uploadListingImageFile(
  supabase: ListingImageQueryClient,
  storagePath: string,
  file: File
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(LISTING_IMAGES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

  return !error;
}

export async function removeListingImageFiles(
  supabase: ListingImageQueryClient,
  storagePaths: string[]
): Promise<boolean> {
  const safeStoragePaths = storagePaths
    .map((path) => path.trim())
    .filter(Boolean);

  if (safeStoragePaths.length === 0) {
    return true;
  }

  const { error } = await supabase.storage
    .from(LISTING_IMAGES_BUCKET)
    .remove(safeStoragePaths);

  return !error;
}
