import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMessageDateTime,
  getMessageDateFormattingLocale,
} from '../src/lib/messageDateFormatting.js';

test('message dates use the requested app locale when supported', () => {
  assert.equal(getMessageDateFormattingLocale('ru'), 'ru');
});

test('message dates fall back to Russian instead of the browser locale', () => {
  const value = '2026-08-29T13:12:00.000Z';
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  };

  assert.equal(getMessageDateFormattingLocale('zz-ZZ'), 'ru');
  assert.equal(
    formatMessageDateTime(value, 'zz-ZZ', options),
    new Intl.DateTimeFormat('ru', options).format(new Date(value))
  );
});
