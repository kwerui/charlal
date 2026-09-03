import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMessageDateTime } from '../src/lib/messageDateFormatting.js';

test('message dates format Tuvan deterministically', () => {
  assert.equal(
    formatMessageDateTime(
      '2026-08-28T12:00:00.000Z',
      'tyv',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }
    ),
    '2026ч Авг. 28'
  );
});

test('message dates format Russian deterministically', () => {
  const value = '2026-08-28T12:00:00.000Z';
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  };

  assert.equal(
    formatMessageDateTime(value, 'ru', options),
    new Intl.DateTimeFormat('ru-RU', options).format(new Date(value))
  );
});

test('message times are locale-independent', () => {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  };

  assert.equal(
    formatMessageDateTime(
      '2026-08-28T18:07:00.000Z',
      'tyv',
      options
    ),
    '18:07'
  );

  assert.equal(
    formatMessageDateTime(
      '2026-08-28T18:07:00.000Z',
      'ru',
      options
    ),
    '18:07'
  );
});

test('invalid message dates are preserved', () => {
  assert.equal(
    formatMessageDateTime(
      'invalid-date',
      'tyv',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }
    ),
    'invalid-date'
  );
});
