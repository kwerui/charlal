import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseSellerReviewTags,
  type SellerReviewTag,
} from '@/lib/reviewTags';

export type SaleBuyerCandidate = {
  buyerId: string;
  displayName: string;
  publicSlug: string;
  avatarPath: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
  lastMessageAt: string;
};

export type RecordedListingTransaction = {
  id: string;
  buyerId: string;
  listingId: string | null;
  completedAt: string;
};

export type ReviewableTransaction = {
  transactionId: string;
  sellerId: string;
  sellerDisplayName: string;
  sellerPublicSlug: string;
  sellerAvatarPath: string | null;
  sellerAvatarFocusX: number;
  sellerAvatarFocusY: number;
  sellerAvatarZoom: number;
  listingId: string | null;
  listingTitleSnapshot: string;
  completedAt: string;
  reviewId: string | null;
  rating: number | null;
  reviewTags: SellerReviewTag[];
  reviewCreatedAt: string | null;
  reviewUpdatedAt: string | null;
};

export type SellerReviewSummary = {
  averageRating: number | null;
  reviewCount: number;
};

export type PublicSellerReview = {
  reviewId: string;
  rating: number;
  reviewTags: SellerReviewTag[];
  reviewCreatedAt: string;
  reviewUpdatedAt: string;
  listingTitleSnapshot: string;
  completedAt: string;
  buyerDisplayName: string;
  buyerPublicSlug: string;
  buyerAvatarPath: string | null;
  buyerAvatarFocusX: number;
  buyerAvatarFocusY: number;
  buyerAvatarZoom: number;
};

type SaleBuyerCandidateRow = {
  buyer_id: string;
  display_name: string;
  public_slug: string;
  avatar_path: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
  last_message_at: string;
};

type RecordedListingTransactionRow = {
  id: string;
  buyer_id: string;
  listing_id: string | null;
  completed_at: string;
};

type ReviewableTransactionRow = {
  transaction_id: string;
  seller_id: string;
  seller_display_name: string;
  seller_public_slug: string;
  seller_avatar_path: string | null;
  seller_avatar_focus_x: number;
  seller_avatar_focus_y: number;
  seller_avatar_zoom: number;
  listing_id: string | null;
  listing_title_snapshot: string;
  completed_at: string;
  review_id: string | null;
  rating: number | null;
  review_tags: unknown;
  review_created_at: string | null;
  review_updated_at: string | null;
};

type SellerReviewSummaryRow = {
  average_rating: number | null;
  review_count: number;
};

type PublicSellerReviewRow = {
  review_id: string;
  rating: number;
  review_tags: unknown;
  review_created_at: string;
  review_updated_at: string;
  listing_title_snapshot: string;
  completed_at: string;
  buyer_display_name: string;
  buyer_public_slug: string;
  buyer_avatar_path: string | null;
  buyer_avatar_focus_x: number;
  buyer_avatar_focus_y: number;
  buyer_avatar_zoom: number;
};

type ReviewsSupabaseClient = Pick<SupabaseClient, 'from' | 'rpc'>;

function isSaleBuyerCandidateRow(value: unknown): value is SaleBuyerCandidateRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof SaleBuyerCandidateRow, unknown>>;

  return (
    typeof row.buyer_id === 'string' &&
    typeof row.display_name === 'string' &&
    typeof row.public_slug === 'string' &&
    (row.avatar_path === null || typeof row.avatar_path === 'string') &&
    typeof row.avatar_focus_x === 'number' &&
    typeof row.avatar_focus_y === 'number' &&
    typeof row.avatar_zoom === 'number' &&
    typeof row.last_message_at === 'string'
  );
}

function isRecordedListingTransactionRow(
  value: unknown
): value is RecordedListingTransactionRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<
    Record<keyof RecordedListingTransactionRow, unknown>
  >;

  return (
    typeof row.id === 'string' &&
    typeof row.buyer_id === 'string' &&
    (row.listing_id === null || typeof row.listing_id === 'string') &&
    typeof row.completed_at === 'string'
  );
}

function isReviewableTransactionRow(
  value: unknown
): value is ReviewableTransactionRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof ReviewableTransactionRow, unknown>>;

  return (
    typeof row.transaction_id === 'string' &&
    typeof row.seller_id === 'string' &&
    typeof row.seller_display_name === 'string' &&
    typeof row.seller_public_slug === 'string' &&
    (row.seller_avatar_path === null ||
      typeof row.seller_avatar_path === 'string') &&
    typeof row.seller_avatar_focus_x === 'number' &&
    typeof row.seller_avatar_focus_y === 'number' &&
    typeof row.seller_avatar_zoom === 'number' &&
    (row.listing_id === null || typeof row.listing_id === 'string') &&
    typeof row.listing_title_snapshot === 'string' &&
    typeof row.completed_at === 'string' &&
    (row.review_id === null || typeof row.review_id === 'string') &&
    (row.rating === null || typeof row.rating === 'number') &&
    (row.review_created_at === null ||
      typeof row.review_created_at === 'string') &&
    (row.review_updated_at === null ||
      typeof row.review_updated_at === 'string')
  );
}

function isSellerReviewSummaryRow(value: unknown): value is SellerReviewSummaryRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof SellerReviewSummaryRow, unknown>>;

  return (
    (row.average_rating === null || typeof row.average_rating === 'number') &&
    typeof row.review_count === 'number'
  );
}

function isPublicSellerReviewRow(value: unknown): value is PublicSellerReviewRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof PublicSellerReviewRow, unknown>>;

  return (
    typeof row.review_id === 'string' &&
    typeof row.rating === 'number' &&
    typeof row.review_created_at === 'string' &&
    typeof row.review_updated_at === 'string' &&
    typeof row.listing_title_snapshot === 'string' &&
    typeof row.completed_at === 'string' &&
    typeof row.buyer_display_name === 'string' &&
    typeof row.buyer_public_slug === 'string' &&
    (row.buyer_avatar_path === null ||
      typeof row.buyer_avatar_path === 'string') &&
    typeof row.buyer_avatar_focus_x === 'number' &&
    typeof row.buyer_avatar_focus_y === 'number' &&
    typeof row.buyer_avatar_zoom === 'number'
  );
}

export async function listSaleBuyerCandidates(
  supabase: ReviewsSupabaseClient,
  listingId: string
): Promise<SaleBuyerCandidate[]> {
  const safeListingId = listingId.trim();

  if (!safeListingId) {
    return [];
  }

  const { data, error } = await supabase.rpc(
    'list_listing_sale_buyer_candidates',
    {
      p_listing_id: safeListingId,
    }
  );

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.filter(isSaleBuyerCandidateRow).map((row) => ({
    buyerId: row.buyer_id,
    displayName: row.display_name,
    publicSlug: row.public_slug,
    avatarPath: row.avatar_path,
    avatarFocusX: row.avatar_focus_x,
    avatarFocusY: row.avatar_focus_y,
    avatarZoom: row.avatar_zoom,
    lastMessageAt: row.last_message_at,
  }));
}

export async function getRecordedListingTransactionForListing(
  supabase: ReviewsSupabaseClient,
  listingId: string
): Promise<RecordedListingTransaction | null> {
  const safeListingId = listingId.trim();

  if (!safeListingId) {
    return null;
  }

  const { data, error } = await supabase
    .from('completed_listing_transactions')
    .select('id,buyer_id,listing_id,completed_at')
    .eq('listing_id', safeListingId)
    .maybeSingle();

  if (error || !isRecordedListingTransactionRow(data)) {
    return null;
  }

  return {
    id: data.id,
    buyerId: data.buyer_id,
    listingId: data.listing_id,
    completedAt: data.completed_at,
  };
}

export async function listMyReviewableTransactions(
  supabase: ReviewsSupabaseClient
): Promise<ReviewableTransaction[]> {
  const { data, error } = await supabase.rpc('list_my_reviewable_transactions');

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.filter(isReviewableTransactionRow).map((row) => ({
    transactionId: row.transaction_id,
    sellerId: row.seller_id,
    sellerDisplayName: row.seller_display_name,
    sellerPublicSlug: row.seller_public_slug,
    sellerAvatarPath: row.seller_avatar_path,
    sellerAvatarFocusX: row.seller_avatar_focus_x,
    sellerAvatarFocusY: row.seller_avatar_focus_y,
    sellerAvatarZoom: row.seller_avatar_zoom,
    listingId: row.listing_id,
    listingTitleSnapshot: row.listing_title_snapshot,
    completedAt: row.completed_at,
    reviewId: row.review_id,
    rating: row.rating,
    reviewTags: parseSellerReviewTags(row.review_tags),
    reviewCreatedAt: row.review_created_at,
    reviewUpdatedAt: row.review_updated_at,
  }));
}

export async function getSellerReviewSummary(
  supabase: ReviewsSupabaseClient,
  publicSlug: string
): Promise<SellerReviewSummary> {
  const { data, error } = await supabase.rpc('get_seller_review_summary', {
    p_public_slug: publicSlug.trim(),
  });

  const rows = Array.isArray(data) ? data : [];
  const row = rows[0];

  if (error || !isSellerReviewSummaryRow(row)) {
    return {
      averageRating: null,
      reviewCount: 0,
    };
  }

  return {
    averageRating: row.average_rating,
    reviewCount: row.review_count,
  };
}

export async function listPublicSellerReviews(
  supabase: ReviewsSupabaseClient,
  publicSlug: string,
  limit: number
): Promise<PublicSellerReview[]> {
  const { data, error } = await supabase.rpc('list_public_seller_reviews', {
    p_public_slug: publicSlug.trim(),
    p_limit: limit,
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.filter(isPublicSellerReviewRow).map((row) => ({
    reviewId: row.review_id,
    rating: row.rating,
    reviewTags: parseSellerReviewTags(row.review_tags),
    reviewCreatedAt: row.review_created_at,
    reviewUpdatedAt: row.review_updated_at,
    listingTitleSnapshot: row.listing_title_snapshot,
    completedAt: row.completed_at,
    buyerDisplayName: row.buyer_display_name,
    buyerPublicSlug: row.buyer_public_slug,
    buyerAvatarPath: row.buyer_avatar_path,
    buyerAvatarFocusX: row.buyer_avatar_focus_x,
    buyerAvatarFocusY: row.buyer_avatar_focus_y,
    buyerAvatarZoom: row.buyer_avatar_zoom,
  }));
}
