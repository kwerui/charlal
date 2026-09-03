import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidAuthEmail } from '../src/lib/auth/types.js';

test('auth email validation accepts ordinary email addresses', () => {
  assert.equal(isValidAuthEmail('buyer@example.com'), true);
  assert.equal(isValidAuthEmail('  seller.name+tag@example.co  '), true);
});

test('auth email validation rejects values browser type=email would reject', () => {
  assert.equal(isValidAuthEmail(''), false);
  assert.equal(isValidAuthEmail('not-an-email'), false);
  assert.equal(isValidAuthEmail('missing-domain@'), false);
  assert.equal(isValidAuthEmail('@missing-local.test'), false);
  assert.equal(isValidAuthEmail('has whitespace@example.com'), false);
});
