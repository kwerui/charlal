import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSellerReviewTag,
  MAX_SELLER_REVIEW_TAGS,
  parseSellerReviewTags,
  SELLER_REVIEW_TAGS,
} from '../src/lib/reviewTags.js';

test('seller review tags recognize only canonical stable ids', () => {
  assert.equal(isSellerReviewTag('satisfied'), true);
  assert.equal(isSellerReviewTag('friendly_seller'), true);
  assert.equal(isSellerReviewTag('translated label'), false);
  assert.equal(isSellerReviewTag(''), false);
  assert.equal(isSellerReviewTag(null), false);
});

test('seller review tags parse defensively at the TypeScript boundary', () => {
  assert.deepEqual(
    parseSellerReviewTags([
      'satisfied',
      'satisfied',
      'unknown_tag',
      'fair_price',
      'good_communication',
      'quick_handover',
    ]),
    ['satisfied', 'fair_price', 'good_communication']
  );
});

test('seller review tag assumptions stay aligned with product rules', () => {
  assert.equal(MAX_SELLER_REVIEW_TAGS, 3);
  assert.equal(SELLER_REVIEW_TAGS.length, 8);
});
