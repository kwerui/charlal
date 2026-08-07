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

function isMissingOrDeniedResponse(errorCode: string | undefined): boolean {
  return errorCode === 'PGRST116' || errorCode === '42501';
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
    listing: databaseRowToListing(data),
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
    listing: databaseRowToListing(data),
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
    listings: databaseRowsToListings(data),
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
    listing: databaseRowToListing(data),
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
    listing: databaseRowToListing(data),
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
