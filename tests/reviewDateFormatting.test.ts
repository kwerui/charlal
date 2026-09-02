import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReviewDate } from '../src/lib/reviewDateFormatting.js';

test('review dates format Tuvan deterministically', () => {
  assert.equal(
    formatReviewDate('2026-08-29T13:12:00.000Z', 'tyv'),
    '2026ч Авг. 29'
  );
});

test('review dates format Russian deterministically', () => {
  const value = '2026-08-29T13:12:00.000Z';

  assert.equal(
    formatReviewDate(value, 'ru'),
    new Intl.DateTimeFormat('ru-RU', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(value))
  );
});

test('invalid review dates are preserved', () => {
  assert.equal(formatReviewDate('invalid-date', 'tyv'), 'invalid-date');
});
