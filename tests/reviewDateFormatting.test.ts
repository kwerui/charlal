import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatReviewDate,
  getReviewDateFormattingLocale,
} from '../src/lib/reviewDateFormatting.js';

test('review dates use the requested app locale when supported', () => {
  assert.equal(getReviewDateFormattingLocale('ru'), 'ru');
});

test('review dates fall back to Russian instead of the browser locale', () => {
  const value = '2026-08-29T13:12:00.000Z';
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  assert.equal(getReviewDateFormattingLocale('zz-ZZ'), 'ru');
  assert.equal(
    formatReviewDate(value, 'zz-ZZ'),
    new Intl.DateTimeFormat('ru', options).format(new Date(value))
  );
});
