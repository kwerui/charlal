import type {
  Listing,
  ListingModerationState,
  ListingStatus,
} from '@/data/listings';
import { isListingModerationState, isListingStatus } from '@/data/listings';
import { getListingPlaceholder } from '@/lib/listingPlaceholders';
import type { ValidatedListingFormValues } from '@/lib/listingFormValidation';

export const DATABASE_LISTING_SELECT_COLUMNS =
  'id, owner_id, seller_display_name, title, description, price, location, category, subcategory, transaction_type, property_type, marketplace_type, status, moderation_state, created_at, updated_at';

export const PUBLIC_DATABASE_LISTING_SELECT_COLUMNS =
  'id, seller_display_name, title, description, price, location, category, subcategory, transaction_type, property_type, marketplace_type, status, created_at, updated_at';

export type DatabaseListingRow = {
  id: string;
  owner_id: string;
  seller_display_name: string;
  title: string;
  description: string;
  price: number | string;
  location: string;
  category: string;
  subcategory: string;
  transaction_type: string | null;
  property_type: string | null;
  marketplace_type: string | null;
  status: ListingStatus;
  moderation_state?: ListingModerationState;
  created_at: string;
  updated_at: string;
};

export type PublicDatabaseListingRow = Omit<DatabaseListingRow, 'owner_id'>;

export type DatabaseListingInsert = {
  id?: string;
  title: string;
  description: string;
  price: number;
  location: string;
  category: string;
  subcategory: string;
  transaction_type?: string | null;
  property_type?: string | null;
  marketplace_type?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DatabaseListingUpdate = {
  title: string;
  description: string;
  price: number;
  location: string;
  category: string;
  subcategory: string;
  transaction_type: string | null;
  property_type: string | null;
  marketplace_type: string | null;
};

export function isDatabaseListingRow(value: unknown): value is DatabaseListingRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof DatabaseListingRow, unknown>>;
  const price =
    typeof row.price === 'number'
      ? row.price
      : typeof row.price === 'string'
      ? Number(row.price)
      : Number.NaN;

  return (
    typeof row.id === 'string' &&
    typeof row.owner_id === 'string' &&
    typeof row.seller_display_name === 'string' &&
    typeof row.title === 'string' &&
    typeof row.description === 'string' &&
    Number.isFinite(price) &&
    typeof row.location === 'string' &&
    typeof row.category === 'string' &&
    typeof row.subcategory === 'string' &&
    (row.transaction_type === null || typeof row.transaction_type === 'string') &&
    (row.property_type === null || typeof row.property_type === 'string') &&
    (row.marketplace_type === null || typeof row.marketplace_type === 'string') &&
    isListingStatus(row.status) &&
    (row.moderation_state === undefined ||
      isListingModerationState(row.moderation_state)) &&
    typeof row.created_at === 'string' &&
    typeof row.updated_at === 'string'
  );
}

export function isDatabaseListingRowArray(value: unknown): value is DatabaseListingRow[] {
  return Array.isArray(value) && value.every(isDatabaseListingRow);
}

export function isPublicDatabaseListingRow(
  value: unknown
): value is PublicDatabaseListingRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof PublicDatabaseListingRow, unknown>>;
  const price =
    typeof row.price === 'number'
      ? row.price
      : typeof row.price === 'string'
      ? Number(row.price)
      : Number.NaN;

  return (
    typeof row.id === 'string' &&
    typeof row.seller_display_name === 'string' &&
    typeof row.title === 'string' &&
    typeof row.description === 'string' &&
    Number.isFinite(price) &&
    typeof row.location === 'string' &&
    typeof row.category === 'string' &&
    typeof row.subcategory === 'string' &&
    (row.transaction_type === null || typeof row.transaction_type === 'string') &&
    (row.property_type === null || typeof row.property_type === 'string') &&
    (row.marketplace_type === null || typeof row.marketplace_type === 'string') &&
    isListingStatus(row.status) &&
    (row.moderation_state === undefined ||
      isListingModerationState(row.moderation_state)) &&
    typeof row.created_at === 'string' &&
    typeof row.updated_at === 'string'
  );
}

export function isPublicDatabaseListingRowArray(
  value: unknown
): value is PublicDatabaseListingRow[] {
  return Array.isArray(value) && value.every(isPublicDatabaseListingRow);
}

function toDateLabel(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function hasMeaningfulUpdate(createdAt: string, updatedAt: string): boolean {
  const createdTime = Date.parse(createdAt);
  const updatedTime = Date.parse(updatedAt);

  if (!Number.isFinite(createdTime) || !Number.isFinite(updatedTime)) {
    return updatedAt !== createdAt;
  }

  return updatedTime > createdTime + 999;
}

export function databaseRowToListing(row: DatabaseListingRow): Listing {
  const listing = publicDatabaseRowToListing(row);

  listing.ownerId = row.owner_id;

  return listing;
}

export function publicDatabaseRowToOwnedListing(
  row: PublicDatabaseListingRow,
  ownerId: string
): Listing {
  const listing = publicDatabaseRowToListing(row);

  listing.ownerId = ownerId;
  listing.isOwnedByViewer = true;

  return listing;
}

export function markListingOwnedByViewer(listing: Listing): Listing {
  return {
    ...listing,
    isOwnedByViewer: true,
  };
}

export function publicDatabaseRowToListing(row: PublicDatabaseListingRow): Listing {
  const listingData = {
    categorySlug: row.category,
    subcategorySlug: row.subcategory,
    propertyType: row.property_type as Listing['propertyType'] | undefined,
    marketplaceType: row.marketplace_type || undefined,
  };
  const listing: Listing = {
    id: row.id,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    location: row.location,
    categorySlug: row.category,
    subcategorySlug: row.subcategory,
    image: getListingPlaceholder(listingData),
    sellerName: row.seller_display_name,
    datePosted: toDateLabel(row.created_at),
    status: row.status,
  };

  if (row.moderation_state) {
    listing.moderationState = row.moderation_state;
  }

  if (hasMeaningfulUpdate(row.created_at, row.updated_at)) {
    listing.updatedAt = toDateLabel(row.updated_at);
  }

  if (row.transaction_type === 'sale' || row.transaction_type === 'rent') {
    listing.transactionType = row.transaction_type;
  }

  if (
    row.property_type === 'apartments' ||
    row.property_type === 'land' ||
    row.property_type === 'commercial' ||
    row.property_type === 'storage'
  ) {
    listing.propertyType = row.property_type;
  }

  if (row.marketplace_type) {
    listing.marketplaceType = row.marketplace_type;
  }

  return listing;
}

export function databaseRowsToListings(rows: DatabaseListingRow[]): Listing[] {
  return rows.map(databaseRowToListing);
}

export function publicDatabaseRowsToListings(
  rows: PublicDatabaseListingRow[]
): Listing[] {
  return rows.map(publicDatabaseRowToListing);
}

export function listingFormValuesToDatabaseInsert(
  values: ValidatedListingFormValues
): DatabaseListingInsert {
  return {
    title: values.title,
    description: values.description,
    price: values.price,
    location: values.location,
    category: values.categorySlug,
    subcategory: values.subcategorySlug,
    transaction_type: values.transactionType || null,
    property_type: values.propertyType || null,
    marketplace_type: values.marketplaceType || null,
  };
}

export function listingFormValuesToDatabaseUpdate(
  values: ValidatedListingFormValues
): DatabaseListingUpdate {
  return {
    title: values.title,
    description: values.description,
    price: values.price,
    location: values.location,
    category: values.categorySlug,
    subcategory: values.subcategorySlug,
    transaction_type: values.transactionType || null,
    property_type: values.propertyType || null,
    marketplace_type: values.marketplaceType || null,
  };
}
