'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type SellerResponseActionResult =
  | {
      ok: true;
      responseId?: string;
    }
  | {
      ok: false;
      reason: 'invalid-input' | 'database-unavailable';
    };

function getSafeBody(formData: FormData): string {
  return String(formData.get('body') || '').trim();
}

function getSafeReviewId(formData: FormData): string {
  return String(formData.get('reviewId') || '').trim();
}

function getSafeSlug(formData: FormData): string {
  return String(formData.get('sellerSlug') || '').trim();
}

export async function saveSellerResponseAction(
  formData: FormData
): Promise<SellerResponseActionResult> {
  const reviewId = getSafeReviewId(formData);
  const sellerSlug = getSafeSlug(formData);
  const body = getSafeBody(formData);

  if (!reviewId || !sellerSlug || !body || body.length > 1200) {
    return { ok: false, reason: 'invalid-input' };
  }

  const supabase = await createClient();
  const { data: existingResponse } = await supabase
    .from('seller_review_responses')
    .select('id')
    .eq('review_id', reviewId)
    .maybeSingle();

  const result = existingResponse
    ? await supabase
        .from('seller_review_responses')
        .update({ body })
        .eq('id', existingResponse.id)
        .select('id')
        .single()
    : await supabase
        .from('seller_review_responses')
        .insert({ review_id: reviewId, body })
        .select('id')
        .single();

  if (result.error || !result.data || typeof result.data.id !== 'string') {
    return { ok: false, reason: 'database-unavailable' };
  }

  revalidatePath(`/seller/${sellerSlug}`);
  revalidatePath(`/seller/${sellerSlug}/reviews`);

  return { ok: true, responseId: result.data.id };
}

export async function deleteSellerResponseAction(
  formData: FormData
): Promise<SellerResponseActionResult> {
  const responseId = String(formData.get('responseId') || '').trim();
  const sellerSlug = getSafeSlug(formData);

  if (!responseId || !sellerSlug) {
    return { ok: false, reason: 'invalid-input' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('seller_review_responses')
    .delete()
    .eq('id', responseId);

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  revalidatePath(`/seller/${sellerSlug}`);
  revalidatePath(`/seller/${sellerSlug}/reviews`);

  return { ok: true };
}
