'use server';

import { revalidatePath } from 'next/cache';
import type { ListingFavoriteReference } from '@/lib/listingFavoriteKeys';
import {
  removeListingFavorite,
  saveListingFavorite,
  type ListingFavoriteMutationResult,
} from '@/lib/supabase/listingFavorites';

function logFavoriteActionFailure(
  action: 'save' | 'remove',
  reference: ListingFavoriteReference,
  result: ListingFavoriteMutationResult
): void {
  if (process.env.NODE_ENV !== 'production' && !result.ok) {
    console.error(`Favorite ${action} action failed.`, {
      reason: result.reason,
      reference: {
        source: reference.source,
        listingId: reference.listingId,
      },
    });
  }
}

export async function saveFavoriteAction(
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  const result = await saveListingFavorite(reference);

  logFavoriteActionFailure('save', reference, result);

  if (result.ok) {
    revalidatePath('/');
    revalidatePath('/search');
    revalidatePath('/account/favorites');
    revalidatePath(`/listing/${reference.listingId}`);
  }

  return result;
}

export async function removeFavoriteAction(
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  const result = await removeListingFavorite(reference);

  logFavoriteActionFailure('remove', reference, result);

  if (result.ok) {
    revalidatePath('/');
    revalidatePath('/search');
    revalidatePath('/account/favorites');
    revalidatePath(`/listing/${reference.listingId}`);
  }

  return result;
}
