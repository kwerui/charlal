'use server';

import { revalidatePath } from 'next/cache';
import type { ListingFavoriteReference } from '@/lib/listingFavoriteKeys';
import {
  removeListingFavorite,
  saveListingFavorite,
  type ListingFavoriteMutationResult,
} from '@/lib/supabase/listingFavorites';

export async function saveFavoriteAction(
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  const result = await saveListingFavorite(reference);

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

  if (result.ok) {
    revalidatePath('/');
    revalidatePath('/search');
    revalidatePath('/account/favorites');
    revalidatePath(`/listing/${reference.listingId}`);
  }

  return result;
}
