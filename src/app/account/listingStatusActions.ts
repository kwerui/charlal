'use server';

import type { ListingStatus } from '@/data/listings';
import { isListingStatus } from '@/data/listings';
import {
  DATABASE_LISTING_SELECT_COLUMNS,
  databaseRowToListing,
  isDatabaseListingRow,
} from '@/lib/listingDatabaseTypes';
import { getCurrentUserResult } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { revalidateListingMutationRoutes } from '@/app/account/listings/[id]/edit/actions';

export type UpdateListingStatusResult =
  | {
      ok: true;
      listingId: string;
      status: ListingStatus;
      updatedAt?: string;
    }
  | {
      ok: false;
      reason: 'unauthenticated' | 'invalid-status' | 'not-owned' | 'database-unavailable';
    };

export async function updateListingStatusAction(input: {
  listingId: string;
  status: string;
}): Promise<UpdateListingStatusResult> {
  const safeListingId = input.listingId.trim();

  if (!safeListingId || /^\d+$/.test(safeListingId)) {
    return { ok: false, reason: 'not-owned' };
  }

  if (!isListingStatus(input.status)) {
    return { ok: false, reason: 'invalid-status' };
  }

  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .update({ status: input.status })
    .eq('id', safeListingId)
    .eq('owner_id', authResult.user.id)
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  if (!data) {
    return { ok: false, reason: 'not-owned' };
  }

  if (!isDatabaseListingRow(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const listing = databaseRowToListing(data);

  await revalidateListingMutationRoutes({ listingId: safeListingId });

  return {
    ok: true,
    listingId: safeListingId,
    status: listing.status || 'active',
    updatedAt: listing.updatedAt,
  };
}
