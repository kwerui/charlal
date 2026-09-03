export const SELLER_REVIEW_TAGS = [
  'satisfied',
  'friendly_seller',
  'good_communication',
  'quick_handover',
  'fair_price',
  'not_satisfied',
  'poor_communication',
  'handover_issue',
] as const;

export const MAX_SELLER_REVIEW_TAGS = 3;

export type SellerReviewTag = (typeof SELLER_REVIEW_TAGS)[number];

const SELLER_REVIEW_TAG_SET = new Set<string>(SELLER_REVIEW_TAGS);

export function isSellerReviewTag(value: unknown): value is SellerReviewTag {
  return typeof value === 'string' && SELLER_REVIEW_TAG_SET.has(value);
}

export function parseSellerReviewTags(value: unknown): SellerReviewTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags: SellerReviewTag[] = [];
  const seenTags = new Set<SellerReviewTag>();

  for (const tag of value) {
    if (!isSellerReviewTag(tag) || seenTags.has(tag)) {
      continue;
    }

    tags.push(tag);
    seenTags.add(tag);

    if (tags.length >= MAX_SELLER_REVIEW_TAGS) {
      break;
    }
  }

  return tags;
}
