'use server';

import type { ListingStatus } from '@/data/listings';
import { isListingStatus } from '@/data/listings';
import {
  PUBLIC_DATABASE_LISTING_SELECT_COLUMNS,
  isPublicDatabaseListingRow,
  publicDatabaseRowToOwnedListing,
} from '@/lib/listingDatabaseTypes';
import { getCurrentUserResult } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { revalidateListingMutationRoutes } from '@/app/account/listings/[id]/edit/actions';

export type UpdateListingStatusResult =
  | {
      ok: true;
      listingId: string;
      status: ListingStatus;
      transactionId?: string;
      updatedAt?: string;
    }
  | {
      ok: false;
      reason: 'unauthenticated' | 'invalid-status' | 'not-owned' | 'database-unavailable';
    };

export async function updateListingStatusAction(input: {
  listingId: string;
  status: string;
  buyerId?: string | null;
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

  const safeBuyerId = input.buyerId?.trim() || null;

  if (input.status === 'sold' && safeBuyerId) {
    const { data: transactionId, error: saleError } = await supabase.rpc(
      'record_completed_listing_sale',
      {
        p_listing_id: safeListingId,
        p_buyer_id: safeBuyerId,
      }
    );

    if (saleError || typeof transactionId !== 'string') {
      return { ok: false, reason: 'database-unavailable' };
    }

    const { data, error } = await supabase
      .from('listings')
      .select(PUBLIC_DATABASE_LISTING_SELECT_COLUMNS)
      .eq('id', safeListingId)
      .maybeSingle();

    if (error || !data || !isPublicDatabaseListingRow(data)) {
      return { ok: false, reason: 'database-unavailable' };
    }

    const listing = publicDatabaseRowToOwnedListing(data, authResult.user.id);

    await revalidateListingMutationRoutes({ listingId: safeListingId });

    return {
      ok: true,
      listingId: safeListingId,
      status: listing.status || 'sold',
      transactionId,
      updatedAt: listing.updatedAt,
    };
  }

  const { data, error } = await supabase
    .from('listings')
    .update({ status: input.status })
    .eq('id', safeListingId)
    .select(PUBLIC_DATABASE_LISTING_SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  if (!data) {
    return { ok: false, reason: 'not-owned' };
  }

  if (!isPublicDatabaseListingRow(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const listing = publicDatabaseRowToOwnedListing(data, authResult.user.id);

  await revalidateListingMutationRoutes({ listingId: safeListingId });

  return {
    ok: true,
    listingId: safeListingId,
    status: listing.status || 'active',
    updatedAt: listing.updatedAt,
  };
}
